import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findConfigFiles, loadConfig, saveConfig, getConfigCache, writeJsoncFile, readJsoncFile } from "../src/config.js";
import type { AgentManagerDocument } from "../src/types.js";

// Save and restore process.env.HOME to prevent pollution from other test files
// (e.g. config-security.test.ts modifies it and never restores)
let originalHome: string | undefined;

beforeEach(async () => {
  originalHome = process.env.HOME;
  // Ensure clean cache state before each test
  await getConfigCache().clear();
});

afterEach(() => {
  // Restore original HOME after each test - always, even on test failure
  try {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  } catch {
    // Ensure HOME is always restored on error
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  }
});

const SAMPLE_CONFIG = `{
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`;

const OH_MY_OPENCODE_CONFIG = `{
  // Agent configuration for Oh My OpenCode
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano", "fallback_models": ["opencode/gpt-4o-mini"] },
    "oracle": { "model": "opencode/claude-sonnet-4", "fallback_models": ["opencode/claude-haiku-4"] }
  },
  "categories": {
    "quick": { "model": "opencode/gpt-5-nano" },
    "reasoning": { "model": "opencode/claude-sonnet-4" }
  }
}`;

describe("config cache invalidation", () => {
  it("invalidates cache after saveConfig so subsequent reads get fresh content", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-cache-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_CONFIG, "utf8");

    // Find and load config (this caches it)
    const configs = await findConfigFiles(tmp);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // First load - populates cache
    const { document: doc1 } = await loadConfig(config);
    expect(doc1.agents?.explore).toEqual({ model: "opencode/gpt-5-nano" });

    // Verify cache is populated by checking internal state
    const configCache = getConfigCache();
    const cachedBefore = await configCache.get(config.path);
    expect(cachedBefore).toBeDefined();
    expect(cachedBefore?.document.agents?.explore).toEqual({ model: "opencode/gpt-5-nano" });

    // Modify and save - this should invalidate the cache
    const modifiedDoc: AgentManagerDocument = {
      agents: {
        explore: { model: "opencode/gpt-5-mini" }
      }
    };
    await saveConfig(config, modifiedDoc);

    // Cache should be invalidated after save
    const cachedAfter = await getConfigCache().get(config.path);
    expect(cachedAfter).toBeUndefined();

    // Next load should read fresh file content, not stale cache
    const { document: doc2 } = await loadConfig(config);
    expect(doc2.agents?.explore).toEqual({ model: "opencode/gpt-5-mini" });
  });

  it("ensures cache invalidation prevents stale data on rapid save-load cycles", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-rapid-"));
    const filePath = path.join(tmp, "opencode.json");
    await fs.writeFile(filePath, SAMPLE_CONFIG, "utf8");

    const configs = await findConfigFiles(tmp);
    expect(configs.length).toBeGreaterThan(0);
    const config = configs[0];

    // Rapid save-load cycle
    for (let i = 0; i < 3; i++) {
      const newModel = `opencode/model-v${i}`;

      // Save new config
      await saveConfig(config, {
        agents: {
          explore: { model: newModel }
        }
      });

      // Load immediately after save
      const { document } = await loadConfig(config);
      expect(document.agents?.explore).toEqual({ model: newModel });
    }
  });

  it("invalidates cache after writeJsoncFile so subsequent readJsoncFile gets fresh content", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-write-"));
    const filePath = path.join(tmp, "oh-my-opencode.json");
    await fs.mkdir(path.join(tmp, ".opencode"));
    const ohMyPath = path.join(tmp, ".opencode", "oh-my-opencode.json");
    await fs.writeFile(ohMyPath, OH_MY_OPENCODE_CONFIG, "utf8");

    const configs = await findConfigFiles(tmp);
    const ohMyConfig = configs.find(c => c.type === "oh-my-opencode");
    expect(ohMyConfig).toBeDefined();

    // First load populates cache
    const { document: doc1 } = await loadConfig(ohMyConfig!);
    expect(doc1.agents?.explore).toEqual({ model: "opencode/gpt-5-nano", fallback_models: ["opencode/gpt-4o-mini"] });
    expect(doc1.categories?.quick).toEqual({ model: "opencode/gpt-5-nano" });

    const configCache = getConfigCache();
    const cachedBefore = await configCache.get(ohMyConfig!.path);
    expect(cachedBefore).toBeDefined();

    // Given: write directly via writeJsoncFile (bypasses saveConfig)
    const updatedDoc = {
      agents: {
        explore: { model: "opencode/gpt-5-mini", fallback_models: ["opencode/gpt-4o"] },
        oracle: { model: "opencode/claude-sonnet-4", fallback_models: ["opencode/claude-haiku-4"] }
      },
      categories: {
        quick: { model: "opencode/gpt-5-mini" },
        reasoning: { model: "opencode/claude-sonnet-4" }
      }
    };
    await writeJsoncFile(ohMyConfig!.path, updatedDoc);

    // BUG: Cache should be invalidated after writeJsoncFile
    const cachedAfter = await getConfigCache().get(ohMyConfig!.path);
    expect(cachedAfter).toBeUndefined();

    // Next read should get fresh file content, not stale cache
    const fresh = await readJsoncFile(ohMyConfig!.path);
    expect(fresh.agents?.explore?.model).toBe("opencode/gpt-5-mini");
    expect(fresh.categories?.quick?.model).toBe("opencode/gpt-5-mini");
  });

  it("invalidates cache for oh-my-opencode.json after saveConfig with categories", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-ohmy-"));
    await fs.mkdir(path.join(tmp, ".opencode"));
    const ohMyPath = path.join(tmp, ".opencode", "oh-my-opencode.json");
    await fs.writeFile(ohMyPath, OH_MY_OPENCODE_CONFIG, "utf8");

    const configs = await findConfigFiles(tmp);
    const ohMyConfig = configs.find(c => c.type === "oh-my-opencode");
    expect(ohMyConfig).toBeDefined();

    // Load and cache
    const { document: doc1 } = await loadConfig(ohMyConfig!);
    expect(doc1.categories?.reasoning).toEqual({ model: "opencode/claude-sonnet-4" });

    // Save with updated categories
    await saveConfig(ohMyConfig!, {
      agents: {
        explore: { model: "opencode/gpt-5-nano" },
        oracle: { model: "opencode/claude-sonnet-4" }
      },
      categories: {
        quick: { model: "opencode/gpt-5-nano" },
        reasoning: { model: "opencode/o3-mini" }
      }
    });

    // Cache must be invalidated
    const configCache = getConfigCache();
    expect(await configCache.get(ohMyConfig!.path)).toBeUndefined();

    // Fresh read reflects the update
    const { document: doc2 } = await loadConfig(ohMyConfig!);
    expect(doc2.categories?.reasoning).toEqual({ model: "opencode/o3-mini" });
  });
});
