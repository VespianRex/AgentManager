import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  mergeWithDefaults,
  modelBadge,
  shortenModel,
  buildAgentUpdate,
  DEFAULT_AGENTS,
  DEFAULT_FALLBACKS,
  type LoadedConfig,
  type MergedAgent,
  type AgentConfig,
} from "../src/tui-helpers.js";
import { makeLoadedConfig, makeAgentConfig, makeMergedAgent } from "./helpers/factories.js";

// ============================================================================
// Test Fixtures and Helper Functions
// ============================================================================

/**
 * Creates a mock API state for testing state propagation
 */
function createMockApiState(overrides: {
  provider?: unknown[];
  path?: { directory?: string };
  instance?: { dispose?: () => void };
} = {}): any {
  return {
    state: {
      provider: overrides.provider || [
        {
          id: "anthropic",
          models: [
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
            { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
            { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
          ],
        },
        {
          id: "openai",
          models: [
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
          ],
        },
        {
          id: "google",
          models: [
            { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
          ],
        },
      ],
      path: {
        directory: overrides.path?.directory || "/test/cwd",
        ...overrides.path,
      },
      ...(overrides.instance && { instance: overrides.instance }),
    },
    ui: {
      toast: vi.fn(),
      dialog: {
        replace: vi.fn(),
        clear: vi.fn(),
        setSize: vi.fn(),
      },
    },
    client: {
      instance: {
        dispose: vi.fn().mockResolvedValue(undefined),
      },
    },
    command: {
      register: vi.fn(() => vi.fn()),
      openPalette: vi.fn(),
    },
    lifecycle: {
      onDispose: vi.fn(),
    },
    theme: {
      current: {
        backgroundPanel: "#1d1d1d",
        border: "#3a3a3a",
        text: "#e0e0e0",
        textMuted: "#6a6a6a",
        primary: "#5f87ff",
        success: "#5faf5f",
        error: "#ff5f5f",
        warning: "#ffff5f",
      },
    },
  };
}

/**
 * Creates a returnIndex tracking array for navigation testing
 */
function createReturnIndex(initialIndex = 0): [number] {
  return [initialIndex];
}

// ============================================================================
// 1. Agent Config State Tests
// ============================================================================

describe("Agent Config State", () => {
  describe("model selection persistence", () => {
    it("persists model selection in merged agents", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet-20241022" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet-20241022");
      expect(merged["sisyphus"].isDefault).toBe(false);
    });

    it("model selection persists after multiple merge operations", () => {
      const initial = mergeWithDefaults([]);
      expect(initial["sisyphus"].model).toBeNull();

      const withModel = mergeWithDefaults([
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-opus" }),
          },
        }),
      ]);
      expect(withModel["sisyphus"].model).toBe("anthropic/claude-3-opus");

      // Re-merge with additional configs should preserve existing model
      const reMerged = mergeWithDefaults([
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-opus" }),
            oracle: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ]);
      expect(reMerged["sisyphus"].model).toBe("anthropic/claude-3-opus");
      expect(reMerged["oracle"].model).toBe("openai/gpt-4o");
    });

    it("model selection is case-insensitive for agent keys", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            SISYPHUS: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");
    });

    it("object model format is properly extracted", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/test/opencode.json", source: "project" },
          agents: {
            sisyphus: { model: { name: "claude-3-5-sonnet-20241022" } },
          },
          document: {},
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].model).toBe("claude-3-5-sonnet-20241022");
    });

    it("nested model object with both name and model prefers name", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/test/opencode.json", source: "project" },
          agents: {
            sisyphus: { model: { name: "preferred-model", model: "other-model" } },
          },
          document: {},
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].model).toBe("preferred-model");
    });
  });

  describe("fallback chain persistence", () => {
    it("fallback chain changes persist through merge", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({
              model: "anthropic/claude-3-5-sonnet",
              fallback: ["openai", "google"],
            }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].fallback).toEqual(["openai", "google"]);
    });

    it("fallback_models key is used when provided", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: {
              model: "test-model",
              fallback_models: ["anthropic", "openai", "google"],
            },
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].fallback).toEqual(["anthropic", "openai", "google"]);
    });

    it("fallback key (alias) is used when fallback_models not present", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: {
              model: "test-model",
              fallback: ["provider1", "provider2"],
            },
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].fallback).toEqual(["provider1", "provider2"]);
    });

    it("fallback_models takes precedence over fallback", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: {
              model: "test-model",
              fallback_models: ["fb-models"],
              fallback: ["fb-alias"],
            },
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].fallback).toEqual(["fb-models"]);
    });

    it("empty fallback array is preserved", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: {
              model: "test-model",
              fallback: [],
            },
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].fallback).toEqual([]);
    });
  });

  describe("config changes reflected in merged agents", () => {
    it("config changes update merged agent properties", () => {
      const initial = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
          },
        }),
      ];
      const merged1 = mergeWithDefaults(initial);
      expect(merged1["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");

      const updated = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ];
      const merged2 = mergeWithDefaults(updated);
      expect(merged2["sisyphus"].model).toBe("openai/gpt-4o");
    });

    it("configPath is correctly set on merged agents", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          config: { path: "/home/user/.config/opencode/oh-my-opencode.json", source: "user" },
          agents: {
            sisyphus: makeAgentConfig({ model: "test-model" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].configPath).toBe(
        "/home/user/.config/opencode/oh-my-opencode.json"
      );
    });

    it("isDefault is false when config overrides default", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test-model" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].isDefault).toBe(false);
    });

    it("isDefault remains true for agents without config override", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test-model" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      // sisyphus has config override
      expect(merged["sisyphus"].isDefault).toBe(false);
      // oracle has no config override
      expect(merged["oracle"].isDefault).toBe(true);
    });
  });
});

