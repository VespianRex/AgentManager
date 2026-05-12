import { describe, it, expect } from "bun:test";
import {
  modelBadge,
  shortenModel,
  mergeWithDefaults,
  determineSectionKey,
  buildAgentUpdate,
  DEFAULT_AGENTS,
  DEFAULT_FALLBACKS,
  type LoadedConfig,
  type MergedAgent,
} from "../src/tui-helpers.js";
import { makeLoadedConfig, makeAgentConfig, makeMergedAgent } from "./helpers/factories.js";

describe("modelBadge", () => {
  it("returns 'unset' for null input", () => {
    expect(modelBadge(null)).toBe("unset");
  });

  it("returns 'unset' for undefined input", () => {
    expect(modelBadge(undefined)).toBe("unset");
  });

  it("returns the string directly for string input", () => {
    expect(modelBadge("anthropic/claude-opus-4-5")).toBe("anthropic/claude-opus-4-5");
  });

  it("returns name from object with name property", () => {
    expect(modelBadge({ name: "claude-opus-4-5" })).toBe("claude-opus-4-5");
  });

  it("returns model from object with model property", () => {
    expect(modelBadge({ model: "gpt-5.2" })).toBe("gpt-5.2");
  });

  it("prefers name over model", () => {
    expect(modelBadge({ name: "claude", model: "gpt" })).toBe("claude");
  });

  it("returns 'unknown' for empty object", () => {
    expect(modelBadge({})).toBe("unknown");
  });

  it("returns 'unknown' for non-string, non-object input", () => {
    expect(modelBadge(123)).toBe("unknown");
  });
});

describe("shortenModel", () => {
  it("returns full string for single-part model names", () => {
    expect(shortenModel("claude")).toBe("claude");
  });

  it("returns full string for two-part model names", () => {
    expect(shortenModel("anthropic/claude")).toBe("anthropic/claude");
  });

  it("shortens three-part model names to last two parts", () => {
    expect(shortenModel("nvidia/anthropic/claude")).toBe("anthropic/claude");
  });

  it("shortens four-part model names to last two parts", () => {
    expect(shortenModel("provider/nvidia/anthropic/claude")).toBe("anthropic/claude");
  });

  it("handles object input", () => {
    expect(shortenModel({ name: "nvidia/anthropic/claude" })).toBe("anthropic/claude");
  });

  it("returns 'unset' for null", () => {
    expect(shortenModel(null)).toBe("unset");
  });
});

describe("mergeWithDefaults", () => {
  it("returns default agents when no configs are provided", () => {
    const result = mergeWithDefaults([]);

    expect(Object.keys(result).length).toBeGreaterThan(0);
    expect(result["sisyphus"]).toBeDefined();
    expect(result["sisyphus"].isDefault).toBe(true);
    expect(result["sisyphus"].model).toBe(null);
  });

  it("merges user config with defaults", () => {
    const loadedConfigs: LoadedConfig[] = [
      makeLoadedConfig({
        agents: {
          sisyphus: makeAgentConfig({ model: "anthropic/claude-opus-4-5" }),
        },
      }),
    ];

    const result = mergeWithDefaults(loadedConfigs);

    expect(result["sisyphus"].model).toBe("anthropic/claude-opus-4-5");
    expect(result["sisyphus"].isDefault).toBe(false);
    expect(result["sisyphus"].configPath).toBe("/test/opencode.json");
  });

  it("is case-insensitive for agent keys", () => {
    const loadedConfigs: LoadedConfig[] = [
      makeLoadedConfig({
        agents: {
          PROMETHEUS: makeAgentConfig({ model: "test-model" }),
        },
      }),
    ];

    const result = mergeWithDefaults(loadedConfigs);

    expect(result["prometheus"]).toBeDefined();
    expect(result["prometheus"].model).toBe("test-model");
    expect(result["prometheus"].key).toBe("PROMETHEUS");
  });

  it("does not create duplicates for case-different keys", () => {
    const loadedConfigs: LoadedConfig[] = [
      makeLoadedConfig({
        agents: {
          momus: makeAgentConfig({ model: "model-1" }),
        },
      }),
    ];

    const result = mergeWithDefaults(loadedConfigs);

    const momusKeys = Object.keys(result).filter(k => k.toLowerCase() === "momus");
    expect(momusKeys.length).toBe(1);
  });

  it("handles categories separately from agents", () => {
    const loadedConfigs: LoadedConfig[] = [
      makeLoadedConfig({
        agents: { ultrabrain: { model: "test-model" } },
      }),
      makeLoadedConfig({
        agents: { ultrabrain: { model: "category-model", fallback_models: ["a", "b"] } },
        isCategories: true,
      }),
    ];

    const result = mergeWithDefaults(loadedConfigs);

    expect(result["ultrabrain"]).toBeDefined();
    expect(result["ultrabrain"].isCategory).toBe(true);
  });

  it("includes agents named 'false' and 'true' (valid agent names)", () => {
    const loadedConfigs: LoadedConfig[] = [
      makeLoadedConfig({
        agents: {
          false: { model: "valid-false" },
          true: { model: "valid-true" },
          sisyphus: { model: "valid" },
        },
      }),
    ];

    const result = mergeWithDefaults(loadedConfigs);

    // Agents named "false" and "true" are now correctly included
    expect(result["false"]).toBeDefined();
    expect(result["false"].model).toBe("valid-false");
    expect(result["true"]).toBeDefined();
    expect(result["true"].model).toBe("valid-true");
    expect(result["sisyphus"].model).toBe("valid");
  });

  it("preserves fallback from config", () => {
    const loadedConfigs: LoadedConfig[] = [
      {
        config: { path: "/test/opencode.json", source: "project" },
        agents: {
          sisyphus: {
            model: "test-model",
            fallback_models: ["anthropic", "openai", "google"]
          },
        },
        document: {},
      },
    ];

    const result = mergeWithDefaults(loadedConfigs);

    expect(result["sisyphus"].fallback).toEqual(["anthropic", "openai", "google"]);
  });

  it("uses fallback field if fallback_models not present", () => {
    const loadedConfigs: LoadedConfig[] = [
      {
        config: { path: "/test/opencode.json", source: "project" },
        agents: {
          sisyphus: {
            model: "test-model",
            fallback: ["provider1", "provider2"]
          },
        },
        document: {},
      },
    ];

    const result = mergeWithDefaults(loadedConfigs);

    expect(result["sisyphus"].fallback).toEqual(["provider1", "provider2"]);
  });
});

