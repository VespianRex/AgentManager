import { describe, it } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentManagerPlugin } from "../src/plugin.js";

const SAMPLE = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;

describe("plugin entrypoint", () => {
  it("exports a plugin with a tool and command hook", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-"));
    const configPath = path.join(tmp, "opencode.json");
    await fs.writeFile(configPath, SAMPLE, "utf8");

    const plugin: any = await AgentManagerPlugin({ directory: tmp } as any);
    assert.ok(plugin.tool?.agent_manager);
    assert.ok(typeof plugin["tui.command.execute"] === "function");

    const raw = await (plugin.tool.agent_manager.execute as any)({}, {
      sessionID: "test",
      messageID: "1",
      agent: "test",
      directory: tmp,
      worktree: tmp,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    });
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    assert.strictEqual(result?.message, "Agent Manager loaded configuration.");
    assert.strictEqual(result?.configPath, configPath);
    assert.strictEqual(result?.summary.agentCount, 1);
  });
});