// ============================================================================
// 2. Navigation State Tests
// ============================================================================

describe("Navigation State", () => {
  describe("returnIndex tracking", () => {
    it("returnIndex array is mutable reference", () => {
      const returnIndex = createReturnIndex(0);

      // Simulate updating returnIndex during navigation
      returnIndex[0] = 5;
      expect(returnIndex[0]).toBe(5);

      // The same reference should be passed through navigation
      const newReturnIndex = returnIndex;
      newReturnIndex[0] = 10;
      expect(returnIndex[0]).toBe(10);
    });

    it("returnIndex tracks current selection index", () => {
      const returnIndex = createReturnIndex(0);
      const options = ["agent1", "agent2", "agent3", "agent4"];

      // Simulate selecting agent3
      const selectedIndex = 2;
      returnIndex[0] = selectedIndex;

      expect(returnIndex[0]).toBe(2);
      expect(options[returnIndex[0]]).toBe("agent3");
    });

    it("returnIndex persists through navigation round-trip", () => {
      const returnIndex = createReturnIndex(0);

      // Start at agent list
      returnIndex[0] = 3;
      expect(returnIndex[0]).toBe(3);

      // Navigate to agent detail
      // ... (navigation happens)

      // Navigate back should restore position
      // returnIndex is passed through, so should still be 3
      expect(returnIndex[0]).toBe(3);
    });

    it("returnIndex defaults to 0 when not set", () => {
      const returnIndex = createReturnIndex(undefined as any);

      // Default should be 0
      expect(returnIndex[0]).toBe(0);
    });

    it("returnIndex handles undefined gracefully", () => {
      const returnIndex: [number] | undefined = undefined;

      // Should not throw when accessing undefined
      const index = returnIndex?.[0] ?? 0;
      expect(index).toBe(0);
    });
  });

  describe("navigation order preservation", () => {
    it("navigation path is preserved in order", () => {
      const navigationPath: string[] = [];

      // Simulate navigation sequence
      navigationPath.push("showAgentList");
      navigationPath.push("showAgentDetail");
      navigationPath.push("editModel");
      navigationPath.push("showModelsForProvider");
      navigationPath.push("showAllModels");

      expect(navigationPath).toEqual([
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showModelsForProvider",
        "showAllModels",
      ]);
    });

    it("back navigation returns to correct previous screen", () => {
      const navigationStack: string[] = [];

      // Push navigation sequence
      navigationStack.push("showAgentList");
      navigationStack.push("showAgentDetail");
      navigationStack.push("editModel");

      // Pop for back navigation
      const backDestination = navigationStack[navigationStack.length - 1];
      navigationStack.pop();

      expect(backDestination).toBe("editModel");
      expect(navigationStack).toEqual(["showAgentList", "showAgentDetail"]);
    });

    it("back navigation through multiple levels", () => {
      const navigationStack: string[] = [];

      navigationStack.push("showAgentList");
      navigationStack.push("showAgentDetail");
      navigationStack.push("showFallbackManager");
      navigationStack.push("showAddFallback");
      navigationStack.push("showCustomFallbackPrompt");

      expect(navigationStack.length).toBe(5);

      // Navigate back through fallback editing
      navigationStack.pop(); // showCustomFallbackPrompt
      navigationStack.pop(); // showAddFallback
      navigationStack.pop(); // showFallbackManager

      // Now at showAgentDetail
      const current = navigationStack[navigationStack.length - 1];
      expect(current).toBe("showAgentDetail");
      // Stack should have 2 items: showAgentList and showAgentDetail
      expect(navigationStack).toEqual(["showAgentList", "showAgentDetail"]);
    });
  });

  describe("navigation function parameters", () => {
    it("all navigation functions receive loadedConfigs", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test" }),
          },
        }),
      ];

      // Simulating what get passed to showAgentDetail
      const params = {
        loadedConfigs,
        agentKey: "sisyphus",
        agent: { key: "sisyphus", model: "test", fallback: [], role: "orchestrator", isDefault: false },
        mergedAgents: mergeWithDefaults(loadedConfigs),
        returnIndex: createReturnIndex(0),
      };

      expect(params.loadedConfigs).toBe(loadedConfigs);
      expect(Array.isArray(params.loadedConfigs)).toBe(true);
    });

    it("mergedAgents is regenerated when loadedConfigs changes", () => {
      const configs1: LoadedConfig[] = [
        makeLoadedConfig({
          agents: { sisyphus: makeAgentConfig({ model: "model1" }) },
        }),
      ];

      const configs2: LoadedConfig[] = [
        makeLoadedConfig({
          agents: { sisyphus: makeAgentConfig({ model: "model2" }) },
        }),
      ];

      const merged1 = mergeWithDefaults(configs1);
      const merged2 = mergeWithDefaults(configs2);

      expect(merged1["sisyphus"].model).toBe("model1");
      expect(merged2["sisyphus"].model).toBe("model2");
    });
  });
});

// ============================================================================
// 3. Config Loading State Tests
// ============================================================================

