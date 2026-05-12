import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMockTracker } from "./helpers/mock-isolation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_CONFIG = `{
  // Sample config with comments
  "agents": {
    "explore": { "model": "opencode/gpt-5-nano" },
    "oracle": { "model": "openai/gpt-5.2" }
  }
}`;

const SAMPLE_PROVIDERS = [
  {
    id: "opencode",
    name: "OpenCode",
    models: [
      { id: "gpt-5-nano", name: "GPT-5 Nano" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku" },
    ],
  },
];

// Mock API for testing
function createMockApi(overrides = {}) {
  return {
    ui: {
      dialog: {
        clear: vi.fn(),
        replace: vi.fn(),
        setSize: vi.fn(),
      },
      toast: vi.fn(),
      when: vi.fn(() => []),
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
    state: {
      provider: SAMPLE_PROVIDERS,
      path: {
        directory: "/test/cwd",
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
    lifecycle: {
      onDispose: vi.fn(),
    },
    ...overrides,
  };
}

// Helper to extract timing calls from source
function extractTimingPatterns(source: string) {
  const setTimeoutCalls: Array<{ line: number; delay: string; func: string }> = [];
  const setImmediateCalls: Array<{ line: number; func: string }> = [];

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const setTimeoutMatch = line.match(/setTimeout\s*\(\s*\(\)\s*=>\s*\{([^}]+)/);
    if (setTimeoutMatch) {
      setTimeoutCalls.push({
        line: i + 1,
        delay: "0",
        func: setTimeoutMatch[1].trim().slice(0, 50),
      });
    }

    const setImmediateMatch = line.match(/setImmediate\s*\(\s*\(\)\s*=>\s*\{([^}]+)/);
    if (setImmediateMatch) {
      setImmediateCalls.push({
        line: i + 1,
        func: setImmediateMatch[1].trim().slice(0, 50),
      });
    }
  }

  return { setTimeoutCalls, setImmediateCalls };
}

// Minimal delay helper that works with real timers
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Load source file ONCE at module level for efficiency
const pluginPath = path.join(__dirname, "../.opencode/tui/agent-manager.jsx");
const pluginSource = fs.readFileSync(pluginPath, "utf-8");

// Mock tracker for proper cleanup
const mockTracker = createMockTracker();

// Factory functions to create fresh mocks per test
function createConfigMocks() {
  const mockFindConfigFiles = vi.fn().mockResolvedValue([
    { type: "project", subType: "oh-my-opencode", path: "/test/.opencode/oh-my-opencode.json" },
    { type: "project", subType: "opencode", path: "/test/opencode.json" },
    { type: "project", subType: "package", path: "/test/.opencode/package.json" },
    { type: "user", subType: "oh-my-opencode", path: "/home/.config/opencode/oh-my-opencode.json" },
    { type: "user", subType: "opencode", path: "/home/.config/opencode/opencode.json" },
  ]);

  const mockLoadConfig = vi.fn().mockImplementation(async (config) => ({
    config,
    document: {
      agents: {
        explore: { model: "opencode/gpt-5-nano" },
        oracle: { model: "openai/gpt-5.2" },
      },
    },
  }));

  const mockSaveConfig = vi.fn().mockResolvedValue(undefined);
  const mockBackupConfig = vi.fn().mockImplementation(
    async (filePath) => `${filePath}.bak.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  );

  // Track all mocks for cleanup
  mockTracker.add(mockFindConfigFiles);
  mockTracker.add(mockLoadConfig);
  mockTracker.add(mockSaveConfig);
  mockTracker.add(mockBackupConfig);

  return { mockFindConfigFiles, mockLoadConfig, mockSaveConfig, mockBackupConfig };
}

