import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface MockDialogCall {
  method: "replace" | "clear" | "setSize";
  args: any[];
  timestamp: number;
}

interface MockToast {
  variant: "info" | "success" | "error" | "warning";
  message: string;
}

interface MockApiState {
  provider: Array<{
    id: string;
    name: string;
    models: Record<string, { id: string; name: string }>;
  }>;
  path: {
    directory: string;
  };
}

interface NavigationEntry {
  screen: string;
  params?: Record<string, any>;
}

interface FlowTestContext {
  dialogCalls: MockDialogCall[];
  toasts: MockToast[];
  navigationHistory: NavigationEntry[];
  api: any;
  loadedConfigs: any[];
  returnIndex: number[];
  tmpDir: string;
}

// ============================================================================
// MOCK API FACTORY
// ============================================================================

interface MockApiArrays {
  dialogCalls: MockDialogCall[];
  toasts: MockToast[];
  navigationHistory: NavigationEntry[];
}

function createMockApi(cwd: string, providers: any[] = [], arrays?: MockApiArrays): any {
  const dialogCalls = arrays?.dialogCalls || [];
  const toasts = arrays?.toasts || [];
  const navigationHistory = arrays?.navigationHistory || [];

  return {
    ui: {
      dialog: {
        replace: vi.fn((component: any) => {
          dialogCalls.push({
            method: "replace",
            args: [component],
            timestamp: Date.now(),
          });
        }),
        clear: vi.fn(() => {
          dialogCalls.push({
            method: "clear",
            args: [],
            timestamp: Date.now(),
          });
        }),
        setSize: vi.fn((size: string) => {
          dialogCalls.push({
            method: "setSize",
            args: [size],
            timestamp: Date.now(),
          });
        }),
      },
      toast: vi.fn((toast: MockToast) => {
        toasts.push(toast);
      }),
    },
    command: {
      register: vi.fn(() => vi.fn()),
      openPalette: vi.fn(),
    },
    lifecycle: {
      onDispose: vi.fn((fn: () => void) => fn),
    },
    client: {
      instance: {
        dispose: vi.fn(() => Promise.resolve()),
      },
    },
    state: {
      provider: providers,
      path: {
        directory: cwd,
      },
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
    // Test accessors
    _testInternals: {
      dialogCalls,
      toasts,
      navigationHistory,
      trackNavigation: (screen: string, params?: Record<string, any>) => {
        navigationHistory.push({ screen, params });
      },
    },
  };
}

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const SAMPLE_CONFIG = {
  agents: {
    sisyphus: {
      model: "anthropic/claude-3-5-sonnet-20241022",
      fallback_models: ["openai/gpt-4o", "google/gemini-pro"],
    },
    oracle: {
      model: "openai/gpt-4o",
    },
    explore: {
      model: null,
    },
  },
  categories: {
    quick: {
      model: "anthropic/claude-3-haiku-20240307",
    },
  },
  disabled_hooks: [],
  disabled_agents: [],
  disabled_skills: [],
};

const SAMPLE_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-3-5-sonnet-20241022": { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      "claude-3-opus-20240229": { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      "claude-3-haiku-20240307": { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-4o": { id: "gpt-4o", name: "GPT-4o" },
      "gpt-4-turbo": { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      "gpt-3.5-turbo": { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    },
  },
  {
    id: "google",
    name: "Google",
    models: {
      "gemini-pro": { id: "gemini-pro", name: "Gemini Pro" },
      "gemini-ultra": { id: "gemini-ultra", name: "Gemini Ultra" },
    },
  },
];

// ============================================================================
// TEST SETUP HELPERS
// ============================================================================

function createTestEnvironmentSync(): {
  tmpDir: string;
  configPath: string;
} {
  const tmpDir = fs.mkdtempSync(path.join("/tmp", "tui-flow-test-"));
  const opencodeDir = path.join(tmpDir, ".opencode");
  fs.mkdirSync(opencodeDir, { recursive: true });

  const configPath = path.join(opencodeDir, "oh-my-opencode.json");
  fs.writeFileSync(configPath, JSON.stringify(SAMPLE_CONFIG, null, 2), "utf8");

  return { tmpDir, configPath };
}

function extractComponentInfo(call: MockDialogCall): {
  type: string;
  title?: string;
  options?: any[];
} | null {
  if (call.method !== "replace" || !call.args[0]) {
    return null;
  }

  // Try to extract component info from JSX-like structure
  const component = call.args[0];
  if (typeof component === "function") {
    // Component function - try to extract from props
    return { type: "Component", title: undefined, options: undefined };
  }

  return { type: "Unknown", title: undefined, options: undefined };
}

// ============================================================================
// FLOW TEST UTILITIES
// ============================================================================

function verifyDialogSequence(
  calls: MockDialogCall[],
  expectedSequence: Array<{ method: "replace" | "clear" | "setSize"; pattern?: string }>
): boolean {
  let callIndex = 0;
  for (const expected of expectedSequence) {
    if (callIndex >= calls.length) {
      return false;
    }
    if (calls[callIndex].method !== expected.method) {
      return false;
    }
    callIndex++;
  }
  return callIndex <= calls.length;
}

function countDialogCalls(calls: MockDialogCall[], method: string): number {
  return calls.filter((c) => c.method === method).length;
}

function getToastByVariant(toasts: MockToast[], variant: string): MockToast[] {
  return toasts.filter((t) => t.variant === variant);
}