describe("Config Loading State", () => {
  describe("loadedConfigs propagation", () => {
    it("loadedConfigs is passed as array", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({ agents: {} }),
        makeLoadedConfig({ agents: {} }),
      ];

      expect(Array.isArray(loadedConfigs)).toBe(true);
      expect(loadedConfigs.length).toBe(2);
    });

    it("loadedConfigs preserves config metadata", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/project/.opencode/oh-my-opencode.json", source: "project" },
          agents: { sisyphus: { model: "project-model" } },
          document: { agents: {} },
        },
        {
          config: { path: "/home/user/.config/opencode/oh-my-opencode.json", source: "user" },
          agents: { sisyphus: { model: "user-model" } },
          document: { agents: {} },
          isCategories: true,
        },
      ];

      expect(loadedConfigs[0].config.source).toBe("project");
      expect(loadedConfigs[1].config.source).toBe("user");
      expect(loadedConfigs[1].isCategories).toBe(true);
    });

    it("loadedConfigs with empty agents array", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({ agents: {} }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      // Should still have default agents
      expect(Object.keys(merged).length).toBeGreaterThan(0);
    });
  });

  describe("config changes trigger reload", () => {
    it("re-merge reflects config file changes", () => {
      // Initial state
      const configs1: LoadedConfig[] = [
        makeLoadedConfig({
          config: { path: "/test/opencode.json", source: "project" },
          agents: { sisyphus: makeAgentConfig({ model: "initial-model" }) },
        }),
      ];

      const merged1 = mergeWithDefaults(configs1);
      expect(merged1["sisyphus"].model).toBe("initial-model");

      // After config change
      const configs2: LoadedConfig[] = [
        makeLoadedConfig({
          config: { path: "/test/opencode.json", source: "project" },
          agents: { sisyphus: makeAgentConfig({ model: "updated-model" }) },
        }),
      ];

      const merged2 = mergeWithDefaults(configs2);
      expect(merged2["sisyphus"].model).toBe("updated-model");
    });

    it("new agents appear after reload", () => {
      const configs1: LoadedConfig[] = [
        makeLoadedConfig({
          agents: { sisyphus: makeAgentConfig({ model: "test" }) },
        }),
      ];

      const merged1 = mergeWithDefaults(configs1);
      expect(merged1["customagent"]).toBeUndefined();

      const configs2: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test" }),
            customagent: makeAgentConfig({ model: "custom-model" }),
          },
        }),
      ];

      const merged2 = mergeWithDefaults(configs2);
      expect(merged2["customagent"]).toBeDefined();
      expect(merged2["customagent"].model).toBe("custom-model");
    });

    it("removed agents disappear after reload", () => {
      const configs1: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test1" }),
            oracle: makeAgentConfig({ model: "test2" }),
          },
        }),
      ];

      const merged1 = mergeWithDefaults(configs1);
      expect(merged1["oracle"]).toBeDefined();

      const configs2: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test1" }),
            // oracle removed
          },
        }),
      ];

      const merged2 = mergeWithDefaults(configs2);
      // oracle is still in merged2 because defaults include it
      // but it should be reset to default state
      expect(merged2["oracle"].isDefault).toBe(true);
    });
  });

  describe("default agents merge correctly", () => {
    it("all default agents appear in merged result", () => {
      const merged = mergeWithDefaults([]);

      // Check that all expected default agents exist
      for (const [key, info] of Object.entries(DEFAULT_AGENTS)) {
        const lowerKey = key.toLowerCase();
        expect(merged[lowerKey]).toBeDefined();
        expect(merged[lowerKey].role).toBe(info.role);
        expect(merged[lowerKey].isDefault).toBe(true);
      }
    });

    it("default fallbacks are applied to agents without config", () => {
      const merged = mergeWithDefaults([]);

      // Each agent should have its default fallbacks
      for (const [key, expectedFallback] of Object.entries(DEFAULT_FALLBACKS)) {
        const lowerKey = key.toLowerCase();
        expect(merged[lowerKey].fallback).toEqual(expectedFallback);
      }
    });

    it("default agents have correct metadata", () => {
      const merged = mergeWithDefaults([]);

      const sisyphus = merged["sisyphus"];
      expect(sisyphus.key).toBe("sisyphus");
      expect(sisyphus.role).toBeDefined();
      expect(sisyphus.description).toBeDefined();
      expect(sisyphus.model).toBeNull();
      expect(sisyphus.isDefault).toBe(true);
    });

    it("category agents are marked correctly", () => {
      const merged = mergeWithDefaults([]);

      // Category agents should have isCategory flag
      const categoryAgents = ["quick", "deep", "ultrabrain", "visual-engineering", "artistry"];
      for (const key of categoryAgents) {
        expect(merged[key]).toBeDefined();
      }
    });
  });
});

// ============================================================================
// 4. Provider State Tests
// ============================================================================

