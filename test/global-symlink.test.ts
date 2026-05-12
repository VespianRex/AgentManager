import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readlinkSync, realpathSync, lstatSync, existsSync } from "fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Global Plugin Symlink", () => {
  let tempHome: string;
  let globalPluginPath: string;
  let expectedTarget: string;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-global-plugin-"));
    expectedTarget = path.resolve(process.cwd(), ".opencode", "plugins", "agent-manager.js");
    globalPluginPath = path.join(tempHome, ".config", "opencode", "plugins", "agent-manager.js");

    await fs.mkdir(path.dirname(globalPluginPath), { recursive: true });
    await fs.symlink(expectedTarget, globalPluginPath);
  });

  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("creates a symlinked global plugin wrapper", () => {
    expect(existsSync(globalPluginPath)).toBe(true);
    expect(lstatSync(globalPluginPath).isSymbolicLink()).toBe(true);
  });

  it("points the symlink at the deployed plugin entry", () => {
    expect(readlinkSync(globalPluginPath)).toBe(expectedTarget);
    expect(realpathSync(globalPluginPath)).toBe(expectedTarget);
    expect(existsSync(realpathSync(globalPluginPath))).toBe(true);
  });

  it("keeps the symlink in the expected global plugins directory", () => {
    const globalDir = path.join(tempHome, ".config", "opencode", "plugins");
    expect(globalPluginPath.startsWith(globalDir)).toBe(true);
    expect(readlinkSync(globalPluginPath)).toContain(".opencode/plugins/agent-manager.js");
  });

  it("loads the plugin from the symlink path", async () => {
    const plugin = await import(globalPluginPath);
    expect(plugin.server).toBeDefined();

    const instance = await plugin.server({ directory: process.cwd() });
    expect(instance.tool.agent_manager).toBeDefined();
  });
});