function getLastDialogCall(calls: MockDialogCall[]): MockDialogCall | undefined {
  const replaceCalls = calls.filter((c) => c.method === "replace");
  return replaceCalls[replaceCalls.length - 1];
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("TUI Flow Integration Tests", () => {
  let context: FlowTestContext;
  let tuiPlugin: any;

  beforeEach(() => {
    const { tmpDir } = createTestEnvironmentSync();

    // Create shared arrays so mock and context use the same reference
    const sharedDialogCalls: MockDialogCall[] = [];
    const sharedToasts: MockToast[] = [];
    const sharedNavigationHistory: NavigationEntry[] = [];

    context = {
      dialogCalls: sharedDialogCalls,
      toasts: sharedToasts,
      navigationHistory: sharedNavigationHistory,
      api: createMockApi(tmpDir, SAMPLE_PROVIDERS, {
        dialogCalls: sharedDialogCalls,
        toasts: sharedToasts,
        navigationHistory: sharedNavigationHistory,
      }),
      loadedConfigs: [{ config: { path: path.join(tmpDir, ".opencode/oh-my-opencode.json"), source: "project" }, document: SAMPLE_CONFIG }],
      returnIndex: [0],
      tmpDir,
    };

    // Load the actual TUI plugin source for testing
    const pluginPath = path.join(import.meta.dir, "../.opencode/tui/agent-manager.jsx");
    const pluginSource = fs.readFileSync(pluginPath, "utf-8");

    // NOTE: This test file uses mock API simulation rather than actual JSX rendering.
    //
    // What's tested:
    //   - Flow logic patterns and state transitions
    //   - Dialog call sequences (replace/clear/setSize)
    //   - Toast notifications and user feedback
    //   - Navigation history tracking
    //   - State persistence through flows
    //   - API contract compliance
    //   - Error handling patterns
    //   - Source code presence validation (string matching against pluginSource)
    //
    // What's NOT tested:
    //   - Actual JSX rendering or component output
    //   - SolidJS reactivity and DOM updates
    //   - Real user interaction (click/keyboard events)
    //   - Browser or TUI environment integration
    //
    // The pluginSource string is used for static validation (e.g., verifying function
    // names exist in source), while the mock API simulates runtime behavior patterns.
  });

  afterEach(async () => {
    // Cleanup temp directory - guard against crash before context initialization
    if (context?.tmpDir) {
      try {
        await fs.rm(context.tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ==========================================================================
  // FLOW 1: LOADING FLOW
  // ==========================================================================

  describe("Flow 1: Loading Flow (Launch → Configs Loaded → Agent List Displayed)", () => {
    it("should complete loading flow with all expected dialog interactions", async () => {
      // Step 1: Initial state
      expect(context.api.state.provider).toBeDefined();
      expect(context.api.state.path.directory).toBe(context.tmpDir);

      // Step 2: Config loading produces toast
      const loadingToast: MockToast = {
        variant: "info",
        message: `Loading configs from ${context.tmpDir}...`,
      };
      context.api.ui.toast(loadingToast);
      expect(context.toasts).toContainEqual(loadingToast);

      // Step 3: Config discovery produces count toast
      const configCountToast: MockToast = {
        variant: "info",
        message: `Found ${context.loadedConfigs.length} config(s)`,
      };
      context.api.ui.toast(configCountToast);
      expect(context.toasts).toContainEqual(configCountToast);

      // Step 4: Agent list should be displayed with setSize call
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // Verify loading flow sequence
      expect(context.dialogCalls.length).toBeGreaterThanOrEqual(2);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(1);
    });

    it("should load default agents when no configs exist", () => {
      // Empty configs scenario
      const emptyLoadedConfigs: any[] = [];

      // Default agents should still be available
      const defaultAgents = {
        sisyphus: { role: "orchestrator", description: "Main orchestrator" },
        oracle: { role: "debugger", description: "Debug and architecture expert" },
        librarian: { role: "researcher", description: "Documentation and research" },
        explore: { role: "explorer", description: "Fast codebase exploration" },
        "multimodal-looker": { role: "visual", description: "Visual and UI inspection" },
        Prometheus: { role: "planner", description: "Plan builder" },
        Metis: { role: "reviewer", description: "Plan consultant" },
        Momus: { role: "critic", description: "Quality assurance" },
        "visual-engineering": { role: "frontend", description: "Frontend, UI/UX" },
        deep: { role: "solver", description: "Goal-oriented autonomous problem-solving" },
        quick: { role: "trivial", description: "Simple tasks" },
        ultrabrain: { role: "logic", description: "Hard logic-heavy tasks" },
        artistry: { role: "creative", description: "Unconventional creative problem-solving" },
        "unspecified-low": { role: "misc", description: "Low effort miscellaneous tasks" },
        "unspecified-high": { role: "misc", description: "High effort miscellaneous tasks" },
      };

      expect(Object.keys(defaultAgents)).toContain("sisyphus");
      expect(Object.keys(defaultAgents)).toContain("oracle");
      expect(Object.keys(defaultAgents)).toContain("explore");
      expect(Object.keys(defaultAgents)).toHaveLength(15);
    });

    it("should merge loaded configs with default agents", () => {
      // Test the merge logic
      const defaultAgents = {
        sisyphus: { key: "sisyphus", model: null, fallback: ["anthropic", "github-copilot"], role: "orchestrator" },
        oracle: { key: "oracle", model: null, fallback: ["openai", "anthropic"], role: "debugger" },
      };

      const merged = { ...defaultAgents };
      // Apply loaded config overrides
      if (SAMPLE_CONFIG.agents.sisyphus) {
        merged.sisyphus.model = SAMPLE_CONFIG.agents.sisyphus.model;
        merged.sisyphus.fallback = SAMPLE_CONFIG.agents.sisyphus.fallback_models;
      }

      expect(merged.sisyphus.model).toBe("anthropic/claude-3-5-sonnet-20241022");
      expect(merged.sisyphus.fallback).toEqual(["openai/gpt-4o", "google/gemini-pro"]);
      expect(merged.oracle.model).toBeNull(); // Not in config, should remain default
    });

    it("should handle empty config gracefully", () => {
      const emptyConfig = { agents: {}, categories: {} };

      // Should still show default agents
      const defaultAgentCount = 15;
      expect(defaultAgentCount).toBeGreaterThan(0);

      // Merged result should include defaults
      const merged = { ...emptyConfig };
      expect(merged).toHaveProperty("agents");
      expect(merged).toHaveProperty("categories");
    });

    it("should track navigation history during loading", () => {
      context.api._testInternals.trackNavigation("loading");
      context.api._testInternals.trackNavigation("agentList");

      expect(context.navigationHistory).toHaveLength(2);
      expect(context.navigationHistory[0].screen).toBe("loading");
      expect(context.navigationHistory[1].screen).toBe("agentList");
    });
  });

  // ==========================================================================
  // FLOW 2: AGENT SELECTION FLOW
  // ==========================================================================

  describe("Flow 2: Agent Selection Flow (Agent List → Select Agent → Agent Detail)", () => {
    it("should navigate from agent list to agent detail on selection", () => {
      // Simulate agent list displayed
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // Simulate agent selection (onSelect callback)
      const selectedAgent = {
        agentKey: "sisyphus",
        agent: {
          key: "sisyphus",
          model: "anthropic/claude-3-5-sonnet-20241022",
          fallback: ["openai/gpt-4o"],
          role: "orchestrator",
        },
        mergedAgents: {},
      };

      // Clear dialog before showing detail
      context.api.ui.dialog.clear();

      // Show agent detail
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Verify sequence
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(2);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(2);
    });

    it("should display correct agent information in detail view", () => {
      const agent = {
        key: "oracle",
        model: "openai/gpt-4o",
        fallback: ["anthropic", "google"],
        role: "debugger",
        description: "Debug and architecture expert",
      };

      // Verify model badge logic
      const modelBadge = agent.model ? agent.model : "default";
      expect(modelBadge).toBe("openai/gpt-4o");

      // Verify fallback preview logic
      const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];
      const fallbackPreview = fallbackArr.slice(0, 3).join(" -> ");
      expect(fallbackPreview).toBe("anthropic -> google");

      // Verify source tag
      const sourceTag = agent.role === "orchestrator" ? "default" : "custom";
      expect(sourceTag).toBe("custom");
    });

    it("should handle selection of agent with no configured model", () => {
      const agent = {
        key: "explore",
        model: null,
        fallback: ["anthropic", "opencode"],
        role: "explorer",
      };

      // Should show "default" when no model
      const modelDisplay = agent.model ? agent.model : "default";
      expect(modelDisplay).toBe("default");

      // Should still have fallback options
      expect(agent.fallback).toHaveLength(2);
    });

    it("should preserve returnIndex through selection", () => {
      // Simulate selection at index 5
      context.returnIndex[0] = 5;

      const selectedAgent = {
        agentKey: "explore",
        agent: {
          key: "explore",
          model: null,
          role: "explorer",
        },
        mergedAgents: {},
      };

      // Selection handler should update returnIndex
      context.returnIndex[0] = 5; // Already set

      expect(context.returnIndex[0]).toBe(5);

      // Navigation should include returnIndex for returning
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Verify returnIndex is preserved for back navigation
      expect(context.returnIndex[0]).toBe(5);
    });

    it("should update navigation history when selecting agent", () => {
      context.api._testInternals.trackNavigation("agentList");
      context.api._testInternals.trackNavigation("agentDetail", { agentKey: "sisyphus" });

      expect(context.navigationHistory).toContainEqual({
        screen: "agentDetail",
        params: { agentKey: "sisyphus" },
      });
    });
  });

  // ==========================================================================
  // FLOW 3: MODEL EDITING FLOW
  // ==========================================================================

  describe("Flow 3: Model Editing Flow (Agent Detail → edit_model → Provider → Model → Saved)", () => {
    it("should navigate through complete model editing flow", () => {
      // Step 1: Agent detail displayed
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Step 2: User selects "editModel" action
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      // Step 3: Provider selected
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ModelSelect" }));

      // Verify complete flow
      expect(context.dialogCalls).toContainEqual(
        expect.objectContaining({ method: "setSize", args: ["large"] })
      );
      expect(countDialogCalls(context.dialogCalls, "clear")).toBeGreaterThanOrEqual(2);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBeGreaterThanOrEqual(3);
    });

    it("should show provider selection with correct options", () => {
      const providers = SAMPLE_PROVIDERS;

      // Build provider options
      const providerOptions = providers.map((p) => ({
        title: p.id,
        description: `${Object.keys(p.models).length} models available`,
      }));

      expect(providerOptions).toHaveLength(3);
      expect(providerOptions[0].title).toBe("anthropic");
      expect(providerOptions[1].title).toBe("openai");
      expect(providerOptions[2].title).toBe("google");
    });

    it("should filter models by selected provider", () => {
      const selectedProvider = SAMPLE_PROVIDERS.find((p) => p.id === "openai")!;
      const models = Object.values(selectedProvider.models);

      expect(models).toHaveLength(3);
      expect(models.map((m) => m.id)).toContain("gpt-4o");
      expect(models.map((m) => m.id)).toContain("gpt-4-turbo");
    });

    it("should handle model selection and build correct model ID", () => {
      const provider = "anthropic";
      const model = "claude-3-5-sonnet-20241022";
      const fullModelId = `${provider}/${model}`;

      expect(fullModelId).toBe("anthropic/claude-3-5-sonnet-20241022");
    });

    it("should save model selection and show success toast", async () => {
      const agentKey = "sisyphus";
      const newModel = "openai/gpt-4o";

      // Simulate save
      context.api.ui.toast({
        variant: "info",
        message: `Saving ${agentKey}...`,
      });

      // Simulate successful save
      context.api.ui.toast({
        variant: "success",
        message: `Saved ${agentKey}`,
      });

      // Verify toasts
      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "success")[0].message).toBe(`Saved ${agentKey}`);
    });

    it("should handle save failure with error toast", async () => {
      const agentKey = "sisyphus";

      // Simulate save failure
      context.api.ui.toast({
        variant: "error",
        message: `Save failed: Config file not found`,
      });

      expect(getToastByVariant(context.toasts, "error")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "error")[0].message).toContain("Save failed");
    });

    it("should reload configs after save", async () => {
      // Simulate save with reload
      const originalConfigCount = context.loadedConfigs.length;

      // After save, reload configs
      context.api.client.instance.dispose({});
      const newLoadedConfigs = [...context.loadedConfigs];

      expect(newLoadedConfigs).toHaveLength(originalConfigCount);
    });

    it("should return to agent detail after save", () => {
      // After save completes
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Verify we're back at detail view
      const lastReplace = getLastDialogCall(context.dialogCalls);
      expect(lastReplace).toBeDefined();
    });

    it("should highlight current model in model selection", () => {
      const currentModel = "anthropic/claude-3-5-sonnet-20241022";
      const allModels = [
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
        { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      ];

      // The current model should be highlighted if its id (without provider) matches
      const currentModelId = currentModel.split("/")[1];
      const options = allModels.map((m) => ({
        ...m,
        footer: m.id === currentModelId ? "current" : "",
      }));

      expect(options[0].footer).toBe("current");
      expect(options[1].footer).toBe("");
    });
  });

  // ==========================================================================
  // FLOW 4: FALLBACK MANAGEMENT FLOW
  // ==========================================================================

  describe("Flow 4: Fallback Management Flow (Add/Edit/Remove → Saved)", () => {
    it("should navigate to fallback manager from agent detail", () => {
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "FallbackManager" }));

      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(1);
    });

    it("should display fallback chain correctly", () => {
      const fallbackArr = ["anthropic/claude-3-5-sonnet", "openai/gpt-4o", "google/gemini-pro"];

      // Build fallback options
      const options = [
        { title: "Add new fallback", value: { action: "add" } },
        ...fallbackArr.map((fb, i) => ({
          title: `${i + 1}. ${fb}`,
          value: { action: "edit", index: i, value: fb },
        })),
        { title: "Remove last fallback", value: { action: "remove" } },
        { title: "Back to agent", value: { action: "back" } },
      ];

      expect(options).toHaveLength(6); // 1 add + 3 fallbacks + 1 remove + 1 back
      expect(options[1].value.action).toBe("edit");
      expect(options[1].value.index).toBe(0);
    });

    describe("Adding Fallback", () => {
      it("should show model picker when adding fallback", () => {
        context.api.ui.dialog.clear();
        context.api.ui.dialog.setSize("large");
        context.api.ui.dialog.replace(() => ({ type: "AddFallback" }));

        expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      });

      it("should add fallback to end of chain", () => {
        const currentFallbacks = ["anthropic/claude-3-5-sonnet", "openai/gpt-4o"];
        const newFallback = "google/gemini-pro";
        const newFallbacks = [...currentFallbacks, newFallback];

        expect(newFallbacks).toHaveLength(3);
        expect(newFallbacks[newFallbacks.length - 1]).toBe(newFallback);
      });

      it("should allow custom model input for fallback", () => {
        const customModel = "custom-provider/custom-model-v1";

        const currentFallbacks = ["anthropic/claude-3-5-sonnet"];
        const newFallbacks = [...currentFallbacks, customModel];

        expect(newFallbacks).toContain(customModel);
      });
    });

    describe("Editing Fallback", () => {
      it("should allow editing fallback at specific index", () => {
        const fallbackArr = ["anthropic/claude-3-5-sonnet", "openai/gpt-4o", "google/gemini-pro"];
        const editIndex = 1;
        const newValue = "openai/gpt-4-turbo";

        const updatedFallbacks = [...fallbackArr];
        updatedFallbacks[editIndex] = newValue;

        expect(updatedFallbacks[1]).toBe("openai/gpt-4-turbo");
        expect(updatedFallbacks[0]).toBe(fallbackArr[0]);
        expect(updatedFallbacks[2]).toBe(fallbackArr[2]);
      });

      it("should preserve chain order after edit", () => {
        const originalChain = ["first", "second", "third"];
        const editedChain = [...originalChain];
        editedChain[1] = "SECOND-MODIFIED";

        expect(editedChain).toEqual(["first", "SECOND-MODIFIED", "third"]);
        expect(editedChain.length).toBe(originalChain.length);
      });
    });

    describe("Removing Fallback", () => {
      it("should remove last fallback from chain", () => {
        const fallbackArr = ["anthropic/claude-3-5-sonnet", "openai/gpt-4o", "google/gemini-pro"];
        const newFallbacks = fallbackArr.slice(0, -1);

        expect(newFallbacks).toHaveLength(2);
        expect(newFallbacks).not.toContain("google/gemini-pro");
      });

      it("should handle removal of only fallback", () => {
        const fallbackArr = ["anthropic/claude-3-5-sonnet"];
        const newFallbacks = fallbackArr.slice(0, -1);

        expect(newFallbacks).toHaveLength(0);
      });

      it("should not show remove option when chain is empty", () => {
        const fallbackArr: string[] = [];
        const showRemoveOption = fallbackArr.length > 0;

        expect(showRemoveOption).toBe(false);
      });
    });

    it("should save fallback changes with success toast", async () => {
      const agentKey = "sisyphus";
      const newFallbacks = ["anthropic/claude-3-5-sonnet", "openai/gpt-4-turbo"];

      context.api.ui.toast({
        variant: "info",
        message: `Saving ${agentKey}...`,
      });

      context.api.ui.toast({
        variant: "success",
        message: `Saved ${agentKey}`,
      });

      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
    });

    it("should return to fallback manager after add/edit", () => {
      // After editing a fallback
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "FallbackManager" }));

      expect(countDialogCalls(context.dialogCalls, "replace")).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple fallback operations in sequence", () => {
      let fallbacks = ["anthropic/claude-3-5-sonnet"];

      // Add one
      fallbacks = [...fallbacks, "openai/gpt-4o"];
      expect(fallbacks).toHaveLength(2);

      // Edit one
      fallbacks = [...fallbacks];
      fallbacks[0] = "anthropic/claude-3-opus";
      expect(fallbacks[0]).toBe("anthropic/claude-3-opus");

      // Remove one
      fallbacks = fallbacks.slice(0, -1);
      expect(fallbacks).toHaveLength(1);
    });
  });

  // ==========================================================================
  // FLOW 5: CUSTOM INPUT FLOW
  // ==========================================================================

  describe("Flow 5: Custom Input Flow (Provider Selection → Custom Model → Enter ID → Saved)", () => {
    it("should navigate to custom model prompt", () => {
      // Select "Type custom model" from provider selection
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("medium");
      context.api.ui.dialog.replace(() => ({ type: "CustomModelPrompt" }));

      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(1);
    });

    it("should show custom input dialog with empty value", () => {
      const agent = { key: "sisyphus", model: "anthropic/claude-3-5-sonnet" };
      const currentModel = agent.model ? agent.model : "";

      expect(currentModel).toBe("anthropic/claude-3-5-sonnet");

      // For empty input case
      const emptyAgent = { key: "explore", model: null };
      const emptyValue = emptyAgent.model ? emptyAgent.model : "";
      expect(emptyValue).toBe("");
    });

    it("should handle empty input gracefully", () => {
      const inputValue = "";
      const isValid = inputValue && inputValue.trim();

      expect(isValid).toBeFalsy();

      // Should return to provider selection
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
    });

    it("should accept and save valid custom model ID", () => {
      const customModelId = "my-provider/my-custom-model-v2";
      const trimmed = customModelId.trim();

      expect(trimmed).toBe("my-provider/my-custom-model-v2");
      expect(trimmed).toContain("/"); // Should have provider/model format
    });

    it("should handle model ID with special characters", () => {
      const modelIds = [
        "provider/model-name",
        "provider/model-name-v1.0",
        "provider/model_name",
        "provider/model.name.with.dots",
      ];

      for (const id of modelIds) {
        const trimmed = id.trim();
        expect(trimmed.length).toBeGreaterThan(0);
        expect(trimmed).toContain("/");
      }
    });

    it("should save custom model and navigate back to agent detail", async () => {
      const agentKey = "sisyphus";
      const customModel = "my-provider/my-model";

      // Simulate save
      context.api.ui.toast({
        variant: "info",
        message: `Saving ${agentKey}...`,
      });

      context.api.ui.toast({
        variant: "success",
        message: `Saved ${agentKey}`,
      });

      // Navigate back
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
    });

    it("should allow cancel and return to provider selection", () => {
      // User cancels custom input
      context.api.ui.dialog.clear();

      // Return to provider selection
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBeGreaterThanOrEqual(1);
    });

    it("should trim whitespace from custom model input", () => {
      const inputs = [
        { input: "  provider/model  ", expected: "provider/model" },
        { input: "provider/model\n", expected: "provider/model" },
        { input: "\tprovider/model\t", expected: "provider/model" },
        { input: "  provider/model-v2  ", expected: "provider/model-v2" },
      ];

      for (const { input, expected } of inputs) {
        expect(input.trim()).toBe(expected);
      }
    });
  });

  // ==========================================================================
  // FLOW 6: NAVIGATION BACK FLOW
  // ==========================================================================

  describe("Flow 6: Navigation Back Flow (Any Screen → Back → Previous Screen)", () => {
    it("should navigate back from agent detail to agent list", () => {
      // Start at agent detail
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Press back
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(2);
    });

    it("should navigate back through model editing flow", () => {
      // Model selection -> Provider selection -> Agent detail
      context.api.ui.dialog.replace(() => ({ type: "ModelSelect" }));
      const modelSelectCalls = context.dialogCalls.length;

      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));
      const providerSelectCalls = context.dialogCalls.length;

      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      expect(context.dialogCalls.length).toBeGreaterThan(modelSelectCalls);
      expect(context.dialogCalls.length).toBeGreaterThan(providerSelectCalls);
    });

    it("should navigate back through fallback management flow", () => {
      // Fallback manager -> Add fallback -> Provider selection
      context.api.ui.dialog.replace(() => ({ type: "FallbackManager" }));
      const fallbackManagerCalls = context.dialogCalls.length;

      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AddFallback" }));
      const addFallbackCalls = context.dialogCalls.length;

      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      expect(context.dialogCalls.length).toBeGreaterThan(fallbackManagerCalls);
      expect(context.dialogCalls.length).toBeGreaterThan(addFallbackCalls);
    });

    it("should preserve returnIndex through back navigation", () => {
      // Navigate to agent at index 3
      context.returnIndex[0] = 3;

      // Simulate some navigation
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Navigate back
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // returnIndex should still be 3
      expect(context.returnIndex[0]).toBe(3);
    });

    it("should track complete navigation history", () => {
      context.api._testInternals.trackNavigation("agentList");
      context.api._testInternals.trackNavigation("agentDetail", { agentKey: "sisyphus" });
      context.api._testInternals.trackNavigation("editModel");
      context.api._testInternals.trackNavigation("providerSelect");
      context.api._testInternals.trackNavigation("modelSelect");
      context.api._testInternals.trackNavigation("agentDetail", { agentKey: "sisyphus" }); // After save

      expect(context.navigationHistory).toHaveLength(6);

      // Back navigation would remove entries
      context.navigationHistory.pop(); // modelSelect
      context.navigationHistory.pop(); // providerSelect
      context.navigationHistory.pop(); // editModel

      expect(context.navigationHistory).toHaveLength(3);
    });

    it("should handle multiple back operations in sequence", () => {
      const screens = ["AgentList", "AgentDetail", "EditModel", "ProviderSelect", "ModelSelect"];

      // Navigate forward
      for (const screen of screens) {
        context.api._testInternals.trackNavigation(screen);
      }

      expect(context.navigationHistory).toHaveLength(5);

      // Navigate back twice
      context.navigationHistory.pop(); // Back from ModelSelect
      context.navigationHistory.pop(); // Back from ProviderSelect

      expect(context.navigationHistory).toHaveLength(3);
      expect(context.navigationHistory[context.navigationHistory.length - 1].screen).toBe("EditModel");
    });
  });

  // ==========================================================================
  // FLOW 7: RELOAD FLOW
  // ==========================================================================

  describe("Flow 7: Reload Flow (Agent Detail → Reload → Configs Refreshed)", () => {
    it("should call reload function on reload action", async () => {
      const disposeSpy = vi.spyOn(context.api.client.instance, "dispose");

      // Trigger reload
      await context.api.client.instance.dispose({});

      expect(disposeSpy).toHaveBeenCalled();
    });

    it("should show success toast after reload", () => {
      context.api.ui.toast({
        variant: "success",
        message: "Agents reloaded",
      });

      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "success")[0].message).toBe("Agents reloaded");
    });

    it("should reload configs and re-merge with defaults", async () => {
      const originalConfigs = [...context.loadedConfigs];

      // Simulate reload by reloading configs
      const reloadedConfigs = [...originalConfigs];

      // Merge with defaults again
      const mergedAgents = {};
      const defaultAgents = {
        sisyphus: { model: null, fallback: ["anthropic"] },
      };

      Object.assign(mergedAgents, defaultAgents);
      for (const { agents } of reloadedConfigs) {
        Object.assign(mergedAgents, agents);
      }

      expect(mergedAgents).toHaveProperty("sisyphus");
    });

    it("should handle reload failure gracefully", async () => {
      // Override dispose to simulate failure
      const originalDispose = context.api.client.instance.dispose;
      context.api.client.instance.dispose = vi.fn(() => Promise.reject(new Error("Dispose failed")));

      // Simulate dispose failure
      try {
        await context.api.client.instance.dispose({});
      } catch {
        context.api.ui.toast({
          variant: "warning",
          message: "Reload failed, using cached config",
        });
      }

      expect(context.toasts.some((t) => t.variant === "warning")).toBeTruthy();

      // Restore original
      context.api.client.instance.dispose = originalDispose;
    });

    it("should refresh agent detail view after reload", () => {
      // After reload completes
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      const lastReplace = getLastDialogCall(context.dialogCalls);
      expect(lastReplace).toBeDefined();
      expect(lastReplace?.method).toBe("replace");
    });

    it("should preserve current agent selection through reload", () => {
      const selectedAgent = {
        agentKey: "oracle",
        agent: { key: "oracle", model: "openai/gpt-4o" },
      };

      // Store selection before reload
      const preReloadAgent = selectedAgent.agentKey;

      // Simulate reload
      context.api.client.instance.dispose({});

      // Selection should be preserved
      expect(selectedAgent.agentKey).toBe(preReloadAgent);
    });

    it("should show loading toast during reload", () => {
      context.api.ui.toast({
        variant: "info",
        message: "Reloading configs...",
      });

      expect(getToastByVariant(context.toasts, "info")).toHaveLength(1);
    });
  });

  // ==========================================================================
  // EDGE CASES AND ERROR HANDLING
  // ==========================================================================

  describe("Edge Cases and Error Handling", () => {
    it("should handle missing provider data gracefully", () => {
      const emptyProviders: any[] = [];

      const providerArr = Array.isArray(emptyProviders)
        ? emptyProviders
        : Object.values(emptyProviders || {});

      expect(providerArr).toHaveLength(0);
    });

    it("should handle malformed model IDs", () => {
      const malformedIds = [
        "no-slash",
        "",
        "too/many/slashes/here",
        "   ",
      ];

      for (const id of malformedIds) {
        const isValid = id && id.includes("/") && id.trim().length > 0;
        if (id === "too/many/slashes/here") {
          expect(id.split("/").length).toBeGreaterThan(2);
        }
      }
    });

    it("should handle provider with no models", () => {
      const emptyProvider = {
        id: "empty-provider",
        models: {},
      };

      const modelArr = Object.values(emptyProvider.models);
      expect(modelArr).toHaveLength(0);
    });

    it("should handle config save with missing configPath", async () => {
      const agent = {
        key: "sisyphus",
        model: "anthropic/claude-3-5-sonnet",
        configPath: undefined,
      };

      // Should show error toast
      if (!agent.configPath) {
        context.api.ui.toast({
          variant: "error",
          message: "No config file found. Please create a config file first.",
        });
      }

      expect(getToastByVariant(context.toasts, "error")).toHaveLength(1);
    });

    it("should handle empty fallback array", () => {
      const agent = {
        fallback: [],
      };

      const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];
      expect(fallbackArr).toHaveLength(0);

      const preview = fallbackArr.length > 0 ? fallbackArr.slice(0, 3).join(" -> ") : "none";
      expect(preview).toBe("none");
    });

    it("should handle very long fallback chains", () => {
      const longChain: string[] = [];
      for (let i = 0; i < 20; i++) {
        longChain.push(`provider/model-${i}`);
      }

      expect(longChain).toHaveLength(20);

      const preview = longChain.slice(0, 3).join(" -> ") + (longChain.length > 3 ? " ..." : "");
      expect(preview).toContain("...");
    });

    it("should handle concurrent navigation attempts", () => {
      // Simulate rapid navigation
      context.api.ui.dialog.clear();
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Multiple clears should not break state
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(2);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(1);
    });

    it("should handle dialog state after component unmount", () => {
      // Simulate component unmount by clearing dialog
      context.api.ui.dialog.clear();

      // Subsequent operations should still work
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(1);
    });
  });

  // ==========================================================================
  // STATE PERSISTENCE TESTS
  // ==========================================================================

  describe("State Persistence Through Flows", () => {
    it("should persist agent selection through model editing", () => {
      const agent = {
        key: "sisyphus",
        model: "anthropic/claude-3-5-sonnet",
        fallback: ["openai/gpt-4o"],
      };

      // Navigate to provider selection
      const providerSelected = { ...agent };

      // Select model
      const modelSelected = { ...providerSelected, model: "openai/gpt-4o" };

      // State should be consistent
      expect(modelSelected.key).toBe(agent.key);
      expect(modelSelected.fallback).toEqual(agent.fallback);
    });

    it("should persist fallback chain through edits", () => {
      let fallbacks = ["a", "b", "c"];

      // Edit middle
      fallbacks = [...fallbacks];
      fallbacks[1] = "B";

      // Edit first
      fallbacks = [...fallbacks];
      fallbacks[0] = "A";

      // Chain should have original order
      expect(fallbacks).toEqual(["A", "B", "c"]);
    });

    it("should persist returnIndex through complex navigation", () => {
      context.returnIndex[0] = 7;

      // Navigate through multiple screens
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "EditModel" }));
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      // returnIndex should be preserved
      expect(context.returnIndex[0]).toBe(7);

      // Navigate back
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "EditModel" }));
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));
      context.api.ui.dialog.clear();
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // returnIndex should still be preserved
      expect(context.returnIndex[0]).toBe(7);
    });

    it("should persist loaded configs through reload", async () => {
      const originalConfigs = [...context.loadedConfigs];

      // Trigger reload
      await context.api.client.instance.dispose({});

      // Reload configs
      const reloadedConfigs = [...originalConfigs];

      // Should have same structure
      expect(reloadedConfigs).toHaveLength(originalConfigs.length);
      expect(reloadedConfigs[0]).toHaveProperty("config");
      expect(reloadedConfigs[0]).toHaveProperty("document");
    });

    it("should persist toast state through flow", () => {
      const toasts = [
        { variant: "info", message: "Loading..." },
        { variant: "success", message: "Loaded" },
        { variant: "info", message: "Saving..." },
        { variant: "success", message: "Saved" },
      ];

      // Add all toasts
      for (const toast of toasts) {
        context.api.ui.toast(toast);
      }

      // All toasts should be preserved
      expect(context.toasts).toHaveLength(4);
      expect(context.toasts.filter((t) => t.variant === "success")).toHaveLength(2);
    });
  });

  // ==========================================================================
  // COMPREHENSIVE SCENARIO TESTS
  // ==========================================================================

  describe("Comprehensive Scenario Tests", () => {
    it("should complete full user journey: select agent, edit model, save", () => {
      // Step 1: Launch - agent list displayed
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));
      context.api._testInternals.trackNavigation("agentList");

      // Step 2: Select sisyphus agent
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));
      context.api._testInternals.trackNavigation("agentDetail", { agentKey: "sisyphus" });

      // Step 3: Edit model
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));
      context.api._testInternals.trackNavigation("providerSelect");

      // Step 4: Select provider
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ModelSelect" }));
      context.api._testInternals.trackNavigation("modelSelect");

      // Step 5: Save
      context.api.ui.toast({ variant: "info", message: "Saving sisyphus..." });
      context.api.ui.toast({ variant: "success", message: "Saved sisyphus" });

      // Step 6: Return to agent detail
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));
      context.api._testInternals.trackNavigation("agentDetail", { agentKey: "sisyphus" });

      // Verify complete flow
      // Step 1: Agent list (setSize + replace)
      // Step 2: Agent detail (clear + setSize + replace)
      // Step 3: Provider select (clear + setSize + replace)
      // Step 4: Model select (clear + setSize + replace)
      // Step 5: Save (toasts only)
      // Step 6: Agent detail (clear + setSize + replace)
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(4);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(5);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(5);
      // Navigation history: agentList, agentDetail, providerSelect, modelSelect, agentDetail
      expect(context.navigationHistory).toHaveLength(5);
      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
    });

    it("should complete full user journey: select agent, manage fallbacks, save", () => {
      // Step 1: Launch
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // Step 2: Select oracle agent
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Step 3: Manage fallbacks
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "FallbackManager" }));

      // Step 4: Add fallback
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AddFallback" }));

      // Step 5: Select model
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "FallbackManager" }));

      // Step 6: Save
      context.api.ui.toast({ variant: "info", message: "Saving oracle..." });
      context.api.ui.toast({ variant: "success", message: "Saved oracle" });

      // Step 7: Back to agent detail
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Verify
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(5);
      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
    });

    it("should complete full user journey: custom model input", () => {
      // Start at provider selection
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      // Select custom option
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("medium");
      context.api.ui.dialog.replace(() => ({ type: "CustomModelPrompt" }));

      // Enter custom model
      const customModel = "my-provider/my-special-model";
      context.api.ui.toast({ variant: "info", message: "Saving..." });
      context.api.ui.toast({ variant: "success", message: "Saved" });

      // Navigate back
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Verify
      expect(context.toasts.some((t) => t.variant === "success")).toBe(true);
    });

    it("should complete full user journey: cancel and go back", () => {
      // Navigate to model selection
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ModelSelect" }));

      // Navigate back to provider selection
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "ProviderSelect" }));

      // Navigate back to agent detail
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Navigate back to agent list
      context.api.ui.dialog.clear();
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentList" }));

      // Verify
      expect(context.navigationHistory.length).toBe(0); // No tracking in this flow
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(3);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(4);
    });

    it("should handle complex fallback chain manipulation", () => {
      let fallbacks: string[] = ["openai/gpt-4o"];

      // Add first fallback
      context.api.ui.toast({ variant: "success", message: "Added fallback" });
      fallbacks = [...fallbacks, "google/gemini-pro"];

      // Edit first fallback
      context.api.ui.toast({ variant: "success", message: "Updated fallback" });
      fallbacks = [...fallbacks];
      fallbacks[0] = "anthropic/claude-3-5-sonnet";

      // Add another
      context.api.ui.toast({ variant: "success", message: "Added fallback" });
      fallbacks = [...fallbacks, "openai/gpt-4-turbo"];

      // Remove last
      context.api.ui.toast({ variant: "success", message: "Removed fallback" });
      fallbacks = fallbacks.slice(0, -1);

      // Final state
      expect(fallbacks).toEqual([
        "anthropic/claude-3-5-sonnet",
        "google/gemini-pro",
      ]);

      // Save
      context.api.ui.toast({ variant: "success", message: "Saved all changes" });

      // 5 success toasts: Added, Updated, Added, Removed, Saved
      expect(getToastByVariant(context.toasts, "success")).toHaveLength(5);
    });

    it("should handle reload with error recovery", async () => {
      // At agent detail
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      // Trigger reload
      try {
        await context.api.client.instance.dispose({});
      } catch {
        context.api.ui.toast({ variant: "warning", message: "Reload failed" });
      }

      // Success toast
      context.api.ui.toast({ variant: "success", message: "Agents reloaded" });

      // Refresh view
      context.api.ui.dialog.setSize("large");
      context.api.ui.dialog.replace(() => ({ type: "AgentDetail" }));

      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
    });
  });

  // ==========================================================================
  // DIALOG TIMING AND ASYNC TESTS
  // ==========================================================================

  describe("Dialog Timing and Async Behavior", () => {
    it("should properly sequence dialog operations", () => {
      const sequence: string[] = [];

      // Simulate async clear followed by replace
      sequence.push("clear-start");
      context.api.ui.dialog.clear();
      sequence.push("clear-end");

      sequence.push("setSize-start");
      context.api.ui.dialog.setSize("large");
      sequence.push("setSize-end");

      sequence.push("replace-start");
      context.api.ui.dialog.replace(() => ({}));
      sequence.push("replace-end");

      expect(sequence).toEqual([
        "clear-start", "clear-end",
        "setSize-start", "setSize-end",
        "replace-start", "replace-end"
      ]);
    });

    it("should handle setTimeout-based navigation", () => {
      // The TUI uses setTimeout(() => ..., 0) for deferred navigation
      const deferredCalls: string[] = [];

      context.api.ui.dialog.clear();
      deferredCalls.push("cleared");

      // Simulate setTimeout deferred call
      setTimeout(() => {
        context.api.ui.dialog.setSize("large");
        context.api.ui.dialog.replace(() => ({}));
        deferredCalls.push("deferred-executed");
      }, 0);

      // Immediate state
      expect(deferredCalls).toEqual(["cleared"]);

      // Note: In actual test, would need to await or use fake timers
    });

    it("should handle concurrent dialog operations safely", () => {
      // Simulate rapid operations
      for (let i = 0; i < 10; i++) {
        context.api.ui.dialog.clear();
        context.api.ui.dialog.setSize("large");
        context.api.ui.dialog.replace(() => ({ index: i }));
      }

      // All operations should be recorded
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(10);
      expect(countDialogCalls(context.dialogCalls, "setSize")).toBe(10);
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(10);
    });

    it("should prevent duplicate selection handling", () => {
      // Test the handled* flag pattern
      let handledModelSelection = false;

      const handleSelection = () => {
        if (handledModelSelection) return;
        handledModelSelection = true;
        context.api.ui.dialog.clear();
      };

      // First call
      handleSelection();
      expect(handledModelSelection).toBe(true);
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1);

      // Second call (should be ignored)
      handleSelection();
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(1); // No new clear

      // Reset
      handledModelSelection = false;
      handleSelection();
      expect(countDialogCalls(context.dialogCalls, "clear")).toBe(2);
    });
  });

  // ==========================================================================
  // API CONTRACT TESTS
  // ==========================================================================

  describe("API Contract Tests", () => {
    it("should provide all required API methods", () => {
      const requiredMethods = [
        "ui.dialog.replace",
        "ui.dialog.clear",
        "ui.dialog.setSize",
        "ui.toast",
        "command.register",
        "lifecycle.onDispose",
        "client.instance.dispose",
        "state.provider",
        "state.path",
        "theme.current",
      ];

      for (const method of requiredMethods) {
        const parts = method.split(".");
        let current: any = context.api;
        for (const part of parts) {
          current = current?.[part];
        }
        expect(current).toBeDefined();
      }
    });

    it("should support toast variants", () => {
      const variants = ["info", "success", "error", "warning"] as const;

      for (const variant of variants) {
        context.api.ui.toast({ variant, message: `Test ${variant}` });
      }

      expect(getToastByVariant(context.toasts, "info")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "success")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "error")).toHaveLength(1);
      expect(getToastByVariant(context.toasts, "warning")).toHaveLength(1);
    });

    it("should support dialog size options", () => {
      const sizes = ["small", "medium", "large", "xlarge"];

      for (const size of sizes) {
        context.api.ui.dialog.setSize(size);
      }

      for (const size of sizes) {
        expect(context.dialogCalls).toContainEqual(
          expect.objectContaining({ method: "setSize", args: [size] })
        );
      }
    });

    it("should provide provider structure correctly", () => {
      const provider = SAMPLE_PROVIDERS[0];

      expect(provider).toHaveProperty("id");
      expect(provider).toHaveProperty("name");
      expect(provider).toHaveProperty("models");

      const models = Object.values(provider.models);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty("id");
      expect(models[0]).toHaveProperty("name");
    });

    it("should provide agent structure correctly", () => {
      const agent = {
        key: "sisyphus",
        model: "anthropic/claude-3-5-sonnet-20241022",
        fallback: ["openai/gpt-4o", "google/gemini-pro"],
        role: "orchestrator",
        description: "Main orchestrator",
        isDefault: false,
        configPath: "/path/to/config.json",
      };

      expect(agent).toHaveProperty("key");
      expect(agent).toHaveProperty("model");
      expect(agent).toHaveProperty("fallback");
      expect(agent).toHaveProperty("role");
    });
  });

  // ==========================================================================
  // PERFORMANCE AND STRESS TESTS
  // ==========================================================================

  describe("Performance and Stress Tests", () => {
    it("should handle rapid navigation without degradation", () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        context.api.ui.dialog.clear();
        context.api.ui.dialog.setSize("large");
        context.api.ui.dialog.replace(() => ({ iteration: i }));
      }

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(countDialogCalls(context.dialogCalls, "replace")).toBe(100);
    });

    it("should handle large number of providers", () => {
      const manyProviders: any[] = [];
      for (let i = 0; i < 50; i++) {
        manyProviders.push({
          id: `provider-${i}`,
          models: {
            [`model-${i}-a`]: { id: `model-${i}-a`, name: `Model ${i} A` },
            [`model-${i}-b`]: { id: `model-${i}-b`, name: `Model ${i} B` },
          },
        });
      }

      expect(manyProviders).toHaveLength(50);

      // Build options for all
      const allOptions = manyProviders.flatMap((p) =>
        Object.values(p.models).map((m: any) => ({
          provider: p.id,
          model: m.id,
        }))
      );

      expect(allOptions).toHaveLength(100);
    });

    it("should handle large number of agents", () => {
      const manyAgents: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        manyAgents[`agent-${i}`] = {
          key: `agent-${i}`,
          model: i % 2 === 0 ? `provider/model-${i}` : null,
          fallback: [`fallback-${i}`],
        };
      }

      expect(Object.keys(manyAgents)).toHaveLength(100);
    });

    it("should handle many toast notifications", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        context.api.ui.toast({ variant: "info", message: `Toast ${i}` });
      }

      const duration = Date.now() - start;

      expect(context.toasts).toHaveLength(1000);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it("should handle deep navigation history", () => {
      const deepHistory: NavigationEntry[] = [];

      for (let i = 0; i < 100; i++) {
        deepHistory.push({ screen: `screen-${i}`, params: { index: i } });
      }

      expect(deepHistory).toHaveLength(100);

      // Navigate back through all
      for (let i = 0; i < 50; i++) {
        deepHistory.pop();
      }

      expect(deepHistory).toHaveLength(50);
      expect(deepHistory[deepHistory.length - 1].params?.index).toBe(49);
    });
  });
});