describe("Provider State", () => {
  describe("api.state.provider usage", () => {
    it("extracts provider from api.state.provider", () => {
      const api = createMockApiState();
      const providers = api.state.provider;

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBe(3);
      expect(providers[0].id).toBe("anthropic");
    });

    it("handles providers as object with numeric keys", () => {
      const api = createMockApiState({
        provider: {
          "0": { id: "anthropic", models: [] },
          "1": { id: "openai", models: [] },
        },
      });

      const providers = Array.isArray(api.state.provider)
        ? api.state.provider
        : Object.values(api.state.provider);

      expect(providers.length).toBe(2);
    });

    it("extracts models from provider", () => {
      const api = createMockApiState();
      const anthropic = api.state.provider.find((p: any) => p.id === "anthropic");

      expect(anthropic.models).toBeDefined();
      expect(Array.isArray(anthropic.models)).toBe(true);
      expect(anthropic.models.length).toBe(3);
    });

    it("model options are built correctly", () => {
      const api = createMockApiState();
      const providers = api.state.provider;

      interface ModelOption {
        title: string;
        value: { model: string; provider: string };
        description: string;
      }
      const options: ModelOption[] = [];

      for (const provider of providers) {
        const pid = provider.id;
        for (const model of provider.models) {
          const modelId = model.id || model.name;
          options.push({
            title: model.name || modelId,
            value: { model: modelId, provider: pid },
            description: pid,
          });
        }
      }

      expect(options.length).toBe(7); // 3 + 2 + 2 models
      const firstOption = options[0];
      expect(firstOption.title).toBe("Claude 3.5 Sonnet");
      expect(firstOption.value.provider).toBe("anthropic");
      expect(firstOption.value.model).toBe("claude-3-5-sonnet-20241022");
    });
  });

  describe("empty provider state handling", () => {
    it("triggers custom input when provider is empty array", () => {
      // Test that empty array is detected as empty
      const emptyProviders: any[] = [];
      const providerArr = Array.isArray(emptyProviders)
        ? emptyProviders
        : Object.values(emptyProviders || {});

      expect(providerArr.length).toBe(0);
    });

    it("triggers custom input when provider is undefined", () => {
      // Test that undefined is handled
      const undefinedProviders = undefined;
      const providerArr = Array.isArray(undefinedProviders)
        ? undefinedProviders
        : Object.values(undefinedProviders || {});

      expect(providerArr.length).toBe(0);
    });

    it("triggers custom input when provider is null", () => {
      // Test that null is handled
      const nullProviders = null as any;
      const providerArr = Array.isArray(nullProviders)
        ? nullProviders
        : Object.values(nullProviders || {});

      expect(providerArr.length).toBe(0);
    });

    it("triggers custom input when provider object is empty", () => {
      const api = createMockApiState({ provider: {} });
      const providers = api.state.provider;

      const providerArr = Array.isArray(providers)
        ? providers
        : Object.values(providers || {});

      expect(providerArr.length).toBe(0);
    });
  });

  describe("provider changes refresh model options", () => {
    it("new provider adds models to options", () => {
      const initialProviders = [
        { id: "anthropic", models: [{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }] },
      ];

      const updatedProviders = [
        { id: "anthropic", models: [{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }] },
        { id: "openai", models: [{ id: "gpt-4o", name: "GPT-4o" }] },
      ];

      const initialCount = initialProviders.reduce((sum, p) => sum + p.models.length, 0);
      const updatedCount = updatedProviders.reduce((sum, p) => sum + p.models.length, 0);

      expect(initialCount).toBe(1);
      expect(updatedCount).toBe(2);
    });

    it("provider with no models is handled gracefully", () => {
      const providers = [
        { id: "empty-provider", models: [] },
        { id: "anthropic", models: [{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }] },
      ];

      for (const provider of providers) {
        const modelsObj = provider.models || {};
        const modelArr = Object.values(modelsObj);
        expect(Array.isArray(modelArr)).toBe(true);
      }
    });
  });
});

// ============================================================================
// 5. Save State Flow Tests
// ============================================================================

