import { describe, it } from "bun:test";
import assert from "bun:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { server as agentManagerServer } from "../src/index.js";
import { tui as agentManagerTui } from "../src/tui.js";
const SAMPLE = `{
  "agents": { "oracle": { "model": "openai/gpt-5.2" } }
}`;
describe("plugin entrypoint", () => {
    it("exports the server and tui hooks from their runtime entrypoints", () => {
        assert.ok(agentManagerServer, "expected a server export");
        assert.ok(agentManagerTui, "expected a tui export");
    });
    it("exports a plugin with a tool and command hook", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-plugin-"));
        const configPath = path.join(tmp, "opencode.json");
        await fs.writeFile(configPath, SAMPLE, "utf8");
        const plugin = await agentManagerServer({ directory: tmp });
        assert.ok(plugin.tool?.agent_manager);
        assert.ok(typeof plugin["tui.command.execute"] === "function");
        const raw = await plugin.tool.agent_manager.execute({}, {
            sessionID: "test",
            messageID: "1",
            agent: "test",
            directory: tmp,
            worktree: tmp,
            abort: new AbortController().signal,
            metadata: () => { },
            ask: async () => { },
        });
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        assert.strictEqual(result?.message, "Agent Manager loaded configuration.");
        assert.strictEqual(result?.configPath, configPath);
        assert.strictEqual(result?.summary.agentCount, 1);
    });
});
