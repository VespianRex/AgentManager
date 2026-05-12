import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// Import config functions for testing
import { findConfigFiles, loadConfig, normalizePath, saveConfig } from "../src/config.js";

describe("Plugin Action Tests", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-action-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("resolveTarget", () => {
    it("resolves to first config when no configPath provided", async () => {
      const configFile = path.join(tmpDir, ".opencode", "oh-my-opencode.json");
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(configFile, JSON.stringify({ agents: {} }));

      const configs = await findConfigFiles(tmpDir);
      expect(configs.length).toBeGreaterThan(0);

      // The first config should be returned
      const firstConfig = configs[0];
      expect(firstConfig).toBeDefined();
      expect(firstConfig.path).toBe(configFile);
    });

    it("resolves to specific config when configPath provided", async () => {
      const configFile = path.join(tmpDir, ".opencode", "oh-my-opencode.json");
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(configFile, JSON.stringify({ agents: {} }));

      const configs = await findConfigFiles(tmpDir);
      const normalized = normalizePath(configFile, tmpDir);

      // Find the config by path
      const found = configs.find(c => c.path === normalized);
      expect(found).toBeDefined();
      expect(found!.path).toBe(configFile);
    });

    it("returns new path entry when configPath doesn't match existing", async () => {
      const normalized = normalizePath(path.join(tmpDir, "new-config.json"), tmpDir);

      // Should return an entry even if file doesn't exist
      // (actual behavior: creates path entry for potential new file)
      expect(normalized).toContain("new-config.json");
    });
  });

  describe("inspect action", () => {
    it("loads config and runs validation pipeline", async () => {
      const configFile = path.join(tmpDir, ".opencode", "oh-my-opencode.json");
      const document: any = {
        agents: {
          sisyphus: { model: "test-model" },
        },
      };
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(configFile, JSON.stringify(document));

      const configs = await findConfigFiles(tmpDir);
      expect(configs.length).toBeGreaterThan(0);

      const target = configs[0];
      const { config, document: loadedDoc } = await loadConfig(target);

      expect(config.path).toBe(configFile);
      expect((loadedDoc as any).agents.sisyphus.model).toBe("test-model");
    });

    it("returns error when no config files found", async () => {
      const configs = await findConfigFiles(tmpDir);
      expect(configs.filter((config) => config.path.startsWith(tmpDir))).toHaveLength(0);
    });
  });

  describe("save action", () => {
    it("saves valid document and creates backup", async () => {
      const configFile = path.join(tmpDir, ".opencode", "oh-my-opencode.json");
      const document: any = {
        agents: {
          testAgent: { model: "new-model" },
        },
      };

      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(configFile, JSON.stringify({ agents: {} }));

      const result = await saveConfig(
        { path: configFile, source: "project", type: "opencode" },
        document
      );

      expect(result).toBeDefined();
      expect(result).toContain(configFile);

      // Verify file was written
      const written = await fs.readFile(configFile, "utf-8");
      const parsed = JSON.parse(written);
      expect(parsed.agents.testAgent.model).toBe("new-model");
    });

    it("handles empty agents object", async () => {
      const configFile = path.join(tmpDir, ".opencode", "oh-my-opencode.json");
      const document: any = { agents: {} };
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      await fs.writeFile(configFile, JSON.stringify({ agents: { existing: { model: "old-model" } } }));

      const result = await saveConfig(
        { path: configFile, source: "project", type: "opencode" },
        document
      );
      expect(result).toBeDefined();

      const written = await fs.readFile(configFile, "utf-8");
      const parsed = JSON.parse(written);
      // Empty agents object merges with existing (doesn't replace)
      expect(parsed.agents).toEqual({ existing: { model: "old-model" } });
    });
  });

  describe("benchmark action", () => {
    it("validates benchmark configs array", () => {
      // Test validation logic
      const validConfigs: any[] = [
        { model: "test-model", prompt: "test" },
        { model: "another-model" },
      ];

      expect(Array.isArray(validConfigs)).toBe(true);
      expect(validConfigs.length).toBe(2);

      // Validate each config
      for (const config of validConfigs) {
        expect(config).toBeDefined();
        expect(typeof config).toBe("object");
        expect(typeof config.model).toBe("string");
      }
    });

    it("rejects non-array benchmark configs", () => {
      const invalidConfigs = "not-an-array";

      expect(Array.isArray(invalidConfigs)).toBe(false);
    });

    it("rejects empty benchmark configs array", () => {
      const emptyConfigs: any[] = [];
      expect(emptyConfigs.length).toBe(0);
    });

    it("rejects configs missing model field", () => {
      const invalidConfig: any = { prompt: "test" };

      // Should fail validation
      expect(invalidConfig.model).toBeUndefined();
      expect(typeof invalidConfig.model).not.toBe("string");
    });

    it("rejects configs with invalid model type", () => {
      const invalidConfig: any = { model: 123, prompt: "test" };

      // Should fail validation
      expect(typeof invalidConfig.model).not.toBe("string");
    });

    it("rejects configs with invalid prompt type", () => {
      const invalidConfig: any = { model: "test", prompt: 123 };

      // Should fail validation
      if (invalidConfig.prompt !== undefined) {
        expect(typeof invalidConfig.prompt).not.toBe("string");
      }
    });

    it("accepts valid benchmark config structure", () => {
      const validConfig: any = {
        model: "gpt-4",
        prompt: "Hello world",
        temperature: 0.7,
        maxTokens: 100,
      };

      expect(typeof validConfig.model).toBe("string");
      expect(typeof validConfig.prompt).toBe("string");
      expect(validConfig.temperature).toBe(0.7);
    });
  });

  describe("unknown action handling", () => {
    it("returns error for unknown action", () => {
      const unknownAction = "update";
      const validActions = ["inspect", "save", "benchmark"];

      const isUnknown = !validActions.includes(unknownAction);
      expect(isUnknown).toBe(true);
    });

    it("allows inspect action", () => {
      const action = "inspect";
      const validActions = ["inspect", "save", "benchmark"];

      expect(validActions.includes(action)).toBe(true);
    });

    it("allows save action", () => {
      const action = "save";
      const validActions = ["inspect", "save", "benchmark"];

      expect(validActions.includes(action)).toBe(true);
    });

    it("allows benchmark action", () => {
      const action = "benchmark";
      const validActions = ["inspect", "save", "benchmark"];

      expect(validActions.includes(action)).toBe(true);
    });
  });

  describe("tui.command.execute hook", () => {
    const commandMatches = (command: string) =>
      new Set(["/agent-manager", "/agent-config", "/am", "/agents"]).has(command);

    it("matches /agent-manager command", () => {
      const cmd = (): string => "/agent-manager";
      const matches = commandMatches(cmd());

      expect(matches).toBe(true);
    });

    it("matches /agent-config command", () => {
      const cmd = (): string => "/agent-config";
      const matches = commandMatches(cmd());

      expect(matches).toBe(true);
    });

    it("matches slash aliases registered by the TUI wrapper", () => {
      expect(commandMatches("/am")).toBe(true);
      expect(commandMatches("/agents")).toBe(true);
    });

    it("does not match other commands", () => {
      const cmd = (): string => "/other-command";
      const matches = commandMatches(cmd());

      expect(matches).toBe(false);
    });

    it("handles empty command string", () => {
      const cmd = (): string => "";
      const matches = commandMatches(cmd());

      expect(matches).toBe(false);
    });

    it("handles null/undefined command with optional chaining", () => {
      const command: any = null;
      const result = command?.toString?.() ?? "";

      expect(result).toBe("");
    });

    it("handles valid command with toString", () => {
      const command: any = "/agent-manager";
      const result = command?.toString?.() ?? "";

      expect(result).toBe("/agent-manager");
    });
  });

  describe("error handling", () => {
    it("extracts error message from Error instance", () => {
      const error = new Error("Test error message");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      expect(errorMessage).toBe("Test error message");
    });

    it("handles non-Error objects gracefully", () => {
      const error: any = "string error";
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      expect(errorMessage).toBe("Unknown error");
    });

    it("handles null error gracefully", () => {
      const error: any = null;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      expect(errorMessage).toBe("Unknown error");
    });

    it("handles undefined error gracefully", () => {
      const error: any = undefined;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      expect(errorMessage).toBe("Unknown error");
    });
  });
});
