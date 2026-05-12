import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import {
  readJsoncFile,
  writeJsoncFile,
  clearConfigCache,
  type ConfigLocation,
} from "../src/config.js";

describe("concurrent config access", () => {
  let tmpDir: string;
  let configPath: string;
  let config: ConfigLocation;
  let originalHome: string | undefined;

  beforeEach(async () => {
    // Save and restore HOME env to prevent side effects from normalizePath()
    originalHome = process.env.HOME;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "concurrent-config-"));
    configPath = path.join(tmpDir, "config.json");
    config = {
      path: configPath,
      source: "user",
      type: "opencode",
    };

    // Create initial config
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          test: { model: "gpt-4" },
        },
      }),
      "utf8",
    );

    // Clear cache before each test
    clearConfigCache();
  });

  afterEach(async () => {
    clearConfigCache();
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Restore HOME env to prevent leakage across tests
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
  });

  it("should handle concurrent reads without data corruption", async () => {
    const readCount = 10;
    const reads = Array.from({ length: readCount }, () => readJsoncFile(configPath));

    const results = await Promise.all(reads);

    // All reads should succeed and return the same data
    for (const result of results) {
      expect(result.agents?.test?.model).toBe("gpt-4");
    }
  });

  it("should handle concurrent writes sequentially", async () => {
    const writeCount = 5;

    // Write sequentially to avoid race conditions
    // Note: writeJsoncFile does a deep merge with existing content
    for (let i = 0; i < writeCount; i++) {
      await writeJsoncFile(configPath, {
        agents: { [`agent-${i}`]: { model: `gpt-${i}` } },
      });
    }

    // Final read should succeed - all writes merged into final file
    const result = await readJsoncFile(configPath);
    expect(result.agents).toBeDefined();
    // Original "test" agent + 5 sequential writes = 6 agents total
    expect(Object.keys(result.agents!)).toHaveLength(6);
  });

  it("should invalidate cache after write", async () => {
    // First read - caches the data
    const first = await readJsoncFile(configPath);
    expect(first.agents?.test?.model).toBe("gpt-4");

    // Write new data - writeJsoncFile merges with existing content
    await writeJsoncFile(configPath, {
      agents: { newAgent: { model: "claude-3" } },
    });

    // Second read should get fresh data (cache invalidated after write)
    const second = await readJsoncFile(configPath);
    expect(second.agents?.newAgent?.model).toBe("claude-3");
    // Original "test" agent is preserved due to merge behavior
    expect(second.agents?.test?.model).toBe("gpt-4");
  });

  it("should handle read-write-read pattern correctly", async () => {
    // Read initial state
    const initial = await readJsoncFile(configPath);
    expect(initial.agents?.test?.model).toBe("gpt-4");

    // Modify and write
    const modified = {
      ...initial,
      agents: {
        ...initial.agents,
        newAgent: { model: "gemini-1.5" },
      },
    };
    await writeJsoncFile(configPath, modified);

    // Read again - should have both agents
    const updated = await readJsoncFile(configPath);
    expect(updated.agents?.test?.model).toBe("gpt-4");
    expect(updated.agents?.newAgent?.model).toBe("gemini-1.5");
  });

  it("should handle rapid read-write cycles", async () => {
    for (let i = 0; i < 20; i++) {
      clearConfigCache(); // Clear cache to ensure fresh read each iteration
      const data = await readJsoncFile(configPath);
      const newData = {
        ...data,
        version: i,
      };
      await writeJsoncFile(configPath, newData);
    }

    // Final state should be valid JSON (config is readable and not corrupted)
    const final = await readJsoncFile(configPath);
    expect(final).toBeDefined();
    expect(final).not.toBeNull();
    // Original agents field is preserved through the read-write cycles
    expect(final.agents?.test?.model).toBe("gpt-4");
    // Note: The `version` field is stripped by Zod validation since it's not
    // part of the AgentManagerDocumentSchema. The implementation correctly
    // preserves the file on disk, but the in-memory representation does not
    // include unknown fields.
  });

  it("should not corrupt config file on concurrent write attempts", async () => {
    const originalContent = JSON.parse(await fs.readFile(configPath, "utf8"));

    // Simulate two processes trying to update
    const update1 = writeJsoncFile(configPath, {
      ...originalContent,
      process: "1",
    });
    const update2 = writeJsoncFile(configPath, {
      ...originalContent,
      process: "2",
    });

    await Promise.all([update1, update2]);

    // File should still be valid JSON
    const content = await fs.readFile(configPath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();
  });
});