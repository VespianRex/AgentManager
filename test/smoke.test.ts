import { describe, it } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findConfigFiles } from "../src/config.js";

const SAMPLE = `{
  "agents": { "explore": { "model": "opencode/gpt-5-nano" } }
}`;

describe("smoke test", () => {
  it("creates a config file and finds it", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-smoke-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");
    const configs = await findConfigFiles(tmp);
    assert.ok(configs.length >= 1);
    assert.ok(configs.some((c) => c.path === configPath));
  });
});