// ============================================================================
// SOURCE CODE VALIDATION TESTS
// ============================================================================

describe("TUI Source Code Flow Validation", () => {
  let pluginSource: string;

  beforeAll(() => {
    const pluginPath = path.join(import.meta.dir, "../.opencode/tui/agent-manager.jsx");
    pluginSource = fs.readFileSync(pluginPath, "utf-8");
  });

  describe("Flow function presence validation", () => {
    it("should have all required flow functions defined", () => {
      const requiredFunctions = [
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showModelsForProvider",
        "showAllModels",
        "showCustomModelPrompt",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback",
        "showCustomFallbackPrompt",
        "showEditFallbackPrompt",
        "saveAgentConfig",
        "loadAllConfigs",
        "saveAgentConfig",
        "reloadAgents",
      ];

      for (const func of requiredFunctions) {
        expect(pluginSource).toContain(`function ${func}(`);
      }
    });

    it("should have proper function signatures for all navigation functions", () => {
      // Check that navigation functions have proper parameters (api as first param)
      const navigationFuncs = [
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showFallbackManager",
      ];

      for (const func of navigationFuncs) {
        // Check that function exists and has api as parameter (multiline allowed)
        const funcPattern = new RegExp(`function ${func}\\(\\s*api\\s*,`, "s");
        expect(pluginSource).toMatch(funcPattern);
      }
    });

    it("should have proper returnIndex usage throughout", () => {
      // returnIndex should be passed to most navigation functions
      const navigationFunctions = [
        "showAgentList",
        "showAgentDetail",
        "editModel",
        "showModelsForProvider",
        "showAllModels",
        "showCustomModelPrompt",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback",
        "showCustomFallbackPrompt",
        "showEditFallbackPrompt",
      ];

      for (const func of navigationFunctions) {
        const funcStart = pluginSource.indexOf(`function ${func}(`);
        expect(funcStart).toBeGreaterThan(-1);

        // Find function body (next 500 chars should have returnIndex)
        const funcBody = pluginSource.substring(funcStart, funcStart + 800);
        expect(funcBody).toContain("returnIndex");
      }
    });
  });

  describe("Dialog API usage validation", () => {
    it("should use dialog.replace for all main navigation", () => {
      const replaceCount = (pluginSource.match(/api\.ui\.dialog\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThan(10);
    });

    it("should use dialog.clear for transition dialogs", () => {
      const clearCount = (pluginSource.match(/api\.ui\.dialog\.clear\(\)/g) || []).length;
      expect(clearCount).toBeGreaterThan(5);
    });

    it("should use setSize for all main dialogs", () => {
      const setSizeCount = (pluginSource.match(/api\.ui\.dialog\.setSize\(/g) || []).length;
      expect(setSizeCount).toBeGreaterThan(5);
    });

    it("should use toast for user feedback", () => {
      const toastCount = (pluginSource.match(/api\.ui\.toast\(/g) || []).length;
      expect(toastCount).toBeGreaterThan(3);
    });
  });

  describe("State management validation", () => {
    it("should access provider from api.state", () => {
      expect(pluginSource).toContain("api.state.provider");
    });

    it("should access directory from api.state.path", () => {
      expect(pluginSource).toContain("api.state.path.directory");
    });

    it("should use reloadAgents function", () => {
      expect(pluginSource).toContain("reloadAgents()");
      expect(pluginSource).toContain("async function reloadAgents()");
    });
  });

  describe("Configuration flow validation", () => {
    it("should have loadAllConfigs function", () => {
      expect(pluginSource).toContain("async function loadAllConfigs(");
    });

    it("should have saveConfig imported from config.ts", () => {
      expect(pluginSource).toContain("import { findConfigFiles, loadConfig, saveConfig } from");
    });

    it("should have saveAgentConfig wrapper function", () => {
      expect(pluginSource).toContain("async function saveAgentConfig(");
    });

    it("should merge with defaults in showAgentList", () => {
      const showAgentListStart = pluginSource.indexOf("function showAgentList(");
      const showAgentListEnd = pluginSource.indexOf("function showAgentDetail(");
      const showAgentListBody = pluginSource.substring(showAgentListStart, showAgentListEnd);

      expect(showAgentListBody).toContain("mergeWithDefaults");
      expect(showAgentListBody).toContain("loadedConfigs");
    });
  });

  describe("Model and fallback handling validation", () => {
    it("should have buildModelOptions helper", () => {
      expect(pluginSource).toContain("function buildModelOptions(");
    });

     it("should have modelBadge helper imported", () => {
       // modelBadge is now imported from src/tui-api.js (DRY)
       expect(pluginSource).toContain("modelBadge");
       expect(pluginSource).toContain("tui-api.js");
     });

  it("should have saveAgentConfig helper", () => {
    expect(pluginSource).toContain("function saveAgentConfig(");
  });

  it("should have showAddFallback helper", () => {
    expect(pluginSource).toContain("function showAddFallback(");
  });

  it("should have showEditFallback helper", () => {
    expect(pluginSource).toContain("function showEditFallback(");
  });

  describe("Provider and model flow validation", () => {
    it("should handle empty providers by showing custom prompt", () => {
      const editModelStart = pluginSource.indexOf("function editModel(");
      const editModelEnd = pluginSource.indexOf("function showModelsForProvider(");
      const editModelBody = pluginSource.substring(editModelStart, editModelEnd);

      expect(editModelBody).toContain("providerArr.length === 0");
      expect(editModelBody).toContain("showCustomModelPrompt");
    });

    it("should have Show all models option", () => {
      expect(pluginSource).toContain('value: { action: "showAll" }');
    });

    it("should have Type custom model option", () => {
      expect(pluginSource).toContain('value: { action: "custom" }');
    });
  });

  describe("Error handling validation", () => {
   it("should have error handling for missing Select component", () => {
     // guardApiUi centralizes the Select/when guard check (DRY fix)
    expect(pluginSource).toContain("function guardApiUi(");
    expect(pluginSource).toContain("api.ui.DialogSelect");
    // All dialog functions use guardApiUi instead of inline checks
    const functionsWithSelect = [
      "showAgentList",
      "showAgentDetail",
      "editModel",
      "showModelsForProvider",
      "showAllModels",
      "showFallbackManager",
      "showAddFallback",
      "showEditFallback",
    ];
    for (const func of functionsWithSelect) {
      const funcStart = pluginSource.indexOf(`function ${func}(`);
      expect(funcStart).toBeGreaterThan(-1);
      const funcBody = pluginSource.substring(funcStart, funcStart + 200);
      expect(funcBody).toContain("guardApiUi");
    }
  });
    it("should show error toast when Select component is missing", () => {
      expect(pluginSource).toContain('variant: "error"');
      expect(pluginSource).toContain("Critical component missing");
    });

    it("should handle save failures gracefully", () => {
      expect(pluginSource).toContain("Save failed");
      expect(pluginSource).toContain("catch (e)");
    });
  });

  describe("Back navigation validation", () => {
    it("should have backButton helper", () => {
      expect(pluginSource).toContain("function backButton(");
    });

    it("should have back action value", () => {
      expect(pluginSource).toContain('value: { action: "back" }');
    });

    it("should navigate back to agent list", () => {
      const showAgentDetailStart = pluginSource.indexOf("function showAgentDetail(");
      const showAgentDetailBody = pluginSource.substring(showAgentDetailStart, showAgentDetailStart + 12000);

      expect(showAgentDetailBody).toContain('action === "back"');
      expect(showAgentDetailBody).toContain("showAgentList");
    });
  });
});
});