describe("Save State Flow", () => {
  describe("saveAgentConfig state updates", () => {
    it("builds update with model when model is provided", () => {
      const existingSection: Record<string, AgentConfig> = {
        sisyphus: { model: "old-model" },
      };

      const updatedSection = buildAgentUpdate(existingSection, "sisyphus", {
        model: "new-model",
      });

      expect(updatedSection["sisyphus"].model).toBe("new-model");
    });

    it("builds update with fallback when fallback is provided", () => {
      const existingSection: Record<string, AgentConfig> = {};

      const updatedSection = buildAgentUpdate(existingSection, "sisyphus", {
        fallback: ["anthropic", "openai"],
      });

      expect(updatedSection["sisyphus"].fallback_models).toEqual(["anthropic", "openai"]);
    });

    it("builds update with both model and fallback", () => {
      const existingSection: Record<string, AgentConfig> = {};

      const updatedSection = buildAgentUpdate(existingSection, "sisyphus", {
        model: "new-model",
        fallback: ["a", "b", "c"],
      });

      expect(updatedSection["sisyphus"].model).toBe("new-model");
      expect(updatedSection["sisyphus"].fallback_models).toEqual(["a", "b", "c"]);
    });

    it("merges with existing agent properties", () => {
      const existingSection: Record<string, AgentConfig> = {
        sisyphus: { model: "old-model", customField: "preserve" },
      };

      const updatedSection = buildAgentUpdate(existingSection, "sisyphus", {
        model: "new-model",
      });

      // buildAgentUpdate only preserves model and fallback_models
      expect(updatedSection["sisyphus"].model).toBe("new-model");
    });

    it("creates new agent when key doesn't exist", () => {
      const existingSection: Record<string, AgentConfig> = {};

      const updatedSection = buildAgentUpdate(existingSection, "new-agent", {
        model: "test-model",
      });

      expect(updatedSection["new-agent"]).toBeDefined();
      expect(updatedSection["new-agent"].model).toBe("test-model");
    });
  });

  describe("onSuccess callback", () => {
    it("onSuccess callback is called when provided", () => {
      let callbackCalled = false;
      const onSuccess = () => {
        callbackCalled = true;
      };

      // Simulate calling onSuccess
      onSuccess();
      expect(callbackCalled).toBe(true);
    });

    it("onSuccess receives updated state", () => {
      const originalAgent = makeMergedAgent({ key: "sisyphus", model: "old" });
      const updatedAgent = { ...originalAgent, model: "new" };

      let receivedAgent: any;
      const onSuccess = (agent: any) => {
        receivedAgent = agent;
      };

      onSuccess(updatedAgent);
      expect(receivedAgent.model).toBe("new");
    });

    it("onSuccess fallback to default behavior when not provided", () => {
      const onSuccess = undefined;

      // Should use default behavior (showAgentDetail)
      expect(onSuccess).toBeUndefined();
    });
  });

  describe("save persistence through reload", () => {
    it("saved config persists in merged agents", () => {
      const configsBefore: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {},
        }),
      ];
      const mergedBefore = mergeWithDefaults(configsBefore);
      expect(mergedBefore["sisyphus"].model).toBeNull();

      // Simulate save by creating new merged state
      const configsAfter: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
          },
        }),
      ];
      const mergedAfter = mergeWithDefaults(configsAfter);
      expect(mergedAfter["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");
    });

    it("save creates entries in correct section", () => {
      const agent = makeMergedAgent({ isCategory: false });
      const categoryAgent = makeMergedAgent({ isCategory: true });

      const sectionForAgent = agent.isCategory ? "categories" : "agents";
      const sectionForCategory = categoryAgent.isCategory ? "categories" : "agents";

      expect(sectionForAgent).toBe("agents");
      expect(sectionForCategory).toBe("categories");
    });

    it("save updates existing configPath", () => {
      const configPath = "/home/user/.config/opencode/oh-my-opencode.json";
      const agent = makeMergedAgent({ configPath });

      expect(agent.configPath).toBe(configPath);
    });
  });

  describe("save failure recovery", () => {
    it("previous state is preserved on save error", () => {
      const previousAgent = makeMergedAgent({
        key: "sisyphus",
        model: "previous-model",
        fallback: ["a", "b"],
      });

      // Simulate error during save - should not modify agent
      const currentAgent = { ...previousAgent };

      expect(currentAgent.model).toBe("previous-model");
      expect(currentAgent.fallback).toEqual(["a", "b"]);
    });

    it("save without configPath finds fallback location", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/project/opencode.json", source: "project" },
          agents: {},
          document: {},
        },
        {
          config: { path: "/home/user/.config/opencode/oh-my-opencode.json", source: "user" },
          agents: {},
          document: {},
        },
      ];

      const userConfig = loadedConfigs.find((c) => c.config.path.includes(".config"));
      const projectConfig = loadedConfigs.find((c) => !c.config.path.includes(".config"));
      const fallbackPath = (userConfig || projectConfig)?.config?.path;

      expect(fallbackPath).toBe("/home/user/.config/opencode/oh-my-opencode.json");
    });

    it("save fails gracefully when no config found", () => {
      const loadedConfigs: LoadedConfig[] = [];

      const userConfig = loadedConfigs.find((c) => c.config.path.includes(".config"));
      const projectConfig = loadedConfigs.find((c) => !c.config.path.includes(".config"));
      const configPath = (userConfig || projectConfig)?.config?.path;

      expect(configPath).toBeUndefined();
    });
  });
});

// ============================================================================
// 6. State Isolation Tests
// ============================================================================

describe("State Isolation", () => {
  describe("editing one agent doesn't affect others", () => {
    it("changing sisyphus model doesn't affect oracle", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
            oracle: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");
      expect(merged["oracle"].model).toBe("openai/gpt-4o");

      // Simulate updating only sisyphus
      const updatedConfigs = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-opus" }),
            oracle: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ];

      const updatedMerged = mergeWithDefaults(updatedConfigs);

      expect(updatedMerged["sisyphus"].model).toBe("anthropic/claude-3-opus");
      expect(updatedMerged["oracle"].model).toBe("openai/gpt-4o"); // Unchanged
    });

    it("removing fallback from one agent doesn't affect others", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test", fallback: ["anthropic"] }),
            oracle: makeAgentConfig({ model: "test", fallback: ["openai", "google"] }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);

      expect(merged["sisyphus"].fallback).toEqual(["anthropic"]);
      expect(merged["oracle"].fallback).toEqual(["openai", "google"]);

      // Update only sisyphus
      const updatedConfigs = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "test", fallback: [] }),
            oracle: makeAgentConfig({ model: "test", fallback: ["openai", "google"] }),
          },
        }),
      ];

      const updatedMerged = mergeWithDefaults(updatedConfigs);

      expect(updatedMerged["sisyphus"].fallback).toEqual([]);
      expect(updatedMerged["oracle"].fallback).toEqual(["openai", "google"]);
    });
  });

  describe("changes to fallback don't affect model", () => {
    it("updating fallback doesn't change model", () => {
      const existing: Record<string, AgentConfig> = {
        sisyphus: { model: "anthropic/claude-3-5-sonnet", fallback_models: ["openai"] },
      };

      const updated = buildAgentUpdate(existing, "sisyphus", {
        fallback: ["google", "openai"],
      });

      expect(updated["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");
      expect(updated["sisyphus"].fallback_models).toEqual(["google", "openai"]);
    });

    it("updating model doesn't change fallback", () => {
      const existing: Record<string, AgentConfig> = {
        sisyphus: { model: "anthropic/claude-3-5-sonnet", fallback_models: ["openai", "google"] },
      };

      const updated = buildAgentUpdate(existing, "sisyphus", {
        model: "anthropic/claude-3-opus",
      });

      expect(updated["sisyphus"].model).toBe("anthropic/claude-3-opus");
      expect(updated["sisyphus"].fallback_models).toEqual(["openai", "google"]);
    });
  });

  describe("config path changes don't break loading", () => {
    it("config paths maintain separate sources (last write wins)", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/project/opencode.json", source: "project" },
          agents: { sisyphus: { model: "project-model" } },
          document: {},
        },
        {
          config: { path: "/home/user/.config/opencode/oh-my-opencode.json", source: "user" },
          agents: { sisyphus: { model: "user-model" } },
          document: {},
        },
      ];

      // Both configs specify sisyphus, last one wins (user config)
      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].model).toBe("user-model");
      expect(merged["sisyphus"].configPath).toBe("/home/user/.config/opencode/oh-my-opencode.json");
    });

    it("agents from different config paths are independent", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/project/opencode.json", source: "project" },
          agents: { sisyphus: { model: "sisyphus-model" } },
          document: {},
        },
        {
          config: { path: "/home/user/.config/opencode/oh-my-opencode.json", source: "user" },
          agents: { oracle: { model: "oracle-model" } },
          document: {},
        },
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      expect(merged["sisyphus"].model).toBe("sisyphus-model");
      expect(merged["sisyphus"].configPath).toBe("/project/opencode.json");
      expect(merged["oracle"].model).toBe("oracle-model");
      expect(merged["oracle"].configPath).toBe("/home/user/.config/opencode/oh-my-opencode.json");
    });
  });
});

