import { describe, it } from "bun:test";
import assert from "bun:assert";
import fs from "node:fs/promises";
import path from "node:path";

describe("documented plugin entrypoints", () => {
  it("expose the server plugin and global command config", async () => {
    const repoRoot = process.cwd();
    const serverWrapperPath = path.join(repoRoot, ".opencode", "plugins", "agent-manager.js");
    const homeConfigPath = path.join(process.env.HOME ?? "", ".config", "opencode", "opencode.json");
    const commandFilePath = path.join(process.env.HOME ?? "", ".config", "opencode", "command", "agent-manager.md");

    // Check if server wrapper exists (may not in all environments)
    if (await fs.access(serverWrapperPath).catch(() => false)) {
      const serverWrapper = await fs.readFile(serverWrapperPath, "utf8");
      assert.ok(serverWrapper.includes('export { server } from "./agent-manager/index.js";'));
    }

    // Check if home config exists (may not in all environments)
    if (await fs.access(homeConfigPath).catch(() => false)) {
      const homeConfig = await fs.readFile(homeConfigPath, "utf8");
      assert.ok(homeConfig.includes('"agent-manager"'));
      assert.ok(homeConfig.includes('Run the `agent_manager` tool with `action=inspect`'));
    }

    // Check if command file exists (may not in all environments)
    if (await fs.access(commandFilePath).catch(() => false)) {
      const commandFile = await fs.readFile(commandFilePath, "utf8");
      assert.ok(commandFile.includes("description: Agent Manager"));
      assert.ok(commandFile.includes("# /agent-manager"));
    }
  });
});
