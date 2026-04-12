import { describe, it } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findConfigFiles, loadConfig, saveConfig } from "../src/config.js";
const SAMPLE = `{
  // Comment is preserved
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" }
  }
}`;
describe("config module", () => {
    it("finds and loads OpenCode config files", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-"));
        const filePath = path.join(tmp, "opencode.json");
        await fs.writeFile(filePath, SAMPLE, "utf8");
        const configs = await findConfigFiles(tmp);
        assert.ok(configs.some((c) => c.path === filePath));
        const { config, document } = await loadConfig(configs[0]);
        assert.strictEqual(config.path, filePath);
        assert.deepStrictEqual(document.agents?.explore, { model: "opencode/gpt-5-nano" });
        const backupPath = await saveConfig(config, document);
        const backupContents = await fs.readFile(backupPath, "utf8");
        assert.ok(backupContents.includes("opencode/gpt-5-nano"));
    });
});