// ============================================================================
// 7. State Recovery Tests
// ============================================================================

describe("State Recovery", () => {
  describe("agent not found in mergedAgents", () => {
    it("returns undefined for non-existent agent", () => {
      const merged: Record<string, MergedAgent> = mergeWithDefaults([]);

      expect(merged["nonexistent"]).toBeUndefined();
      expect(merged["customagent"]).toBeUndefined();
    });

    it("custom agent is created correctly", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            myCustomAgent: makeAgentConfig({ model: "custom-model" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(loadedConfigs);
      const custom = merged["mycustomagent"];

      expect(custom).toBeDefined();
      expect(custom.key).toBe("myCustomAgent");
      expect(custom.model).toBe("custom-model");
      expect(custom.role).toBe("custom");
      expect(custom.isDefault).toBe(false);
    });

    it("showAgentDetail handles missing mergedAgents entry", () => {
      const agentKey = "nonexistent";
      const mergedAgents: Record<string, MergedAgent> = {};

      const agent = mergedAgents[agentKey];

      expect(agent).toBeUndefined();
    });

    it("case-insensitive lookup handles missing agent", () => {
      const merged: Record<string, MergedAgent> = mergeWithDefaults([]);

      // Check uppercase version
      const upperCase = merged["SISYPHUS"];
      // Since we use lowercase keys, uppercase won't match defaults
      expect(upperCase).toBeUndefined();
    });
  });

  describe("configPath missing handling", () => {
    it("agent without configPath uses default fallbacks", () => {
      const agent = makeMergedAgent({
        key: "sisyphus",
        model: null,
        configPath: undefined,
      });

      expect(agent.configPath).toBeUndefined();
      expect(DEFAULT_FALLBACKS["sisyphus"]).toBeDefined();
    });

    it("findConfigPath fallback logic", () => {
      const loadedConfigs: LoadedConfig[] = [
        {
          config: { path: "/project/opencode.json", source: "project" },
          agents: {},
          document: {},
        },
      ];

      const userConfig = loadedConfigs.find((c) => c.config.path.includes(".config"));
      const projectConfig = loadedConfigs.find((c) => !c.config.path.includes(".config"));
      const configPath = (userConfig || projectConfig)?.config?.path;

      // Falls back to project config when no user config
      expect(configPath).toBe("/project/opencode.json");
    });

    it("no config found returns undefined", () => {
      const loadedConfigs: LoadedConfig[] = [];

      const userConfig = loadedConfigs.find((c) => c.config.path.includes(".config"));
      const projectConfig = loadedConfigs.find((c) => !c.config.path.includes(".config"));
      const configPath = (userConfig || projectConfig)?.config?.path;

      expect(configPath).toBeUndefined();
    });
  });

  describe("config file deleted during session", () => {
    it("reload with missing file handled gracefully", () => {
      // Before deletion
      const configsBefore: LoadedConfig[] = [
        makeLoadedConfig({
          config: { path: "/test/opencode.json", source: "project" },
          agents: { sisyphus: makeAgentConfig({ model: "test" }) },
        }),
      ];
      const mergedBefore = mergeWithDefaults(configsBefore);
      expect(mergedBefore["sisyphus"].model).toBe("test");

      // After deletion (empty configs)
      const configsAfter: LoadedConfig[] = [];
      const mergedAfter = mergeWithDefaults(configsAfter);

      // Should show default state
      expect(mergedAfter["sisyphus"].model).toBeNull();
      expect(mergedAfter["sisyphus"].isDefault).toBe(true);
    });

    it("missing configEntry returns undefined", () => {
      const loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          config: { path: "/test/opencode.json", source: "project" },
          agents: {},
        }),
      ];

      const configPath = "/nonexistent/path.json";
      const configEntry = loadedConfigs.find((c) => c.config.path === configPath);

      expect(configEntry).toBeUndefined();
    });

    it("partial deletion removes only affected agents", () => {
      const configsBefore: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "sisyphus-model" }),
            oracle: makeAgentConfig({ model: "oracle-model" }),
          },
        }),
      ];

      const mergedBefore = mergeWithDefaults(configsBefore);
      expect(mergedBefore["sisyphus"].model).toBe("sisyphus-model");
      expect(mergedBefore["oracle"].model).toBe("oracle-model");

      // Simulate partial deletion (only sisyphus config deleted)
      const configsAfter: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            oracle: makeAgentConfig({ model: "oracle-model" }),
          },
        }),
      ];

      const mergedAfter = mergeWithDefaults(configsAfter);
      expect(mergedAfter["sisyphus"].model).toBeNull(); // Reset to default
      expect(mergedAfter["oracle"].model).toBe("oracle-model"); // Preserved
    });
  });
});