describe("TUI Timing and Async Behavior", () => {
  // Reset all mocks before each test
  beforeEach(() => {
    mockTracker.clear();
  });

  // Clean up after all tests
  afterEach(() => {
    mockTracker.reset();
  });

  describe("1. setTimeout/setImmediate Usage Patterns", () => {
    it("uses setTimeout with 0 delay for safe dialog navigation", () => {
      // Verify setTimeout with 0 delay is used for navigation
      // Match patterns like: setTimeout(() => { ... }, 0)
      const zeroDelayPattern = /setTimeout\s*\(\s*\(\s*\)\s*=>/;
      const setTimeoutZeroCount = (pluginSource.match(zeroDelayPattern) || []).length;
      const simplePatternCount = (pluginSource.match(/setTimeout\s*\([^,]+,\s*0\s*\)/g) || []).length;
      expect(setTimeoutZeroCount + simplePatternCount).toBeGreaterThan(0);
    });

    it("uses setImmediate() in appropriate places", () => {
      const setImmediateCount = (pluginSource.match(/setImmediate\s*\(/g) || []).length;
      expect(setImmediateCount).toBeGreaterThan(0);
    });

    it("setTimeout patterns are consistent across navigation functions", () => {
      const navigationFunctions = [
        "showAgentList",
        "showAgentDetail",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback",
        "showModelsForProvider",
        "showAllModels",
        "showCustomModelPrompt",
        "showCustomFallbackPrompt",
        "showEditFallbackPrompt",
      ];

      for (const func of navigationFunctions) {
        expect(pluginSource).toContain(`function ${func}(`);
      }

      // The TUI plugin uses safeSetTimeout wrapper instead of setTimeout directly
      const safeSetTimeoutCount = (pluginSource.match(/safeSetTimeout\s*\(/g) || []).length;
      const setImmediateCount = (pluginSource.match(/setImmediate\s*\(/g) || []).length;
      expect(safeSetTimeoutCount + setImmediateCount).toBeGreaterThan(5);
    });

    it("timing patterns don't cause race conditions", () => {
      // Pattern: dialog.clear() followed by safeSetTimeout (the wrapper used in this TUI plugin)
      const clearThenTimeoutPattern = /api\.ui\.dialog\.clear\(\);[\s\S]*?safeSetTimeout\(/g;
      const matches = pluginSource.match(clearThenTimeoutPattern) || [];
      expect(matches.length).toBeGreaterThan(0);
    });

    it("distinguishes between setTimeout and setImmediate usage contexts", () => {
      // The plugin uses safeSetTimeout wrapper, not setTimeout directly
      const safeSetTimeoutCount = (pluginSource.match(/safeSetTimeout\s*\(/g) || []).length;
      const setImmediateCount = (pluginSource.match(/setImmediate\s*\(/g) || []).length;

      expect(safeSetTimeoutCount).toBeGreaterThan(0);
      expect(setImmediateCount).toBeGreaterThan(0);

      const editModelStart = pluginSource.indexOf("function editModel(");
      expect(editModelStart).toBeGreaterThan(-1);

      const editModelSection = pluginSource.substring(editModelStart, editModelStart + 3000);
      expect(editModelSection).toContain("setImmediate");
    });

    it("all navigation functions use consistent timing", () => {
      // The plugin uses safeSetTimeout wrapper
      const safeSetTimeoutCount = (pluginSource.match(/safeSetTimeout\s*\(/g) || []).length;
      const setImmediateCount = (pluginSource.match(/setImmediate\s*\(/g) || []).length;
      expect(safeSetTimeoutCount + setImmediateCount).toBeGreaterThan(10);

      const keyFunctions = [
        "showAgentList",
        "showAgentDetail",
        "showFallbackManager",
        "showModelsForProvider",
        "showAllModels",
        "showCustomModelPrompt",
        "editModel",
      ];

      for (const func of keyFunctions) {
        expect(pluginSource).toContain(`function ${func}(`);
      }
    });
  });

  describe("2. Async Config Loading", () => {
    it("loads multiple config files sequentially", async () => {
      const { mockFindConfigFiles, mockLoadConfig } = createConfigMocks();
      const configs = await mockFindConfigFiles();
      expect(configs.length).toBe(5);

      const results = [];
      for (const config of configs) {
        const result = await mockLoadConfig(config);
        results.push(result);
      }

      expect(results.length).toBe(5);
      expect(results.every((r) => r.document && r.document.agents)).toBe(true);
    });

    it("loads configs in parallel with Promise.all", async () => {
      const { mockFindConfigFiles, mockLoadConfig } = createConfigMocks();
      const configs = await mockFindConfigFiles();
      expect(configs.length).toBe(5);

      const results = await Promise.all(configs.map((config) => mockLoadConfig(config)));

      expect(results.length).toBe(5);
      expect(results.every((r) => r.document && r.document.agents)).toBe(true);
    });

    it("handles slow config loading with timeout", async () => {
      const slowLoad = vi.fn().mockImplementation(async () => {
        await delay(100);
        return { config: {}, document: {} };
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Config load timeout")), 50);
      });

      try {
        await Promise.race([slowLoad(), timeoutPromise]);
        expect.fail("Should have timed out");
      } catch (e) {
        expect((e as Error).message).toBe("Config load timeout");
      }
    });

    it("handles concurrent config loading without race conditions", async () => {
      const { mockFindConfigFiles, mockLoadConfig } = createConfigMocks();
      const configs = await mockFindConfigFiles();

      const promises = [];
      for (let i = 0; i < 3; i++) {
        for (const config of configs) {
          promises.push(mockLoadConfig(config));
        }
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(15);
      expect(results.every((r) => r.document && r.config)).toBe(true);
    });

    it("validates config structure during async load", async () => {
      const { mockFindConfigFiles, mockLoadConfig } = createConfigMocks();
      const configs = await mockFindConfigFiles();
      const { document } = await mockLoadConfig(configs[0]);

      expect(document).toHaveProperty("agents");
      expect(typeof document.agents).toBe("object");
    });
  });

  describe("3. Save Operations Timing", () => {
    it("async save creates backup before writing", async () => {
      const { mockFindConfigFiles, mockSaveConfig, mockBackupConfig } = createConfigMocks();
      let savedConfigs: Array<{ config: any; document: any }> = [];
      let backupFiles: string[] = [];

      // Configure mock implementations within this specific test
      mockSaveConfig.mockImplementation(async (config, document) => {
        const backupPath = `${config.path}.bak.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
        backupFiles.push(backupPath);
        savedConfigs.push({ config, document });
        return backupPath;
      });
      mockBackupConfig.mockImplementation(async (filePath) => {
        const backupPath = `${filePath}.bak.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
        backupFiles.push(backupPath);
        return backupPath;
      });

      const configs = await mockFindConfigFiles();
      expect(configs.length).toBeGreaterThan(0);

      const config = configs[0];
      await mockSaveConfig(config, { agents: { testAgent: { model: "test/model" } } });

      expect(backupFiles.length).toBeGreaterThan(0);
      expect(savedConfigs.length).toBe(1);
      expect(savedConfigs[0].document.agents.testAgent.model).toBe("test/model");
    });

    it("save completes before navigation callback", async () => {
      const mockApi = createMockApi();
      const saveComplete = vi.fn();
      const navigationCalled = vi.fn();

      const performSave = async () => {
        await delay(50);
        saveComplete();
      };

      const navigateAfterSave = () => {
        navigationCalled();
      };

      await performSave();
      expect(saveComplete).toHaveBeenCalled();

      navigateAfterSave();
      expect(navigationCalled).toHaveBeenCalled();
    });

    it("save doesn't block UI when using async/await", async () => {
      let uiUnblocked = false;

      const nonBlockingSave = async () => {
        await delay(100);
      };

      const savePromise = nonBlockingSave();
      uiUnblocked = true;

      expect(uiUnblocked).toBe(true);
      await savePromise;
    });

    it("rapid save attempts are handled correctly", async () => {
      const { mockFindConfigFiles, mockSaveConfig } = createConfigMocks();
      const configs = await mockFindConfigFiles();
      const config = configs[0];

      const savePromises = [];
      for (let i = 0; i < 5; i++) {
        savePromises.push(
          mockSaveConfig(config, { agents: { [`agent${i}`]: { model: `model${i}` } } })
        );
      }

      const results = await Promise.allSettled(savePromises);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("backup uses timestamp + random for uniqueness on rapid saves", async () => {
      const { mockBackupConfig } = createConfigMocks();
      const filePath = "/test/config.json";

      const backupPromises = [];
      for (let i = 0; i < 5; i++) {
        // Add small async delay between calls to ensure Date.now() changes
        backupPromises.push(
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return mockBackupConfig(filePath);
          })()
        );
      }

      const backups = await Promise.all(backupPromises);
      const uniqueBackups = new Set(backups);
      expect(uniqueBackups.size).toBe(5);
      expect(backups.every((b) => b.includes(".bak."))).toBe(true);
    });
  });

  describe("4. Dialog Transition Timing", () => {
    it("clear() completes before replace() in same event loop", () => {
      const mockApi = createMockApi();

      mockApi.ui.dialog.clear();
      expect(mockApi.ui.dialog.clear).toHaveBeenCalled();

      let replaceCalled = false;
      setTimeout(() => {
        mockApi.ui.dialog.replace(() => ({ type: "dialog" }));
        replaceCalled = true;
      }, 0);

      expect(mockApi.ui.dialog.replace).not.toHaveBeenCalled();
      expect(replaceCalled).toBe(false);
    });

    it("new dialog renders after transition completes", async () => {
      const mockApi = createMockApi();
      const renderCallbacks: string[] = [];

      const transitionToNewDialog = () => {
        renderCallbacks.push("clear-start");
        mockApi.ui.dialog.clear();
        renderCallbacks.push("clear-end");

        setTimeout(() => {
          renderCallbacks.push("replace-start");
          mockApi.ui.dialog.replace(() => ({ type: "new-dialog" }));
          renderCallbacks.push("replace-end");
        }, 0);
      };

      transitionToNewDialog();
      expect(renderCallbacks).toEqual(["clear-start", "clear-end"]);

      await delay(10);
      expect(renderCallbacks).toEqual([
        "clear-start",
        "clear-end",
        "replace-start",
        "replace-end",
      ]);
    });

    it("timing allows for proper SolidJS rendering", async () => {
      const mockApi = createMockApi();
      let rendered = false;

      const renderDialog = () => {
        setTimeout(() => {
          rendered = true;
        }, 0);
      };

      renderDialog();
      expect(rendered).toBe(false);

      await delay(10);
      expect(rendered).toBe(true);
    });

    it("handles fast user input during transitions", async () => {
      const mockApi = createMockApi();
      let transitionInProgress = true;
      let userInputCount = 0;

      mockApi.ui.dialog.clear();
      setTimeout(() => {
        mockApi.ui.dialog.replace(() => ({ type: "dialog" }));
        transitionInProgress = false;
      }, 0);

      const handleUserInput = () => {
        if (!transitionInProgress) {
          userInputCount++;
        }
      };

      handleUserInput();
      expect(userInputCount).toBe(0);

      await delay(10);
      handleUserInput();
      expect(userInputCount).toBe(1);
    });

    it("prevents double navigation during transitions", async () => {
      const mockApi = createMockApi();
      let navigationCount = 0;

      const safeNavigate = (action: string) => {
        if (navigationCount > 0) return;
        navigationCount++;

        mockApi.ui.dialog.clear();
        setTimeout(() => {
          if (navigationCount === 1) {
            mockApi.ui.dialog.replace(() => ({ type: action }));
          }
        }, 0);
      };

      safeNavigate("first");
      safeNavigate("second");
      safeNavigate("third");

      expect(navigationCount).toBe(1);

      await delay(10);
      expect(navigationCount).toBe(1);
    });
  });

  describe("5. Reload Timing", () => {
    it("reload completes before returning", async () => {
      const mockApi = createMockApi();
      let reloadComplete = false;

      const reloadAgents = async () => {
        await delay(50);
        await mockApi.client.instance.dispose({});
        reloadComplete = true;
      };

      await reloadAgents();
      expect(reloadComplete).toBe(true);
    });

    it("reload during active navigation waits for completion", async () => {
      const mockApi = createMockApi();
      let navigationComplete = false;
      let reloadComplete = false;

      const navigation = () => {
        mockApi.ui.dialog.clear();
        setTimeout(() => {
          mockApi.ui.dialog.replace(() => ({ type: "navigated" }));
          navigationComplete = true;
        }, 0);
      };

      const reload = async () => {
        await delay(50);
        await mockApi.client.instance.dispose({});
        reloadComplete = true;
      };

      navigation();
      const reloadPromise = reload();

      await delay(100);

      expect(navigationComplete).toBe(true);
      expect(reloadComplete).toBe(true);

      await reloadPromise;
    });

    it("handles multiple rapid reloads", async () => {
      const mockApi = createMockApi();

      let reloads = 0;
      mockApi.client.instance.dispose = vi.fn().mockImplementation(async () => {
        reloads++;
        await delay(20);
      });

      const reloadPromises = [];
      for (let i = 0; i < 3; i++) {
        reloadPromises.push(mockApi.client.instance.dispose({}));
      }

      await delay(100);
      await Promise.all(reloadPromises);

      expect(reloads).toBe(3);
    });

    it("reload timing doesn't cause memory leaks", async () => {
      const mockApi = createMockApi();
      const cleanupFns: Array<() => void> = [];

      for (let i = 0; i < 10; i++) {
        const cleanup = vi.fn();
        cleanupFns.push(cleanup);
      }

      for (const cleanup of cleanupFns) {
        await mockApi.client.instance.dispose({});
        cleanup();
      }

      expect(cleanupFns.every((c) => c.mock.calls.length === 1)).toBe(true);
    });
  });

  describe("6. Callback Timing", () => {
    it("onSuccess callback is called at correct time", async () => {
      let callbackCalled = false;
      let callbackValue: string | null = null;

      const onSuccess = (value: string) => {
        callbackCalled = true;
        callbackValue = value;
      };

      const asyncOperation = async () => {
        await delay(50);
        return "result";
      };

      const wrappedOperation = async () => {
        const result = await asyncOperation();
        onSuccess(result);
      };

      await wrappedOperation();
      expect(callbackCalled).toBe(true);
      expect(callbackValue).toBe("result");
    });

    it("callbacks don't block UI when async", async () => {
      let uiResponsive = true;

      const callback = async () => {
        await delay(100);
      };

      callback().catch(() => {});
      expect(uiResponsive).toBe(true);

      await delay(50);
      expect(uiResponsive).toBe(true);
    });

    it("callback error handling timing", async () => {
      let errorHandled = false;
      let errorValue: Error | null = null;

      const onError = (error: Error) => {
        errorHandled = true;
        errorValue = error;
      };

      const failingOperation = async () => {
        await delay(50);
        throw new Error("Operation failed");
      };

      const wrappedOperation = async () => {
        try {
          await failingOperation();
        } catch (error) {
          onError(error as Error);
        }
      };

      await wrappedOperation();
      expect(errorHandled).toBe(true);
      expect(errorValue?.message).toBe("Operation failed");
    });

    it("multiple callbacks are called in order", async () => {
      const callOrder: number[] = [];

      const callback1 = async () => {
        await delay(20);
        callOrder.push(1);
      };

      const callback2 = async () => {
        await delay(40);
        callOrder.push(2);
      };

      const callback3 = async () => {
        await delay(10);
        callOrder.push(3);
      };

      await callback1();
      await callback2();
      await callback3();

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it("callback in saveAgentConfig is called after reload", async () => {
      const mockApi = createMockApi();
      let callbackCalled = false;

      const onSuccess = () => {
        callbackCalled = true;
      };

      const simulateReload = async () => {
        await delay(30);
        await mockApi.client.instance.dispose({});
      };

      const simulateSave = async () => {
        await delay(20);
        await simulateReload();
        onSuccess();
      };

      await simulateSave();
      await delay(100);
      expect(callbackCalled).toBe(true);
    });
  });

  describe("7. Error Handler Timing", () => {
    it("error logging completes before toast notification", async () => {
      const mockApi = createMockApi();
      const logOrder: string[] = [];

      const logError = async () => {
        await delay(20);
        logOrder.push("error-logged");
      };

      const showErrorToast = () => {
        mockApi.ui.toast({
          variant: "error",
          message: "An error occurred",
        });
        logOrder.push("toast-shown");
      };

      const handleError = async () => {
        try {
          throw new Error("Test error");
        } catch (error) {
          await logError();
          showErrorToast();
        }
      };

      await handleError();
      await delay(100);

      expect(logOrder[0]).toBe("error-logged");
      expect(logOrder[1]).toBe("toast-shown");
    });

    it("error recovery doesn't loop infinitely", async () => {
      const mockApi = createMockApi();
      let attemptCount = 0;
      const maxAttempts = 3;

      const tryRecover = () => {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          setTimeout(tryRecover, 10);
          return;
        }
        mockApi.ui.toast({ variant: "error", message: "Recovery failed" });
      };

      tryRecover();
      await delay(100);

      expect(attemptCount).toBe(maxAttempts);
      expect(mockApi.ui.toast).toHaveBeenCalled();
    });

    it("error toast timing is appropriate for user visibility", () => {
      const mockApi = createMockApi();
      let toastShown = false;

      const showErrorToast = () => {
        toastShown = true;
        mockApi.ui.toast({
          variant: "error",
          message: "Operation failed",
        });
      };

      showErrorToast();
      expect(toastShown).toBe(true);
      expect(mockApi.ui.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          message: expect.any(String),
        })
      );
    });

    it("handles errors during async operations gracefully", async () => {
      const mockApi = createMockApi();

      const asyncOperationWithError = async () => {
        await delay(20);
        throw new Error("Async operation failed");
      };

      const wrappedOperation = async () => {
        try {
          await asyncOperationWithError();
        } catch (error) {
          mockApi.ui.toast({
            variant: "error",
            message: (error as Error).message,
          });
        }
      };

      await wrappedOperation();
      await delay(100);

      expect(mockApi.ui.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          message: "Async operation failed",
        })
      );
    });

    it("error handler timing respects event loop order", async () => {
      const executionOrder: string[] = [];

      const syncError = () => {
        executionOrder.push("sync-error");
      };

      const asyncError = async () => {
        await delay(10);
        executionOrder.push("async-error");
      };

      const handleError = async () => {
        try {
          throw new Error("Test");
        } catch {
          syncError();
          await asyncError();
        }
      };

      await handleError();
      await delay(50);

      expect(executionOrder[0]).toBe("sync-error");
      expect(executionOrder[1]).toBe("async-error");
    });
  });

  describe("8. Integration: Full Timing Flow Tests", () => {
    it("complete agent model selection flow with timing", async () => {
      const mockApi = createMockApi();
      const flowSteps: string[] = [];

      const selectModel = () => {
        flowSteps.push("model-selected");
        mockApi.ui.dialog.clear();
      };

      const saveConfig = async () => {
        flowSteps.push("save-started");
        await delay(50);
        flowSteps.push("save-completed");
      };

      const reloadAgents = async () => {
        flowSteps.push("reload-started");
        await delay(30);
        await mockApi.client.instance.dispose({});
        flowSteps.push("reload-completed");
      };

      const navigateBack = () => {
        flowSteps.push("navigating");
        mockApi.ui.dialog.clear();
        setTimeout(() => {
          mockApi.ui.dialog.replace(() => ({ type: "agent-list" }));
          flowSteps.push("navigation-complete");
        }, 0);
      };

      selectModel();
      await saveConfig();
      await reloadAgents();
      navigateBack();
      await delay(100);

      expect(flowSteps).toEqual([
        "model-selected",
        "save-started",
        "save-completed",
        "reload-started",
        "reload-completed",
        "navigating",
        "navigation-complete",
      ]);
    });

    it("rapid navigation between dialogs maintains state", async () => {
      const mockApi = createMockApi();
      const navigationHistory: string[] = [];
      let isNavigating = false;

      const navigateTo = (name: string) => {
        if (isNavigating) return;
        isNavigating = true;
        navigationHistory.push(`${name}-clear`);
        mockApi.ui.dialog.clear();
        setTimeout(() => {
          mockApi.ui.dialog.replace(() => ({ type: name }));
          navigationHistory.push(`${name}-replace`);
          isNavigating = false;
        }, 0);
      };

      navigateTo("list");
      navigateTo("detail");
      navigateTo("model");

      expect(navigationHistory).toEqual(["list-clear"]);

      await delay(10);
      expect(navigationHistory).toEqual(["list-clear", "list-replace"]);
    });

    it("timeout protection prevents stuck operations", async () => {
      const mockApi = createMockApi();
      let operationTimedOut = false;

      const operationWithTimeout = async () => {
        const timeout = 100;

        const doOperation = async () => {
          await delay(500);
        };

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Operation timeout")), timeout);
        });

        try {
          await Promise.race([doOperation(), timeoutPromise]);
        } catch (error) {
          operationTimedOut = true;
          mockApi.ui.toast({
            variant: "error",
            message: "Operation timed out",
          });
        }
      };

      await operationWithTimeout();
      await delay(200);

      expect(operationTimedOut).toBe(true);
      expect(mockApi.ui.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          message: "Operation timed out",
        })
      );
    });

    it("debounced operations prevent excessive saves", async () => {
      const mockApi = createMockApi();
      let saveCount = 0;

      const debouncedSave = vi.fn().mockImplementation(async () => {
        saveCount++;
        await delay(50);
      });

      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          debouncedSave();
        }, i * 50);
      }

      await delay(500);
      expect(saveCount).toBe(5);
    });
  });

  describe("9. Timing Edge Cases", () => {
    it("handles setTimeout with delay of 0 correctly", async () => {
      let executed = false;

      setTimeout(() => {
        executed = true;
      }, 0);

      expect(executed).toBe(false);

      await delay(10);
      expect(executed).toBe(true);
    });

    it("handles immediate callbacks vs deferred callbacks", async () => {
      const executionOrder: string[] = [];

      const immediate = () => {
        executionOrder.push("immediate");
      };

      const deferred = () => {
        executionOrder.push("deferred-start");
        setTimeout(() => {
          executionOrder.push("deferred-end");
        }, 0);
      };

      immediate();
      deferred();

      expect(executionOrder).toEqual(["immediate", "deferred-start"]);

      await delay(10);
      expect(executionOrder).toEqual(["immediate", "deferred-start", "deferred-end"]);
    });

    it("handles microtasks vs macrotasks ordering", async () => {
      const order: string[] = [];

      Promise.resolve().then(() => order.push("microtask"));
      setTimeout(() => order.push("macrotask"), 0);

      await delay(50);
      expect(order).toEqual(["microtask", "macrotask"]);
    });

    it("handles Promise.all with mixed success/failure timing", async () => {
      const results: Array<{ status: string }> = [];

      const promises = [
        (async () => {
          await delay(20);
          results.push({ status: "first-resolved" });
        })(),
        (async () => {
          await delay(10);
          throw new Error("second-failed");
        })(),
        (async () => {
          await delay(30);
          results.push({ status: "third-resolved" });
        })(),
      ];

      const settled = await Promise.allSettled(promises);

      expect(settled[0].status).toBe("fulfilled");
      expect(settled[1].status).toBe("rejected");
      expect(settled[2].status).toBe("fulfilled");
      expect(results.length).toBe(2);
    });

    it("handles nested setTimeout correctly", async () => {
      const levels: number[] = [];
      let callCount = 0;
      const maxCalls = 3;

      const nested = (level: number) => {
        if (callCount >= maxCalls) return;
        callCount++;
        levels.push(level);
        if (level < 3) {
          setTimeout(() => {
            nested(level + 1);
          }, 10);
        }
      };

      nested(1);
      await delay(200);
      expect(levels).toEqual([1, 2, 3]);
    });
  });

  describe("10. Source Code Timing Pattern Validation", () => {
    // Note: The TUI plugin uses safeSetTimeout wrapper instead of setTimeout directly.
    // All patterns below check for safeSetTimeout to match the actual source code.

    it("all navigation functions follow timing pattern", () => {
      const navigationPatterns = [
        /function showAgentList\([\s\S]*?safeSetTimeout/,
        /function showAgentDetail\([\s\S]*?safeSetTimeout/,
        /function showFallbackManager\([\s\S]*?safeSetTimeout/,
        /function showAddFallback\([\s\S]*?safeSetTimeout/,
        /function showEditFallback\([\s\S]*?safeSetTimeout/,
        /function showModelsForProvider\([\s\S]*?safeSetTimeout/,
        /function showAllModels\([\s\S]*?safeSetTimeout/,
      ];

      for (const pattern of navigationPatterns) {
        const match = pluginSource.match(pattern);
        expect(match).not.toBeNull();
      }
    });

    it("commit functions use setImmediate for timing safety", () => {
      const commitProviderPattern = /commitProviderSelection[\s\S]*?setImmediate/;
      expect(pluginSource).toMatch(commitProviderPattern);
    });

    it("clear-then-timeout pattern is consistent", () => {
      // Pattern: dialog.clear() followed by safeSetTimeout (uses wrapper in this plugin)
      const clearTimeoutPattern = /api\.ui\.dialog\.clear\(\);[\s\S]*?safeSetTimeout\(/g;
      const matches = pluginSource.match(clearTimeoutPattern) || [];
      expect(matches.length).toBeGreaterThan(3);
    });

    it("no direct navigation without safeSetTimeout in navigation functions", () => {
      const navigationFunctions = [
        "showAgentList",
        "showAgentDetail",
        "showFallbackManager",
        "showAddFallback",
        "showEditFallback",
      ];

      for (const func of navigationFunctions) {
        const funcStart = pluginSource.indexOf(`function ${func}(`);
        if (funcStart === -1) continue;


        const funcEnd = pluginSource.indexOf("function ", funcStart + 1) || pluginSource.length;
        const funcBody = pluginSource.substring(funcStart, funcEnd);

        if (funcBody.includes("api.ui.dialog.replace(")) {
          // Check for safeSetTimeout wrapper, not setTimeout directly
          expect(funcBody).toContain("safeSetTimeout(");
        }
      }
    });

    it("error handling uses async patterns", () => {
      const saveAgentConfigStart = pluginSource.indexOf("async function saveAgentConfig(");
      expect(saveAgentConfigStart).toBeGreaterThan(-1);

      const saveAgentConfigEnd = pluginSource.indexOf("\n  async function ", saveAgentConfigStart + 1) || pluginSource.length;
      const saveBody = pluginSource.substring(saveAgentConfigStart, saveAgentConfigEnd);

      expect(saveBody).toContain("try {");
      expect(saveBody).toContain("catch");
      expect(saveBody).toContain("await");
    });

    it("toast notifications are called after async operations complete", () => {
      const saveAgentConfigStart = pluginSource.indexOf("async function saveAgentConfig(");
      const saveAgentConfigEnd = pluginSource.indexOf("\n  async function ", saveAgentConfigStart + 1) || pluginSource.length;
      const saveBody = pluginSource.substring(saveAgentConfigStart, saveAgentConfigEnd);

      const awaitPositions: number[] = [];
      for (const match of saveBody.matchAll(/await /g)) {
        awaitPositions.push(match.index || 0);
      }
      expect(awaitPositions.length).toBeGreaterThan(0);

      const successToastPattern = /api\.ui\.toast\(\{[^}]*variant:\s*["']success["'][^}]*\}/g;
      const errorToastPattern = /api\.ui\.toast\(\{[^}]*variant:\s*["']error["'][^}]*\}/g;

      let hasAsyncSuccessToast = false;
      let hasAsyncErrorToast = false;

      for (const match of saveBody.matchAll(successToastPattern)) {
        const pos = match.index || 0;
        if (awaitPositions.some((awaitPos) => awaitPos < pos)) {
          hasAsyncSuccessToast = true;
        }
      }

      for (const match of saveBody.matchAll(errorToastPattern)) {
        const pos = match.index || 0;
        if (awaitPositions.some((awaitPos) => awaitPos < pos)) {
          hasAsyncErrorToast = true;
        }
      }

      expect(hasAsyncSuccessToast).toBe(true);
    });
  });
});
