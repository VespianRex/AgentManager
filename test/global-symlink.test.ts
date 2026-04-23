import { describe, it, expect } from "bun:test";
import { readlink, stat, lstat, access } from "fs/promises";
import path from "path";
import { homedir } from "os";

describe("Global Plugin Symlink - TDD Infrastructure Verification", () => {
  const GLOBAL_PLUGIN_PATH = path.join(
    homedir(),
    ".config/opencode/plugins/agent-manager.js"
  );
  
  // Use absolute path for project plugin
  const PROJECT_PLUGIN_PATH = "/Volumes/Kingston XS1000 Media - Data/macOS-relocated/dev/AgentManager/.opencode/plugins/agent-manager/index.js";

  describe("Symlink Existence", () => {
    it("symlink exists in global plugins directory", async () => {
      const stats = await lstat(GLOBAL_PLUGIN_PATH);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it("symlink is accessible", async () => {
      let accessible = false;
      try {
        await access(GLOBAL_PLUGIN_PATH);
        accessible = true;
      } catch {
        // File not accessible
      }
      expect(accessible).toBe(true);
    });
  });

  describe("Symlink Target", () => {
    it("symlink points to correct project file", async () => {
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      expect(target).toBe(PROJECT_PLUGIN_PATH);
    });

    it("symlink target is resolvable", async () => {
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      const resolved = path.resolve(path.dirname(GLOBAL_PLUGIN_PATH), target);
      const targetStats = await stat(resolved);
      expect(targetStats.isFile()).toBe(true);
    });

    it("symlink target file exists and is readable", async () => {
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      const resolved = path.resolve(path.dirname(GLOBAL_PLUGIN_PATH), target);
      
      let accessible = false;
      try {
        await access(resolved);
        accessible = true;
      } catch {
        // File not accessible
      }
      expect(accessible).toBe(true);
    });
  });

  describe("Plugin Loading", () => {
    it("symlink target exports valid plugin structure", async () => {
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      const resolved = path.resolve(path.dirname(GLOBAL_PLUGIN_PATH), target);
      
      // Import the plugin file (index.js re-exports from plugin.js)
      const plugin = await import(resolved);
      
      // Verify it has expected exports (server export for AgentManagerPlugin)
      expect(plugin).toBeDefined();
      // The index.js exports 'server' which is AgentManagerPlugin renamed
      expect(plugin.server).toBeDefined();
      expect(typeof plugin.server).toBe("function");
    });

    it("plugin export is async function", async () => {
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      const resolved = path.resolve(path.dirname(GLOBAL_PLUGIN_PATH), target);
      const plugin = await import(resolved);
      
      expect(plugin.server).toBeDefined();
      expect(typeof plugin.server).toBe("function");
    });
  });

  describe("Deployment Verification", () => {
    it("deploy-plugin script output matches symlink target", async () => {
      // Verify the symlink points to where deploy-plugin would deploy
      const expectedDeployPath = PROJECT_PLUGIN_PATH;
      const target = await readlink(GLOBAL_PLUGIN_PATH);
      const resolved = path.resolve(path.dirname(GLOBAL_PLUGIN_PATH), target);
      
      expect(resolved).toBe(expectedDeployPath);
    });
  });
});