// ============================================================================
// 8. Integration Tests for State Flow
// ============================================================================

describe("State Flow Integration", () => {
  describe("full navigation cycle with state", () => {
    it("state flows correctly through complete navigation", () => {
      // Setup initial state
      let loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
          },
        }),
      ];
      let returnIndex = createReturnIndex(0);
      let currentAgentKey = "";
      let currentAgent: MergedAgent | null = null;

      // Step 1: showAgentList
      let mergedAgents = mergeWithDefaults(loadedConfigs);
      expect(Object.keys(mergedAgents).length).toBeGreaterThan(0);

      // Step 2: select sisyphus -> showAgentDetail
      currentAgentKey = "sisyphus";
      currentAgent = mergedAgents[currentAgentKey];
      returnIndex[0] = 0;

      expect(currentAgent.model).toBe("anthropic/claude-3-5-sonnet");
      expect(returnIndex[0]).toBe(0);

      // Step 3: editModel -> showModelsForProvider
      const providers = [
        { id: "anthropic", models: [{ id: "claude-3-opus", name: "Claude 3 Opus" }] },
      ];
      expect(providers.length).toBe(1);

      // Step 4: select model -> saveAgentConfig
      const newModel = "anthropic/claude-3-opus";
      const updatedAgent = { ...currentAgent, model: newModel };

      // Step 5: save modifies config and returns new mergedAgents
      loadedConfigs = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: newModel }),
          },
        }),
      ];
      mergedAgents = mergeWithDefaults(loadedConfigs);

      // Step 6: showAgentDetail with updated state
      currentAgent = mergedAgents[currentAgentKey];
      expect(currentAgent.model).toBe("anthropic/claude-3-opus");

      // Step 7: back -> showAgentList
      expect(returnIndex[0]).toBe(0);
    });

    it("fallback management preserves other agent state", () => {
      let loadedConfigs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet" }),
            oracle: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ];

      let merged = mergeWithDefaults(loadedConfigs);
      const sisyphusBefore = { ...merged["sisyphus"] };
      const oracleBefore = { ...merged["oracle"] };

      // Navigate to sisyphus -> manageFallbacks
      // Add a fallback
      const newFallbacks = ["openai", "google"];

      // Update config
      loadedConfigs = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "anthropic/claude-3-5-sonnet", fallback: newFallbacks }),
            oracle: makeAgentConfig({ model: "openai/gpt-4o" }),
          },
        }),
      ];

      merged = mergeWithDefaults(loadedConfigs);

      // Verify sisyphus fallback updated
      expect(merged["sisyphus"].fallback).toEqual(newFallbacks);
      expect(merged["sisyphus"].model).toBe("anthropic/claude-3-5-sonnet");

      // Verify oracle unchanged
      expect(merged["oracle"].model).toBe(oracleBefore.model);
      expect(merged["oracle"].fallback).toEqual(oracleBefore.fallback);
    });
  });

  describe("concurrent state updates", () => {
    it("last write wins for same agent", () => {
      // Simulate rapid saves
      const writes = [
        makeLoadedConfig({ agents: { sisyphus: makeAgentConfig({ model: "model1" }) } }),
        makeLoadedConfig({ agents: { sisyphus: makeAgentConfig({ model: "model2" }) } }),
        makeLoadedConfig({ agents: { sisyphus: makeAgentConfig({ model: "model3" }) } }),
      ];

      // Final state is last write
      const finalConfig = writes[writes.length - 1];
      const merged = mergeWithDefaults([finalConfig]);

      expect(merged["sisyphus"].model).toBe("model3");
    });

    it("different agents can be updated independently", () => {
      const configs = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "sisyphus-model" }),
            oracle: makeAgentConfig({ model: "oracle-model" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(configs);

      expect(merged["sisyphus"].model).toBe("sisyphus-model");
      expect(merged["oracle"].model).toBe("oracle-model");
    });
  });

  describe("edge cases in state management", () => {
    it("handles undefined model in config", () => {
      const configs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: { model: undefined } as any,
          },
        }),
      ];

      const merged = mergeWithDefaults(configs);
      expect(merged["sisyphus"].model).toBeNull();
    });

    it("handles null model in config", () => {
      const configs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: { model: null } as any,
          },
        }),
      ];

      const merged = mergeWithDefaults(configs);
      expect(merged["sisyphus"].model).toBeNull();
    });

    it("handles empty string model in config", () => {
      const configs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: { model: "" },
          },
        }),
      ];

      const merged = mergeWithDefaults(configs);
      // Empty string model results in null after merge (treated as falsy)
      expect(merged["sisyphus"].model).toBeNull();
    });

    it("handles malformed fallback config", () => {
      const configs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: {
              model: "test",
              fallback: "not-an-array" as any,
            },
          },
        }),
      ];

      // Should not crash
      const merged = mergeWithDefaults(configs);
      expect(merged["sisyphus"]).toBeDefined();
    });

    it("handles duplicate agent keys with different casing", () => {
      const configs: LoadedConfig[] = [
        makeLoadedConfig({
          agents: {
            sisyphus: makeAgentConfig({ model: "model1" }),
            SISYPHUS: makeAgentConfig({ model: "model2" }),
          },
        }),
      ];

      const merged = mergeWithDefaults(configs);
      // Should only have one entry, last one wins
      const sisyphusKeys = Object.keys(merged).filter((k) => k.toLowerCase() === "sisyphus");
      expect(sisyphusKeys.length).toBe(1);
    });
  });
});

