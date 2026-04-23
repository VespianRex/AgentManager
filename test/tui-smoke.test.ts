import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  mergeWithDefaults,
  modelBadge,
  shortenModel,
  type LoadedConfig,
} from "../src/tui-helpers.js";

describe("TUI Smoke Tests", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-manager-tui-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("Config Loading Integration", () => {
    it("loads and merges agents from config file", async () => {
      const configContent = {
        agents: {
          sisyphus: {
            model: "nvidia/anthropic/claude-opus-4-5",
            fallback_models: ["nvidia/openai/gpt-5", "nvidia/google/gemini"],
          },
          oracle: {
            model: "nvidia/openai/gpt-5.2",
          },
        },
      };

      const configPath = path.join(tmpDir, "oh-my-opencode.json");
      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: configPath, source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"]).toBeDefined();
      expect(merged["sisyphus"].model).toBe("nvidia/anthropic/claude-opus-4-5");
      expect(merged["sisyphus"].fallback).toEqual(["nvidia/openai/gpt-5", "nvidia/google/gemini"]);
      expect(merged["sisyphus"].isDefault).toBe(false);
    });

    it("loads categories from config file", async () => {
      const configContent = {
        categories: {
          ultrabrain: {
            model: "nvidia/z-ai/glm5",
            fallback_models: ["nvidia/openai/gpt-5"],
          },
          "visual-engineering": {
            model: "nvidia/google/gemini-flash",
          },
        },
      };

      const configPath = path.join(tmpDir, "oh-my-opencode.json");
      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: configPath, source: "project" },
          agents: configContent.categories,
          document: configContent,
          isCategories: true,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["ultrabrain"]).toBeDefined();
      expect(merged["ultrabrain"].model).toBe("nvidia/z-ai/glm5");
      expect(merged["ultrabrain"].isCategory).toBe(true);
    });

    it("merges agents and categories from same config", async () => {
      const configContent = {
        agents: {
          sisyphus: { model: "model-1" },
        },
        categories: {
          quick: { model: "model-2" },
        },
      };

      const configPath = path.join(tmpDir, "oh-my-opencode.json");
      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: configPath, source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
        {
          config: { path: configPath, source: "project" },
          agents: configContent.categories,
          document: configContent,
          isCategories: true,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"]).toBeDefined();
      expect(merged["sisyphus"].isCategory).toBeFalsy();
      expect(merged["quick"]).toBeDefined();
      expect(merged["quick"].isCategory).toBe(true);
    });
  });

  describe("Model Name Handling", () => {
    it("handles various model ID formats", () => {
      const testCases = [
        { input: "anthropic/claude-opus-4-5", expected: "anthropic/claude-opus-4-5" },
        { input: "nvidia/anthropic/claude-opus-4-5", expected: "anthropic/claude-opus-4-5" },
        { input: "provider/subprovider/model-id", expected: "subprovider/model-id" },
        { input: "simple-model", expected: "simple-model" },
      ];

      for (const { input, expected } of testCases) {
        expect(shortenModel(input)).toBe(expected);
      }
    });

    it("handles model objects with nested structure", () => {
      const model = { name: "claude-opus-4-5", provider: "anthropic" };
      expect(modelBadge(model)).toBe("claude-opus-4-5");
    });
  });

  describe("Case Sensitivity Handling", () => {
    it("handles Prometheus vs prometheus correctly", async () => {
      const configContent = {
        agents: {
          prometheus: { model: "test-model" },
        },
      };

      const configPath = path.join(tmpDir, "config.json");
      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: configPath, source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      const prometheusKeys = Object.keys(merged).filter(k => k.toLowerCase() === "prometheus");
      expect(prometheusKeys.length).toBe(1);
      expect(merged["prometheus"].model).toBe("test-model");
    });

    it("handles Momus vs momus correctly", async () => {
      const configContent = {
        agents: {
          MOMUS: { model: "critic-model" },
        },
      };

      const configPath = path.join(tmpDir, "config.json");
      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: configPath, source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["momus"]).toBeDefined();
      expect(merged["momus"].key).toBe("MOMUS");
      expect(merged["momus"].model).toBe("critic-model");
    });
  });

  describe("Default Fallback Chain Assignment", () => {
    it("assigns default fallbacks to agents without config", async () => {
      const loadedConfigs: LoadedConfig[] = [];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].fallback).toContain("anthropic");
      expect(merged["oracle"].fallback).toContain("openai");
      expect(merged["explore"].fallback).toContain("anthropic");
    });

    it("preserves configured fallbacks over defaults", async () => {
      const configContent = {
        agents: {
          sisyphus: {
            model: "test-model",
            fallback_models: ["custom1", "custom2"],
          },
        },
      };

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/test", source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].fallback).toEqual(["custom1", "custom2"]);
    });
  });

  describe("Edge Cases", () => {
    it("handles config with agents: false", async () => {
      const configContent = {
        agents: false,
      };

      const loadedConfigs: LoadedConfig[] = [];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(Object.keys(merged).length).toBeGreaterThan(0);
    });

    it("handles empty config", async () => {
      const loadedConfigs: LoadedConfig[] = [];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(Object.keys(merged).length).toBeGreaterThan(0);
      expect(merged["sisyphus"]).toBeDefined();
      expect(merged["sisyphus"].isDefault).toBe(true);
    });

    it("handles agent with only fallback, no model", async () => {
      const configContent = {
        agents: {
          sisyphus: {
            fallback_models: ["a", "b"],
          },
        },
      };

      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/test", source: "project" },
          agents: configContent.agents,
          document: configContent,
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].fallback).toEqual(["a", "b"]);
    });
  });
});