describe("determineSectionKey", () => {
  it("returns 'categories' for category agents", () => {
    const agent: MergedAgent = {
      key: "ultrabrain",
      model: "test",
      fallback: [],
      role: "logic",
      isDefault: false,
      isCategory: true,
    };
    const config: LoadedConfig = {
      config: { path: "/test", source: "project" },
      agents: {},
      document: {},
    };

    expect(determineSectionKey(agent, config)).toBe("categories");
  });

  it("returns 'agents' for non-category agents", () => {
    const agent: MergedAgent = {
      key: "sisyphus",
      model: "test",
      fallback: [],
      role: "orchestrator",
      isDefault: false,
      isCategory: false,
    };
    const config: LoadedConfig = {
      config: { path: "/test", source: "project" },
      agents: {},
      document: {},
    };

    expect(determineSectionKey(agent, config)).toBe("agents");
  });

  it("returns 'categories' when config isCategories is true", () => {
    const agent: MergedAgent = {
      key: "test",
      model: "test",
      fallback: [],
      role: "test",
      isDefault: false,
    };
    const config: LoadedConfig = {
      config: { path: "/test", source: "project" },
      agents: {},
      document: {},
      isCategories: true,
    };

    expect(determineSectionKey(agent, config)).toBe("categories");
  });
});

describe("buildAgentUpdate", () => {
  it("updates model in existing agent", () => {
    const existing = {
      sisyphus: { model: "old-model", fallback_models: ["a", "b"] },
    };

    const result = buildAgentUpdate(existing, "sisyphus", { model: "new-model" });

    expect(result["sisyphus"].model).toBe("new-model");
    expect(result["sisyphus"].fallback_models).toEqual(["a", "b"]);
  });

  it("updates fallback in existing agent", () => {
    const existing = {
      sisyphus: { model: "test-model" },
    };

    const result = buildAgentUpdate(existing, "sisyphus", { fallback: ["x", "y", "z"] });

    expect(result["sisyphus"].fallback_models).toEqual(["x", "y", "z"]);
  });

  it("creates new agent if not exists", () => {
    const existing: Record<string, any> = {};

    const result = buildAgentUpdate(existing, "new-agent", { model: "test-model" });

    expect(result["new-agent"]).toBeDefined();
    expect(result["new-agent"].model).toBe("test-model");
  });

  it("does not overwrite unspecified fields", () => {
    const existing = {
      sisyphus: { model: "old", fallback_models: ["a"], extra: "field" },
    };

    const result = buildAgentUpdate(existing, "sisyphus", { model: "new" });

    expect((result["sisyphus"] as any).extra).toBe("field");
  });
});

describe("DEFAULT_AGENTS", () => {
  it("contains required agent roles", () => {
    expect(DEFAULT_AGENTS["sisyphus"]).toBeDefined();
    expect(DEFAULT_AGENTS["oracle"]).toBeDefined();
    expect(DEFAULT_AGENTS["librarian"]).toBeDefined();
    expect(DEFAULT_AGENTS["explore"]).toBeDefined();
  });

  it("contains category agents", () => {
    expect(DEFAULT_AGENTS["quick"]).toBeDefined();
    expect(DEFAULT_AGENTS["deep"]).toBeDefined();
    expect(DEFAULT_AGENTS["ultrabrain"]).toBeDefined();
    expect(DEFAULT_AGENTS["visual-engineering"]).toBeDefined();
    expect(DEFAULT_AGENTS["artistry"]).toBeDefined();
  });

  it("contains unspecified agents", () => {
    expect(DEFAULT_AGENTS["unspecified-low"]).toBeDefined();
    expect(DEFAULT_AGENTS["unspecified-high"]).toBeDefined();
  });

  it("each agent has role and description", () => {
    for (const [key, value] of Object.entries(DEFAULT_AGENTS)) {
      expect(value.role).toBeDefined();
      expect(value.description).toBeDefined();
      expect(typeof value.role).toBe("string");
      expect(typeof value.description).toBe("string");
    }
  });
});

describe("DEFAULT_FALLBACKS", () => {
  it("defines fallbacks for main agents", () => {
    expect(DEFAULT_FALLBACKS["sisyphus"]).toBeDefined();
    expect(Array.isArray(DEFAULT_FALLBACKS["sisyphus"])).toBe(true);
    expect(DEFAULT_FALLBACKS["sisyphus"].length).toBeGreaterThan(0);
  });

  it("defines fallbacks for category agents", () => {
    expect(DEFAULT_FALLBACKS["quick"]).toBeDefined();
    expect(DEFAULT_FALLBACKS["ultrabrain"]).toBeDefined();
    expect(DEFAULT_FALLBACKS["visual-engineering"]).toBeDefined();
  });

  it("fallback arrays are non-empty", () => {
    for (const [key, fallbacks] of Object.entries(DEFAULT_FALLBACKS)) {
      expect(fallbacks.length).toBeGreaterThan(0);
    }
  });
});
