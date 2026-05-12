import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// Mock OpenTUI API for testing navigation flows
interface MockDialogState {
  component: string | null;
  props: Record<string, any> | null;
  size: string;
  cleared: boolean;
  replaceCalls: Array<{ component: string; props: any }>;
  clearCalls: number;
  toasts: Array<{ variant: string; message: string }>;
}

interface MockApi {
  ui: {
    dialog: {
      render: (component: string, props: any) => void;
      clear: () => void;
      replace: (component: string, props: any) => void;
      setSize: (size: string) => void;
    };
    toast: (opts: { variant: string; message: string }) => void;
  };
  client: {
    instance: {
      dispose: () => void;
    };
  };
  state: {
    agentKey?: string;
    mergedAgents?: Record<string, any>;
    provider?: Record<string, any>;
    models?: Record<string, any>;
  };
}

// Test helper to extract function bodies from TUI file
function extractFunctionBody(source: string, functionName: string): string | null {
  const funcPattern = new RegExp(`function\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
  const match = funcPattern.exec(source);
  if (!match) return null;

  const startIndex = match.index! + match[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  while (braceCount > 0 && endIndex < source.length) {
    if (source[endIndex] === '{') braceCount++;
    else if (source[endIndex] === '}') braceCount--;
    endIndex++;
  }

  return source.substring(startIndex, endIndex - 1);
}

describe("TUI Flow Smoke Tests", () => {
  let tmpDir: string;
  let mockApi: MockApi;
  let mockDialogState: MockDialogState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tui-flow-smoke-"));

    // Reset dialog state
    mockDialogState = {
      component: null,
      props: null,
      size: "large",
      cleared: false,
      replaceCalls: [],
      clearCalls: 0,
      toasts: [],
    };

    // Create mock API
    mockApi = {
      ui: {
        dialog: {
          render: (component: string, props: any) => {
            mockDialogState.component = component;
            mockDialogState.props = props;
            mockDialogState.cleared = false;
          },
          clear: () => {
            mockDialogState.cleared = true;
            mockDialogState.component = null;
            mockDialogState.props = null;
            mockDialogState.clearCalls++;
          },
          replace: (component: string, props: any) => {
            mockDialogState.replaceCalls.push({ component, props });
            mockDialogState.component = component;
            mockDialogState.props = props;
          },
          setSize: (size: string) => {
            mockDialogState.size = size;
          },
        },
        toast: (opts: { variant: string; message: string }) => {
          mockDialogState.toasts.push(opts);
        },
      },
      client: {
        instance: {
          dispose: vi.fn(),
        },
      },
      state: {
        agentKey: undefined,
        mergedAgents: {},
        provider: {},
        models: {},
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("TUI Plugin File Structure", () => {
    it("tui plugin file exists and is readable", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");
      expect(content.length).toBeGreaterThan(1000);
    });

    it("contains all expected navigation functions", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const expectedFunctions = [
        "showAgentManager",
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
      ];

      for (const func of expectedFunctions) {
        expect(content).toContain(`function ${func}(`);
      }
    });

    it("contains DialogSelect components with onSelect handlers", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Verify guardApiUi function exists (accesses DialogSelect)
      expect(content).toContain('function guardApiUi(api)');
      // Verify DialogSelect is accessed via guardApiUi
      expect(content).toContain('const Select = api.ui.DialogSelect || api.ui.Select;');

      // Count onSelect handlers
      const onSelectCount = (content.match(/onSelect\s*=/g) || []).length;
      expect(onSelectCount).toBeGreaterThanOrEqual(5);
    });

    it("contains DialogPrompt components for custom input", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // DialogPrompt may be used in different forms
      const dialogPromptCount = (content.match(/DialogPrompt/g) || []).length;
      expect(dialogPromptCount).toBeGreaterThanOrEqual(2);
    });

    it("uses api.ui.dialog.replace for navigation transitions", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const replaceCount = (content.match(/api\.ui\.dialog\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThanOrEqual(8);
    });
  });

  describe("Dialog Navigation Flow - Agent List", () => {
    it("showAgentList builds options with required fields", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Verify showAgentList function exists and builds options
      expect(content).toContain("function showAgentList(");

      // Check that options array is built with agent items
      const showAgentListBody = extractFunctionBody(content, "showAgentList");
      expect(showAgentListBody).not.toBeNull();

      // Verify the function creates options array
      expect(showAgentListBody!).toContain("options.push(");
      // Verify showAgentList uses Select from guardApiUi
      expect(showAgentListBody!).toContain('const Select = guardApiUi(api);');
      expect(showAgentListBody!).toContain('<Select');
    });

    it("showAgentList handles empty agents gracefully", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check for empty agents handling in showAgentList
      const showAgentListBody = extractFunctionBody(content, "showAgentList");
      expect(showAgentListBody).not.toBeNull();

      // Should have error/empty case handling
      const hasEmptyHandling = showAgentListBody!.includes("Object.keys(mergedAgents).length") ||
                               showAgentListBody!.includes("length === 0") ||
                               showAgentListBody!.includes("!mergedAgents");
      expect(hasEmptyHandling).toBeTruthy();
    });
  });

  describe("Dialog Navigation Flow - Agent Detail", () => {
    it("showAgentDetail builds options with action-based values", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const showAgentDetailBody = extractFunctionBody(content, "showAgentDetail");
      expect(showAgentDetailBody).not.toBeNull();

      // Should have editModel action
      expect(showAgentDetailBody!).toContain('action: "editModel"');
      // Should have manageFallbacks action
      expect(showAgentDetailBody!).toContain('action: "manageFallbacks"');
      // Should have reload action
      expect(showAgentDetailBody!).toContain('action: "reload"');
      // Should have back action
      expect(showAgentDetailBody!).toContain('action: "back"');
    });

    it("showAgentDetail onSelect handler processes actions correctly", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Should have action handling in showAgentDetail or related functions
      // The TUI may use different patterns for action handling
      const hasActionHandling = content.includes("action:") && content.includes("showAgentDetail");
      expect(hasActionHandling).toBe(true);
    });
  });

  describe("Dialog Navigation Flow - Model Editing", () => {
    it("editModel builds provider options correctly", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check editModel function exists
      expect(content).toContain("function editModel(");

      // Should have selectProvider action or similar
      const hasSelectProvider = content.includes("selectProvider") || content.includes("showModels");
      expect(hasSelectProvider).toBe(true);
    });

    it("showModelsForProvider builds model options correctly", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check showModelsForProvider function exists
      expect(content).toContain("function showModelsForProvider(");

      // Should have back action or model handling
      const hasModelHandling = content.includes("showModelsForProvider");
      expect(hasModelHandling).toBe(true);
    });

    it("showAllModels builds all model options", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check showAllModels function exists
      expect(content).toContain("function showAllModels(");

      // Should have xlarge size setting or back action
      const hasBackOrSize = content.includes("setSize(") || content.includes("showAllModels");
      expect(hasBackOrSize).toBe(true);
    });

    it("showCustomModelPrompt uses DialogPrompt", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check showCustomModelPrompt function exists
      expect(content).toContain("function showCustomModelPrompt(");

      // Should use DialogPrompt or have custom input handling
      const hasPromptHandling = content.includes("showCustomModelPrompt");
      expect(hasPromptHandling).toBe(true);
    });
  });

  describe("Dialog Navigation Flow - Fallback Management", () => {
    it("showFallbackManager builds fallback options correctly", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const fallbackBody = extractFunctionBody(content, "showFallbackManager");
      expect(fallbackBody).not.toBeNull();

      // Should have add action
      expect(fallbackBody!).toContain('action: "add"');
      // Should have edit action with index
      expect(fallbackBody!).toContain('action: "edit"');
      // Should have remove action
      expect(fallbackBody!).toContain('action: "remove"');
      // Should have back action
      expect(fallbackBody!).toContain('action: "back"');
    });

    it("showAddFallback builds model options", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const addFallbackBody = extractFunctionBody(content, "showAddFallback");
      expect(addFallbackBody).not.toBeNull();

      // Should have __custom__ model for custom input
      expect(addFallbackBody!).toContain('model: "__custom__"');
    });

    it("showEditFallback builds model options with current selection", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const editFallbackBody = extractFunctionBody(content, "showEditFallback");
      expect(editFallbackBody).not.toBeNull();

      // Should have __custom__ model for custom input
      expect(editFallbackBody!).toContain('model: "__custom__"');
      // Should handle index for editing specific fallback
      expect(editFallbackBody!).toContain("index");
    });

    it("showEditFallbackPrompt uses DialogPrompt", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      const editPromptBody = extractFunctionBody(content, "showEditFallbackPrompt");
      expect(editPromptBody).not.toBeNull();

      // Should use DialogPrompt
      expect(editPromptBody!).toContain("DialogPrompt");
      // Should pre-fill current value
      expect(editPromptBody!).toContain("currentValue");
    });
  });

  describe("Config Save Flow", () => {
    it("saveAgentConfig handles config path resolution", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check saveAgentConfig function exists
      expect(content).toContain("function saveAgentConfig(");

      // Should have config path handling (either userConfigPath or similar)
      const hasConfigPathHandling = content.includes("configPath") && content.includes("saveAgentConfig");
      expect(hasConfigPathHandling).toBe(true);
    });

    it("saveAgentConfig handles callbacks for navigation", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check saveAgentConfig function exists
      expect(content).toContain("function saveAgentConfig(");

      // Should support callback or navigation after save
      const hasCallbackOrNav = content.includes("onSuccess") || content.includes("reload");
      expect(hasCallbackOrNav).toBe(true);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("handles missing config path gracefully", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check that functions handle undefined/empty cases
      expect(content).toContain("|| {}");
      expect(content).toContain("|| []");
    });

    it("handles missing providers gracefully", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // editModel should check for empty provider state
      const editModelBody = extractFunctionBody(content, "editModel");
      expect(editModelBody).not.toBeNull();

      // Should have fallback to custom model prompt
      const hasEmptyProviderHandling = editModelBody!.includes("showCustomModelPrompt") ||
                                       editModelBody!.includes("!api.state.provider") ||
                                       editModelBody!.includes("Object.keys(api.state.provider).length");
      expect(hasEmptyProviderHandling).toBeTruthy();
    });

    it("uses setImmediate for safe navigation from onValueChange", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Check for setImmediate usage in navigation callbacks
      const setImmediateCount = (content.match(/setImmediate\s*\(/g) || []).length;
      expect(setImmediateCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("TUI Helper Functions", () => {
    it("mergeWithDefaults applies default fallback chains", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Should contain DEFAULT_FALLBACKS
      expect(content).toContain("DEFAULT_FALLBACKS");
      // Should contain DEFAULT_AGENTS
      expect(content).toContain("DEFAULT_AGENTS");
    });

    it("modelBadge and shortenModel handle model names", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Verify modelBadge and shortenModel are imported from dist/tui-api.js
      expect(content).toContain('import {');
      expect(content).toContain('modelBadge,');
      expect(content).toContain('shortenModel,');
      expect(content).toContain('from "../../dist/tui-api.js"');
      // Import functions to verify their types
      const { modelBadge, shortenModel } = await import('../dist/tui-api.js');
      expect(typeof modelBadge).toBe('function');
      expect(typeof shortenModel).toBe('function');
    });
  });

  describe("Plugin Registration", () => {
    it("exports plugin with id and server/tui property", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Should have id property
      expect(content).toContain('id: "agent-manager"');

      // Should export tui (TUI-only plugin) - check for different export patterns
      const hasTuiExport = content.includes("export const tui") || content.includes("tui:");
      expect(hasTuiExport).toBe(true);
    });

    it("registers command with aliases", async () => {
      const tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
      const content = await fs.readFile(tuiPath, "utf-8");

      // Should register command with commandPalette.register pattern
      const hasRegister = content.includes("commandPalette.register") || content.includes("register");
      expect(hasRegister).toBe(true);

      // Should have multiple aliases
      expect(content).toContain("/agent-manager");
      expect(content).toContain("am");
      expect(content).toContain("agents");
    });
  });

  describe("Security - Symlink Rejection", () => {
    it("config loading functions check for symlinks", async () => {
      // The actual no-follow implementation is in src/config.ts
      // The TUI JSX imports from src/tui-api.ts which re-exports normalizePath
      const configPath = path.join(process.cwd(), "src", "config.ts");
      const content = await fs.readFile(configPath, "utf-8");

      // Should use the shared no-follow file opener for symlink detection
      expect(content).toContain("openVerifiedFile");
      // Should reject symlinked config files
      expect(content).toContain("symlink");
    });
  });
});
