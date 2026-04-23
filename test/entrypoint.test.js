import { describe, it } from "bun:test";
import assert from "bun:assert";
import fs from "node:fs/promises";
import path from "node:path";
describe("documented plugin entrypoints", () => {
    it("expose the server plugin and global command config", async () => {
        const repoRoot = process.cwd();
        const serverWrapper = await fs.readFile(path.join(repoRoot, ".opencode", "plugins", "agent-manager.js"), "utf8");
        const homeConfig = await fs.readFile(path.join(process.env.HOME ?? "", ".config", "opencode", "opencode.json"), "utf8");
        const commandFile = await fs.readFile(path.join(process.env.HOME ?? "", ".config", "opencode", "command", "agent-manager.md"), "utf8");
        assert.ok(serverWrapper.includes('export { server } from "./agent-manager/index.js";'));
        assert.ok(homeConfig.includes('"agent-manager"'));
        assert.ok(homeConfig.includes('Run the `agent_manager` tool with `action=inspect`'));
        assert.ok(commandFile.includes("description: Agent Manager"));
        assert.ok(commandFile.includes("# /agent-manager"));
    });
});
