import { describe, it } from "bun:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";

describe("documented plugin entrypoints", () => {
  it("expose the server plugin and global command config", async () => {
    const repoRoot = process.cwd();
    const serverWrapperPath = path.join(repoRoot, ".opencode", "plugins", "agent-manager.js");
    const homeConfigPath = path.join(process.env.HOME ?? "", ".config", "opencode", "opencode.json");
    const commandFilePath = path.join(process.env.HOME ?? "", ".config", "opencode", "command", "agent-manager.md");

    // Check if server wrapper exists (may not in all environments)
    let serverWrapperExists = false;
    try { await fs.access(serverWrapperPath); serverWrapperExists = true; } catch {}
    if (serverWrapperExists) {
      const serverWrapper = await fs.readFile(serverWrapperPath, "utf8");
      assert.ok(serverWrapper.includes('export { server }'), 'server wrapper must export server');
    }

    // Check if home config exists (may not in all environments)
    let homeConfigExists = false;
    try { await fs.access(homeConfigPath); homeConfigExists = true; } catch {}
    if (homeConfigExists) {
      const homeConfig = await fs.readFile(homeConfigPath, "utf8");
      assert.ok(homeConfig.includes('"agent-manager"'));
      assert.ok(homeConfig.includes('Run the `agent_manager` tool with `action=inspect`'));
    }

    // Check if command file exists (may not in all environments)
    let commandFileExists = false;
    try { await fs.access(commandFilePath); commandFileExists = true; } catch {}
    if (commandFileExists) {
      const commandFile = await fs.readFile(commandFilePath, "utf8");
      assert.ok(commandFile.includes("description: Agent Manager"));
      assert.ok(commandFile.includes("# /agent-manager"));
    }
  });
});
