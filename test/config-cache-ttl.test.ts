import { describe, it, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { withSandboxHome } from "./helpers/index.js";
import { readJsoncFile, clearConfigCache, CACHE_DEFAULTS } from "../src/config.js";

const SAMPLE_CONFIG = `{
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`;

describe("config cache TTL", () => {
  it("evicts stale cache entries on read", async () => {
    await withSandboxHome(async (sandbox) => {
      await clearConfigCache();
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-ttl-"));
      const filePath = path.join(tmp, "opencode.json");
      await fs.writeFile(filePath, SAMPLE_CONFIG, "utf8");

      // First load should cache
      const doc1 = await readJsoncFile(filePath);
      expect(doc1.agents?.explore?.model).toBe("opencode/gpt-5-nano");

      // Manually backdate the cache entry past TTL
      const { getConfigCache } = await import("../src/config.js");
      const configCache = getConfigCache();
      const cached = await configCache.get(filePath);
      expect(cached).toBeDefined();

      if (cached) {
        cached.ts = Date.now() - CACHE_DEFAULTS.CONFIG_CACHE_TTL_MS - 1000;
        await configCache.set(filePath, cached);
      }

      // Modify the file externally
      const modifiedConfig = `{
      "agents": {
        "explore": { "model": "opencode/gpt-5-mini" }
      }
    }`;
      await fs.writeFile(filePath, modifiedConfig, "utf8");

      // Next read should evict stale entry and read fresh file
      const doc2 = await readJsoncFile(filePath);
      expect(doc2.agents?.explore?.model).toBe("opencode/gpt-5-mini");
    });
  });

  it("respects fresh cache entries within TTL", async () => {
    await withSandboxHome(async (sandbox) => {
      await clearConfigCache();
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-ttl-fresh-"));
      const filePath = path.join(tmp, "opencode.json");
      await fs.writeFile(filePath, SAMPLE_CONFIG, "utf8");

      // First load
      const doc1 = await readJsoncFile(filePath);
      expect(doc1.agents?.explore?.model).toBe("opencode/gpt-5-nano");

      // Externally modify file
      await fs.writeFile(filePath, `{
      "agents": {
        "explore": { "model": "opencode/gpt-5-mini" }
      }
    }`, "utf8");

      // Second read - stale eviction runs but entry is fresh
      // Should return cached value since it's fresh (within TTL)
      const doc2 = await readJsoncFile(filePath);
      expect(doc2.agents?.explore?.model).toBe("opencode/gpt-5-nano");
    });
  });
});