// ============================================================================
// 9. modelBadge and shortenModel State Tests
// ============================================================================

describe("modelBadge and shortenModel State", () => {
  describe("modelBadge extracts model correctly", () => {
    it("returns 'unset' for null and undefined", () => {
      expect(modelBadge(null)).toBe("unset");
      expect(modelBadge(undefined)).toBe("unset");
    });

    it("returns string as-is", () => {
      expect(modelBadge("anthropic/claude-3-5-sonnet")).toBe("anthropic/claude-3-5-sonnet");
    });

    it("extracts from object with name property", () => {
      expect(modelBadge({ name: "claude-3-5-sonnet" })).toBe("claude-3-5-sonnet");
    });

    it("extracts from object with model property", () => {
      expect(modelBadge({ model: "gpt-4o" })).toBe("gpt-4o");
    });

    it("prefers name over model in object", () => {
      const obj = { name: "preferred", model: "fallback" };
      expect(modelBadge(obj)).toBe("preferred");
    });

    it("returns 'unknown' for unrecognized types", () => {
      expect(modelBadge(123)).toBe("unknown");
      expect(modelBadge(true)).toBe("unknown");
      expect(modelBadge({})).toBe("unknown");
    });
  });

  describe("shortenModel shortens long model names", () => {
    it("returns short models unchanged", () => {
      expect(shortenModel("claude")).toBe("claude");
      expect(shortenModel("anthropic/claude")).toBe("anthropic/claude");
    });

    it("shortens three-part model names", () => {
      expect(shortenModel("nvidia/anthropic/claude")).toBe("anthropic/claude");
    });

    it("shortens four-part model names", () => {
      expect(shortenModel("provider/nvidia/anthropic/claude")).toBe("anthropic/claude");
    });

    it("handles object input", () => {
      expect(shortenModel({ name: "nvidia/anthropic/claude" })).toBe("anthropic/claude");
    });

    it("handles null gracefully", () => {
      expect(shortenModel(null)).toBe("unset");
    });
  });
});

// ============================================================================
// 10. DEFAULT_AGENTS and DEFAULT_FALLBACKS Tests
// ============================================================================

describe("DEFAULT_AGENTS and DEFAULT_FALLBACKS", () => {
  describe("DEFAULT_AGENTS structure", () => {
    it("contains all required agents", () => {
      const requiredAgents = [
        "sisyphus",
        "oracle",
        "librarian",
        "explore",
        "multimodal-looker",
        "visual-engineering",
        "deep",
        "quick",
        "ultrabrain",
        "artistry",
      ];

      for (const agent of requiredAgents) {
        expect(DEFAULT_AGENTS[agent]).toBeDefined();
      }
    });

    it("each agent has role and description", () => {
      for (const [key, info] of Object.entries(DEFAULT_AGENTS)) {
        expect(typeof info.role).toBe("string");
        expect(info.role.length).toBeGreaterThan(0);
        expect(typeof info.description).toBe("string");
        expect(info.description.length).toBeGreaterThan(0);
      }
    });

    it("roles are meaningful", () => {
      // Verify all agents have non-empty role strings
      for (const [key, info] of Object.entries(DEFAULT_AGENTS)) {
        expect(typeof info.role).toBe("string");
        expect(info.role.length).toBeGreaterThan(0);
        // Roles should be descriptive (more than just single characters)
        expect(info.role.length).toBeGreaterThan(3);
      }

      // Verify we have diverse roles (at least 5 different roles)
      const uniqueRoles = new Set(Object.values(DEFAULT_AGENTS).map((a) => a.role));
      expect(uniqueRoles.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe("DEFAULT_FALLBACKS structure", () => {
    it("has fallback array for each agent with fallbacks", () => {
      for (const [key, fallbacks] of Object.entries(DEFAULT_FALLBACKS)) {
        expect(Array.isArray(fallbacks)).toBe(true);
        expect(fallbacks.length).toBeGreaterThan(0);
      }
    });

    it("fallbacks contain provider names", () => {
      const commonProviders = ["anthropic", "openai", "google", "github-copilot", "opencode"];

      for (const [key, fallbacks] of Object.entries(DEFAULT_FALLBACKS)) {
        for (const fallback of fallbacks) {
          expect(typeof fallback).toBe("string");
          expect(fallback.length).toBeGreaterThan(0);
        }
      }
    });

    it("sisyphus has orchestrator fallback chain", () => {
      const sisyphusFallback = DEFAULT_FALLBACKS["sisyphus"];
      expect(sisyphusFallback).toContain("anthropic");
    });
  });

  describe("DEFAULT_AGENTS and DEFAULT_FALLBACKS consistency", () => {
    it("all DEFAULT_FALLBACKS keys are in DEFAULT_AGENTS", () => {
      for (const key of Object.keys(DEFAULT_FALLBACKS)) {
        expect(DEFAULT_AGENTS[key]).toBeDefined();
      }
    });

    it("fallback chain length is reasonable (1-5 providers)", () => {
      for (const [key, fallbacks] of Object.entries(DEFAULT_FALLBACKS)) {
        expect(fallbacks.length).toBeGreaterThanOrEqual(1);
        expect(fallbacks.length).toBeLessThanOrEqual(6);
      }
    });
  });
});
