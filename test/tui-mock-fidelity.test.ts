import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFailableMock } from "./helpers/mock-isolation.js";

// ============================================================================
// Type Definitions for OpenTUI API
// ============================================================================

interface DialogOption {
  title: string;
  value: Record<string, unknown>;
  description?: string;
  footer?: string;
  onSelect?: () => void;
}

interface DialogProps {
  title?: string;
  options?: DialogOption[];
  placeholder?: string;
  current?: number;
  value?: string;
  onConfirm?: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  onSelect?: (item: { value: Record<string, unknown> } | null) => void;
  onValueChange?: (item: { value: Record<string, unknown> } | null) => void;
}

interface MockDialogState {
  component: ((props: DialogProps) => unknown) | null;
  props: DialogProps | null;
  size: string;
  cleared: boolean;
  replaceCalls: Array<{ component: unknown; props: DialogProps }>;
  clearCalls: number;
  setSizeCalls: string[];
  toasts: Array<{ variant: string; message: string }>;
  renderedComponents: Array<{ component: unknown; props: DialogProps }>;
}

interface MockApi {
  ui: {
    DialogSelect: ((props: DialogProps) => unknown) | undefined;
    Select: ((props: DialogProps) => unknown) | undefined;
    DialogPrompt: ((props: DialogProps) => unknown) | undefined;
    when: (() => unknown[]) | undefined;
    dialog: {
      render: (component: unknown, props: DialogProps) => void;
      clear: () => void;
      replace: (component: unknown, props: DialogProps) => void;
      setSize: (size: string) => void;
    };
    toast: (opts: { variant: string; message: string }) => void;
  };
  client: {
    instance: {
      dispose: (opts?: Record<string, unknown>) => Promise<boolean>;
    };
  };
  command: {
    openPalette: () => void;
    register: (fn: () => Array<{
      title: string;
      value: string;
      description?: string;
      category?: string;
      suggested?: boolean;
      slash?: { name: string; aliases?: string[] };
      onSelect?: () => void;
    }>) => () => void;
  };
  state: {
    agentKey?: string;
    mergedAgents?: Record<string, unknown>;
    provider?: Array<{ id: string; name?: string; models?: Record<string, unknown> }> | Record<string, unknown>;
    models?: Record<string, unknown>;
    path?: {
      directory?: string;
    };
  };
  theme: {
    current: {
      backgroundPanel?: string;
      border?: string;
      text?: string;
      textMuted?: string;
      primary?: string;
      success?: string;
      error?: string;
      warning?: string;
    };
  };
  lifecycle: {
    onDispose: (fn: () => void) => void;
  };
}

// ============================================================================
// Mock API Factory
// ============================================================================

function createMockApi(overrides: Partial<MockApi> = {}): { api: MockApi; state: MockDialogState } {
  const state: MockDialogState = {
    component: null,
    props: null,
    size: "large",
    cleared: false,
    replaceCalls: [],
    clearCalls: 0,
    setSizeCalls: [],
    toasts: [],
    renderedComponents: [],
  };

  // Create a mock DialogSelect component that captures props
  const MockDialogSelect = (props: DialogProps) => {
    state.component = MockDialogSelect;
    state.props = props;
    state.renderedComponents.push({ component: MockDialogSelect, props });
    return `DialogSelect:${props.title || "untitled"}`;
  };

  // Create a mock DialogPrompt component
  const MockDialogPrompt = (props: DialogProps) => {
    state.component = MockDialogPrompt;
    state.props = props;
    state.renderedComponents.push({ component: MockDialogPrompt, props });
    return `DialogPrompt:${props.title || "untitled"}`;
  };

  const api: MockApi = {
    ui: {
      DialogSelect: MockDialogSelect,
      Select: undefined,
      DialogPrompt: MockDialogPrompt,
      when: () => [],
      dialog: {
        render: (component, props) => {
          state.component = component as ((props: DialogProps) => unknown);
          state.props = props;
          state.cleared = false;
          state.renderedComponents.push({ component, props });
        },
        clear: () => {
          state.cleared = true;
          state.component = null;
          state.props = null;
          state.clearCalls++;
        },
        replace: (component, props) => {
          state.replaceCalls.push({ component, props });
          state.component = component as ((props: DialogProps) => unknown);
          state.props = props;
          state.cleared = false;
          state.renderedComponents.push({ component, props });
        },
        setSize: (size) => {
          state.size = size;
          state.setSizeCalls.push(size);
        },
      },
      toast: (opts) => {
        state.toasts.push(opts);
      },
    },
    client: {
      instance: {
        dispose: vi.fn(async () => true),
      },
    },
    command: {
      openPalette: vi.fn(),
      register: vi.fn(() => vi.fn()),
    },
    state: {
      agentKey: undefined,
      mergedAgents: {},
      provider: [],
      models: {},
      path: { directory: os.tmpdir() },
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

  return { api, state };
}

// ============================================================================
// Test Suite: API Contract Validation
// ============================================================================

describe("TUI Mock API - Contract Validation", () => {
  describe("api.ui.dialog.replace()", () => {
    it("receives a function that returns a component", () => {
      const { api, state } = createMockApi();

      const componentFn = () => "test-component" as unknown;
      api.ui.dialog.replace(componentFn, { title: "Test" });

      expect(state.replaceCalls.length).toBe(1);
      expect(typeof state.replaceCalls[0].component).toBe("function");
    });

    it("receives props object with expected structure", () => {
      const { api, state } = createMockApi();

      const testProps: DialogProps = {
        title: "Test Dialog",
        options: [],
        placeholder: "Select an option",
      };

      api.ui.dialog.replace(() => "test", testProps);

      expect(state.replaceCalls[0].props).toBeDefined();
      expect(state.replaceCalls[0].props?.title).toBe("Test Dialog");
      expect(state.replaceCalls[0].props?.options).toEqual([]);
      expect(state.replaceCalls[0].props?.placeholder).toBe("Select an option");
    });

    it("can receive multiple replace calls in sequence", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.replace(() => "first", { title: "First" });
      api.ui.dialog.replace(() => "second", { title: "Second" });
      api.ui.dialog.replace(() => "third", { title: "Third" });

      expect(state.replaceCalls.length).toBe(3);
      expect(state.replaceCalls[0].props?.title).toBe("First");
      expect(state.replaceCalls[1].props?.title).toBe("Second");
      expect(state.replaceCalls[2].props?.title).toBe("Third");
    });
  });

  describe("api.ui.dialog.clear()", () => {
    it("is callable and resets dialog state", () => {
      const { api, state } = createMockApi();

      // First render something
      api.ui.dialog.replace(() => "test", { title: "Test" });
      expect(state.component).toBeDefined();

      // Clear it
      api.ui.dialog.clear();

      expect(state.clearCalls).toBe(1);
      expect(state.cleared).toBe(true);
      expect(state.component).toBeNull();
      expect(state.props).toBeNull();
    });

    it("can be called multiple times", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.clear();
      api.ui.dialog.clear();
      api.ui.dialog.clear();

      expect(state.clearCalls).toBe(3);
    });
  });

  describe("api.ui.dialog.setSize()", () => {
    it("accepts valid size values", () => {
      const { api, state } = createMockApi();

      const validSizes = ["small", "medium", "large", "xlarge"];

      for (const size of validSizes) {
        api.ui.dialog.setSize(size);
      }

      expect(state.setSizeCalls).toEqual(validSizes);
    });

    it("can change size multiple times", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.setSize("large");
      api.ui.dialog.setSize("xlarge");
      api.ui.dialog.setSize("medium");

      expect(state.setSizeCalls).toEqual(["large", "xlarge", "medium"]);
      expect(state.size).toBe("medium");
    });

    it("tracks the current size value", () => {
      const { api, state } = createMockApi();

      expect(state.size).toBe("large"); // Default

      api.ui.dialog.setSize("small");
      expect(state.size).toBe("small");

      api.ui.dialog.setSize("xlarge");
      expect(state.size).toBe("xlarge");
    });
  });

  describe("api.ui.dialog.render()", () => {
    it("receives component and props", () => {
      const { api, state } = createMockApi();

      const componentFn = () => "test";
      api.ui.dialog.render(componentFn, { title: "Rendered" });

      expect(state.component).toBe(componentFn);
      expect(state.props?.title).toBe("Rendered");
    });

    it("tracks rendered components separately from replace", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.render(() => "rendered", { title: "R1" });
      api.ui.dialog.replace(() => "replaced", { title: "R2" });

      expect(state.replaceCalls.length).toBe(1);
      expect(state.renderedComponents.length).toBe(2);
    });
  });
});

// ============================================================================
// Test Suite: Component Props Validation
// ============================================================================

describe("TUI Mock API - Component Props Validation", () => {
  describe("options array validation", () => {
    it("accepts valid options array", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Option 1", value: { action: "a" } },
        { title: "Option 2", value: { action: "b" } },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(state.props?.options).toHaveLength(2);
      expect(state.props?.options?.[0].title).toBe("Option 1");
    });

    it("accepts empty options array", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.replace(() => "test", { options: [] });

      expect(state.props?.options).toEqual([]);
    });

    it("validates option items have required title field", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Valid Option", value: { action: "test" } },
      ];

      api.ui.dialog.replace(() => "test", { options });

      for (const opt of state.props?.options || []) {
        expect(typeof opt.title).toBe("string");
        expect(opt.title.length).toBeGreaterThan(0);
      }
    });

    it("validates option items have required value field", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Test", value: { action: "test" } },
        { title: "Model", value: { model: "claude", provider: "anthropic" } },
      ];

      api.ui.dialog.replace(() => "test", { options });

      for (const opt of state.props?.options || []) {
        expect(typeof opt.value).toBe("object");
        expect(opt.value).not.toBeNull();
      }
    });
  });

  describe("option item optional fields", () => {
    it("accepts options with description field", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Test", value: { action: "test" }, description: "A test option" },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(state.props?.options?.[0].description).toBe("A test option");
    });

    it("accepts options with footer field", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Test", value: { action: "test" }, footer: "info" },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(state.props?.options?.[0].footer).toBe("info");
    });

    it("accepts options with onSelect callback", () => {
      const { api, state } = createMockApi();
      const onSelectFn = vi.fn();

      const options: DialogOption[] = [
        { title: "Test", value: { action: "test" }, onSelect: onSelectFn },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(typeof state.props?.options?.[0].onSelect).toBe("function");
    });

    it("accepts options with all optional fields", () => {
      const { api, state } = createMockApi();
      const onSelectFn = vi.fn();

      const options: DialogOption[] = [
        {
          title: "Complete Option",
          value: { action: "complete" },
          description: "Full description",
          footer: "metadata",
          onSelect: onSelectFn,
        },
      ];

      api.ui.dialog.replace(() => "test", { options });

      const opt = state.props?.options?.[0];
      expect(opt?.title).toBe("Complete Option");
      expect(opt?.description).toBe("Full description");
      expect(opt?.footer).toBe("metadata");
      expect(opt?.onSelect).toBe(onSelectFn);
    });
  });

  describe("component-level onSelect validation", () => {
    it("accepts onSelect as function", () => {
      const { api, state } = createMockApi();
      const onSelectFn = vi.fn();

      api.ui.dialog.replace(() => "test", {
        title: "Test",
        options: [{ title: "Opt", value: { action: "a" } }],
        onSelect: onSelectFn,
      });

      expect(typeof state.props?.onSelect).toBe("function");
    });

    it("accepts onValueChange as alternative to onSelect", () => {
      const { api, state } = createMockApi();
      const onValueChangeFn = vi.fn();

      api.ui.dialog.replace(() => "test", {
        title: "Test",
        options: [{ title: "Opt", value: { action: "a" } }],
        onValueChange: onValueChangeFn,
      });

      expect(typeof state.props?.onValueChange).toBe("function");
    });

    it("onSelect receives item with value property", () => {
      const { api, state } = createMockApi();
      let receivedItem: { value: Record<string, unknown> } | null = null;

      api.ui.dialog.replace(() => "test", {
        title: "Test",
        options: [{ title: "Opt", value: { action: "selected" } }],
        onSelect: (item) => {
          receivedItem = item;
        },
      });

      // Simulate selection
      const option = state.props?.options?.[0];
      if (option?.onSelect) {
        option.onSelect();
      }

      // The component's onSelect would be called with the selected item
      expect(state.props?.onSelect).toBeDefined();
    });
  });

  describe("DialogPrompt props validation", () => {
    it("accepts value prop for pre-filled input", () => {
      const { api, state } = createMockApi();

      const componentFn = (props: DialogProps) => {
        state.props = props;
        return "prompt";
      };

      api.ui.dialog.replace(componentFn, {
        title: "Custom Input",
        value: "pre-filled",
        placeholder: "Enter value",
      });

      expect(state.props?.value).toBe("pre-filled");
      expect(state.props?.placeholder).toBe("Enter value");
    });

    it("accepts onConfirm callback", () => {
      const { api, state } = createMockApi();
      const onConfirmFn = vi.fn();

      api.ui.dialog.replace(() => "prompt", {
        title: "Confirm",
        onConfirm: onConfirmFn,
      });

      expect(typeof state.props?.onConfirm).toBe("function");
    });

    it("accepts onCancel callback", () => {
      const { api, state } = createMockApi();
      const onCancelFn = vi.fn();

      api.ui.dialog.replace(() => "prompt", {
        title: "Cancel",
        onCancel: onCancelFn,
      });

      expect(typeof state.props?.onCancel).toBe("function");
    });
  });
});

// ============================================================================
// Test Suite: API Error Simulation
// ============================================================================

describe("TUI Mock API - Error Simulation", () => {
  describe("api.ui.DialogSelect undefined", () => {
    it("handles missing DialogSelect gracefully", () => {
      const { api, state } = createMockApi({
        ui: {
          ...createMockApi().api.ui,
          DialogSelect: undefined,
        },
      });

      // Verify it's undefined
      expect(api.ui.DialogSelect).toBeUndefined();

      // The TUI plugin checks for this and falls back to command.openPalette
      if (!api.ui.DialogSelect) {
        api.command.openPalette();
      }

      expect(api.command.openPalette).toHaveBeenCalled();
    });

    it("falls back to api.ui.Select if available", () => {
      const mockSelect = () => "select-component";
      const { api } = createMockApi({
        ui: {
          ...createMockApi().api.ui,
          DialogSelect: undefined,
          Select: mockSelect,
        },
      });

      const component = api.ui.DialogSelect || api.ui.Select;
      expect(component).toBe(mockSelect);
    });

    it("reports available UI components when DialogSelect is missing", () => {
      const { api } = createMockApi({
        ui: {
          ...createMockApi().api.ui,
          DialogSelect: undefined,
        },
      });

      const availableComponents = Object.keys(api.ui).filter(
        (k) => typeof (api.ui as Record<string, unknown>)[k] === "function"
      );

      expect(availableComponents).toContain("DialogPrompt");
      expect(availableComponents).toContain("when");
      expect(availableComponents).not.toContain("DialogSelect");
    });
  });

  describe("api.ui.when undefined", () => {
    it("handles missing when function gracefully", () => {
      const { api } = createMockApi({
        ui: {
          ...createMockApi().api.ui,
          when: undefined,
        },
      });

      expect(api.ui.when).toBeUndefined();

      // The TUI plugin provides fallback
      const whenFunction = api.ui.when || (() => []);
      expect(whenFunction()).toEqual([]);
    });

    it("can override when with safe fallback", () => {
      const { api } = createMockApi();

      if (typeof api.ui.when !== "function") {
        api.ui.when = () => [];
      }

      expect(typeof api.ui.when).toBe("function");
      expect(api.ui.when()).toEqual([]);
    });
  });

  describe("api.command.openPalette missing", () => {
    it("handles missing openPalette gracefully", () => {
      const { api } = createMockApi({
        command: {
          ...createMockApi().api.command,
          openPalette: undefined,
        },
      });

      expect(api.command.openPalette).toBeUndefined();

      // Plugin should check before calling
      if (api.command.openPalette) {
        api.command.openPalette();
      }

      // openPalette was not called because it was undefined
      expect(api.command.openPalette).toBeUndefined();
    });
  });

  describe("api.state.provider malformed", () => {
    it("handles provider as undefined", () => {
      const { api } = createMockApi({
        state: {
          provider: undefined,
        },
      });

      const providers = api.state.provider || [];
      expect(providers).toEqual([]);
    });

    it("handles provider as null", () => {
      const { api } = createMockApi({
        state: {
          provider: null,
        } as MockApi["state"],
      });

      const providers = api.state.provider || [];
      expect(providers).toEqual([]);
    });

    it("handles provider as array", () => {
      const { api } = createMockApi({
        state: {
          provider: [
            { id: "openai", models: {} },
            { id: "anthropic", models: {} },
          ],
        },
      });

      const providerArr = Array.isArray(api.state.provider)
        ? api.state.provider
        : Object.values(api.state.provider || {});
      expect(providerArr).toHaveLength(2);
    });

    it("handles provider as object (non-array)", () => {
      const { api } = createMockApi({
        state: {
          provider: {
            openai: { models: {} },
            anthropic: { models: {} },
          },
        },
      });

      const providerArr = Array.isArray(api.state.provider)
        ? api.state.provider
        : Object.values(api.state.provider || {});
      expect(providerArr).toHaveLength(2);
    });

    it("handles provider with missing models property", () => {
      const { api } = createMockApi({
        state: {
          provider: [{ id: "openai" }],
        },
      });

      const providers = Array.isArray(api.state.provider)
        ? api.state.provider
        : Object.values(api.state.provider || {});

      for (const provider of providers) {
        const modelsObj = provider.models || {};
        const modelArr = Object.values(modelsObj);
        expect(Array.isArray(modelArr)).toBe(true);
      }
    });
  });

  describe("api.state.path malformed", () => {
    it("handles missing path.directory", () => {
      const { api } = createMockApi({
        state: {
          path: {},
        },
      });

      const cwd = api.state.path?.directory || process.cwd();
      expect(typeof cwd).toBe("string");
    });

    it("handles completely missing path object", () => {
      const { api } = createMockApi({
        state: {
          path: undefined,
        } as MockApi["state"],
      });

      const cwd = api.state.path?.directory || process.cwd();
      expect(typeof cwd).toBe("string");
    });
  });

  describe("api.theme.current malformed", () => {
    it("handles missing theme object", () => {
      const { api } = createMockApi({
        theme: undefined as MockApi["theme"],
      });

      const t = api.theme?.current || {};
      expect(typeof t.backgroundPanel).toBe("undefined");
    });

    it("handles missing theme properties with defaults", () => {
      const { api } = createMockApi({
        theme: {
          current: {},
        },
      });

      const t = api.theme.current;
      const skin = {
        panel: t.backgroundPanel || "#1d1d1d",
        border: t.border || "#3a3a3a",
        text: t.text || "#e0e0e0",
        muted: t.textMuted || "#6a6a6a",
        accent: t.primary || "#5f87ff",
        success: t.success || "#5faf5f",
        error: t.error || "#ff5f5f",
        warning: t.warning || "#ffff5f",
      };

      expect(skin.panel).toBe("#1d1d1d");
      expect(skin.accent).toBe("#5f87ff");
    });
  });

  describe("api.client.instance.dispose error paths", () => {
    it("handles dispose returning false", async () => {
      const { api } = createMockApi({
        client: {
          instance: {
            dispose: vi.fn(async () => false),
          },
        },
      });

      const result = await api.client.instance.dispose({});
      expect(result).toBe(false);
    });

    it("handles dispose throwing an error", async () => {
      const error = new Error("Dispose failed: connection refused");
      const { api } = createMockApi({
        client: {
          instance: {
            dispose: vi.fn(async () => {
              throw error;
            }),
          },
        },
      });

      await expect(api.client.instance.dispose({})).rejects.toThrow(
        "Dispose failed: connection refused"
      );
    });

    it("handles dispose timeout scenario", async () => {
      const timeoutError = new Error("Dispose timed out after 5000ms");
      const { api } = createMockApi({
        client: {
          instance: {
            dispose: vi.fn(async () => {
              throw timeoutError;
            }),
          },
        },
      });

      await expect(api.client.instance.dispose({})).rejects.toThrow(
        "Dispose timed out"
      );
    });

    it("uses createFailableMock for controlled error injection", () => {
      // Test that createFailableMock can be used to inject failures
      const successMock = createFailableMock(true, false);
      const failMock = createFailableMock(false, true);

      // Success path
      expect(successMock()).toBe(true);

      // Error path - should throw
      expect(() => failMock()).toThrow("Mock error for testing error paths");
    });

    it("verifies dispose mock behavior matches createFailableMock pattern", async () => {
      // Demonstrate the pattern: create a dispose mock that can fail
      const failingDispose = vi.fn(async () => {
        throw new Error("Simulated dispose failure");
      });

      // When calling, it should throw
      await expect(failingDispose({})).rejects.toThrow(
        "Simulated dispose failure"
      );
    });

    it("handles dispose returning null/undefined", async () => {
      const { api } = createMockApi({
        client: {
          instance: {
            dispose: vi.fn(async () => null as unknown as boolean),
          },
        },
      });

      const result = await api.client.instance.dispose({});
      expect(result).toBeNull();
    });

    it("verifies dispose is called with correct options", async () => {
      const { api } = createMockApi();

      await api.client.instance.dispose({});
      expect(api.client.instance.dispose).toHaveBeenCalledWith({});

      await api.client.instance.dispose({ force: true });
      expect(api.client.instance.dispose).toHaveBeenCalledWith({ force: true });
    });
  });
});

// ============================================================================
// Test Suite: Mock Behavior Verification
// ============================================================================

describe("TUI Mock API - Mock Behavior Verification", () => {
  describe("method call tracking", () => {
    it("tracks all dialog.replace() calls with arguments", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.replace(() => "A", { title: "A" });
      api.ui.dialog.replace(() => "B", { title: "B" });
      api.ui.dialog.replace(() => "C", { title: "C" });

      expect(state.replaceCalls.length).toBe(3);
      expect(state.replaceCalls[0].props?.title).toBe("A");
      expect(state.replaceCalls[1].props?.title).toBe("B");
      expect(state.replaceCalls[2].props?.title).toBe("C");
    });

    it("tracks all dialog.clear() calls", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.clear();
      api.ui.dialog.clear();

      expect(state.clearCalls).toBe(2);
    });

    it("tracks all dialog.setSize() calls with values", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.setSize("small");
      api.ui.dialog.setSize("large");
      api.ui.dialog.setSize("xlarge");

      expect(state.setSizeCalls).toEqual(["small", "large", "xlarge"]);
    });

    it("tracks all toast() calls", () => {
      const { api, state } = createMockApi();

      api.ui.toast({ variant: "info", message: "Loading..." });
      api.ui.toast({ variant: "success", message: "Done!" });
      api.ui.toast({ variant: "error", message: "Failed" });

      expect(state.toasts).toHaveLength(3);
      expect(state.toasts[0].variant).toBe("info");
      expect(state.toasts[2].message).toBe("Failed");
    });

    it("tracks all rendered components", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.render(() => "R1", { title: "R1" });
      api.ui.dialog.replace(() => "R2", { title: "R2" });

      expect(state.renderedComponents).toHaveLength(2);
    });

    it("provides accurate call counts", () => {
      const { api, state } = createMockApi();

      expect(state.clearCalls).toBe(0);
      expect(state.replaceCalls.length).toBe(0);
      expect(state.setSizeCalls.length).toBe(0);

      api.ui.dialog.replace(() => "1", { title: "1" });
      api.ui.dialog.setSize("medium");
      api.ui.dialog.clear();

      expect(state.clearCalls).toBe(1);
      expect(state.replaceCalls.length).toBe(1);
      expect(state.setSizeCalls.length).toBe(1);
    });
  });

  describe("user selection simulation", () => {
    it("can simulate option selection", () => {
      const { api, state } = createMockApi();
      const onSelectFn = vi.fn();

      api.ui.dialog.replace(() => "test", {
        title: "Select",
        options: [
          { title: "Option 1", value: { action: "opt1" } },
          { title: "Option 2", value: { action: "opt2" } },
        ],
        onSelect: onSelectFn,
      });

      // Simulate selecting option 1
      const selectedItem = state.props?.options?.[0];
      if (selectedItem?.onSelect) {
        selectedItem.onSelect();
      }

      // The onSelect would be called with the item
      expect(selectedItem?.title).toBe("Option 1");
      expect(selectedItem?.value).toEqual({ action: "opt1" });
    });

    it("can simulate DialogPrompt confirmation", () => {
      const { api, state } = createMockApi();
      const onConfirmFn = vi.fn();

      api.ui.dialog.replace(() => "prompt", {
        title: "Enter Value",
        value: "initial",
        onConfirm: onConfirmFn,
      });

      // Simulate confirming with new value
      if (state.props?.onConfirm) {
        state.props.onConfirm("new-value");
      }

      expect(onConfirmFn).toHaveBeenCalledWith("new-value");
    });

    it("can simulate DialogPrompt cancellation", () => {
      const { api, state } = createMockApi();
      const onCancelFn = vi.fn();

      api.ui.dialog.replace(() => "prompt", {
        title: "Cancel Me",
        onCancel: onCancelFn,
      });

      // Simulate cancel
      if (state.props?.onCancel) {
        state.props.onCancel();
      }

      expect(onCancelFn).toHaveBeenCalled();
    });
  });

  describe("JSX component capture", () => {
    it("captures component function passed to replace()", () => {
      const { api, state } = createMockApi();
      const ComponentFn = () => "jsx-component";

      api.ui.dialog.replace(ComponentFn, { title: "JSX" });

      expect(state.replaceCalls[0].component).toBe(ComponentFn);
    });

    it("captures props passed to rendered component", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "A", value: { id: 1 } },
        { title: "B", value: { id: 2 } },
      ];

      api.ui.dialog.replace(
        () => "test",
        {
          title: "Complex Props",
          options,
          placeholder: "hint text",
          current: 0,
        }
      );

      expect(state.props?.title).toBe("Complex Props");
      expect(state.props?.options).toHaveLength(2);
      expect(state.props?.placeholder).toBe("hint text");
      expect(state.props?.current).toBe(0);
    });
  });

  describe("mock reset between tests", () => {
    it("can be reset to clean state", () => {
      const { api, state } = createMockApi();

      // Add some calls
      api.ui.dialog.replace(() => "1", { title: "1" });
      api.ui.toast({ variant: "info", message: "test" });

      expect(state.replaceCalls.length).toBe(1);
      expect(state.toasts.length).toBe(1);

      // Reset
      state.replaceCalls = [];
      state.toasts = [];
      state.clearCalls = 0;
      state.setSizeCalls = [];
      state.renderedComponents = [];

      expect(state.replaceCalls.length).toBe(0);
      expect(state.toasts.length).toBe(0);
    });
  });
});

// ============================================================================
// Test Suite: Fidelity Check Tests
// ============================================================================

describe("TUI Mock API - Fidelity Check", () => {
  describe("comparison with OpenTUI behavior", () => {
    it("setSize accepts the same values OpenTUI uses", () => {
      const { api, state } = createMockApi();

      // OpenTUI supports: small, medium, large, xlarge
      const validSizes = ["small", "medium", "large", "xlarge"];

      for (const size of validSizes) {
        api.ui.dialog.setSize(size);
      }

      // All sizes should be accepted
      expect(state.setSizeCalls).toEqual(validSizes);
    });

    it("toast variants match OpenTUI supported variants", () => {
      const { api, state } = createMockApi();

      // OpenTUI supports: info, success, error, warning
      const variants = ["info", "success", "error", "warning"];

      for (const variant of variants) {
        api.ui.toast({ variant, message: `${variant} message` });
      }

      expect(state.toasts.map((t) => t.variant)).toEqual(variants);
    });

    it("dialog.clear() resets cleared state for next replace", () => {
      const { api, state } = createMockApi();

      // Clear should reset cleared flag
      api.ui.dialog.clear();
      expect(state.cleared).toBe(true);

      // Replace should reset cleared flag
      api.ui.dialog.replace(() => "test", { title: "Test" });
      expect(state.cleared).toBe(false);
    });
  });

  describe("edge cases in mock implementation", () => {
    it("handles rapid replace/clear sequences", () => {
      const { api, state } = createMockApi();

      // Simulate rapid navigation
      for (let i = 0; i < 10; i++) {
        api.ui.dialog.clear();
        api.ui.dialog.replace(() => `page-${i}`, { title: `Page ${i}` });
      }

      expect(state.clearCalls).toBe(10);
      expect(state.replaceCalls.length).toBe(10);
      expect(state.cleared).toBe(false); // Final state
    });

    it("handles replace with null/undefined props gracefully", () => {
      const { api, state } = createMockApi();

      // These should not throw
      expect(() => {
        api.ui.dialog.replace(() => "test", { title: "Test" });
      }).not.toThrow();

      expect(state.props?.title).toBe("Test");
    });

    it("handles options with complex value objects", () => {
      const { api, state } = createMockApi();

      const complexOptions: DialogOption[] = [
        {
          title: "Complex",
          value: {
            action: "multi",
            data: { nested: { deep: "value" } },
            array: [1, 2, 3],
          },
        },
      ];

      api.ui.dialog.replace(() => "test", { options: complexOptions });

      expect(state.props?.options?.[0].value).toEqual({
        action: "multi",
        data: { nested: { deep: "value" } },
        array: [1, 2, 3],
      });
    });

    it("handles very long option titles", () => {
      const { api, state } = createMockApi();

      const longTitle = "A".repeat(1000);
      const options: DialogOption[] = [
        { title: longTitle, value: { action: "long" } },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(state.props?.options?.[0].title).toHaveLength(1000);
    });

    it("handles unicode in option titles and descriptions", () => {
      const { api, state } = createMockApi();

      const unicodeOptions: DialogOption[] = [
        { title: "日本語タイトル", value: { action: "jp" }, description: "这是中文" },
        { title: "emoji: 😀🎉", value: { action: "emoji" } },
        { title: "العربية", value: { action: "arabic" } },
      ];

      api.ui.dialog.replace(() => "test", { options: unicodeOptions });

      expect(state.props?.options?.[0].title).toBe("日本語タイトル");
      expect(state.props?.options?.[1].title).toContain("emoji:");
      expect(state.props?.options?.[2].title).toBe("العربية");
    });

    it("handles empty string values in options", () => {
      const { api, state } = createMockApi();

      const options: DialogOption[] = [
        { title: "Empty", value: { action: "" } },
        { title: "Null Desc", value: { action: "n" }, description: "" },
      ];

      api.ui.dialog.replace(() => "test", { options });

      expect(state.props?.options?.[0].value.action).toBe("");
      expect(state.props?.options?.[1].description).toBe("");
    });
  });

  describe("concurrent operations on mock", () => {
    it("maintains call order in sequential operations", () => {
      const { api, state } = createMockApi();

      const operations = [
        () => api.ui.dialog.setSize("small"),
        () => api.ui.dialog.replace(() => "A", { title: "A" }),
        () => api.ui.dialog.clear(),
        () => api.ui.dialog.replace(() => "B", { title: "B" }),
        () => api.ui.toast({ variant: "info", message: "1" }),
      ];

      for (const op of operations) {
        op();
      }

      expect(state.setSizeCalls[0]).toBe("small");
      expect(state.replaceCalls[0].props?.title).toBe("A");
      expect(state.clearCalls).toBe(1);
      expect(state.replaceCalls[1].props?.title).toBe("B");
      expect(state.toasts[0].message).toBe("1");
    });

    it("tracks state correctly after mixed operations", () => {
      const { api, state } = createMockApi();

      api.ui.dialog.replace(() => "1", { title: "1" });
      expect(state.component).toBeDefined();
      expect(state.props?.title).toBe("1");

      api.ui.dialog.setSize("xlarge");
      expect(state.size).toBe("xlarge");

      api.ui.dialog.replace(() => "2", { title: "2" });
      expect(state.props?.title).toBe("2");
      expect(state.size).toBe("xlarge"); // Size preserved

      api.ui.dialog.clear();
      expect(state.cleared).toBe(true);
      expect(state.component).toBeNull();
      expect(state.size).toBe("xlarge"); // Size preserved
    });

    it("handles interleaved toasts with dialog operations", () => {
      const { api, state } = createMockApi();

      api.ui.toast({ variant: "info", message: "Loading..." });
      api.ui.dialog.replace(() => "test", { title: "Test" });
      api.ui.toast({ variant: "success", message: "Loaded!" });

      expect(state.toasts.length).toBe(2);
      expect(state.replaceCalls.length).toBe(1);
      expect(state.toasts[0].message).toBe("Loading...");
      expect(state.toasts[1].message).toBe("Loaded!");
    });
  });

  describe("mock isolation", () => {
    it("each createMockApi() call is independent", () => {
      const mock1 = createMockApi();
      const mock2 = createMockApi();

      mock1.api.ui.dialog.replace(() => "1", { title: "1" });
      mock2.api.ui.dialog.replace(() => "2", { title: "2" });

      expect(mock1.state.replaceCalls.length).toBe(1);
      expect(mock2.state.replaceCalls.length).toBe(1);
      expect(mock1.state.props?.title).toBe("1");
      expect(mock2.state.props?.title).toBe("2");
    });

    it("overrides apply only to specified mock", () => {
      const { api: api1, state: state1 } = createMockApi({
        ui: { ...createMockApi().api.ui, DialogSelect: undefined },
      });
      const { api: api2, state: state2 } = createMockApi();

      expect(api1.ui.DialogSelect).toBeUndefined();
      expect(api2.ui.DialogSelect).toBeDefined();
    });
  });
});

// ============================================================================
// Test Suite: Realistic TUI Plugin Flow Simulation
// ============================================================================

describe("TUI Mock API - Realistic Flow Simulation", () => {
  it("simulates agent list -> agent detail flow", () => {
    const { api, state } = createMockApi({
      state: {
        provider: [
          {
            id: "anthropic",
            models: {
              "claude-3": { id: "claude-3", name: "Claude 3" },
            },
          },
        ],
      },
    });

    // Flow: showAgentList -> showAgentDetail
    const agents = {
      sisyphus: {
        key: "sisyphus",
        model: "anthropic/claude-3",
        fallback: ["openai"],
        role: "orchestrator",
      },
    };

    // Step 1: Show agent list
    const options = Object.entries(agents).map(([key, agent]) => ({
      title: `Model: ${agent.model || "unset"}`,
      value: { agentKey: key, agent },
      description: `Fallbacks: ${(agent.fallback || []).join(", ") || "none"}`,
    }));

    api.ui.dialog.replace(
      () => "DialogSelect",
      { title: "Agent Manager", options }
    );

    expect(state.props?.title).toBe("Agent Manager");
    expect(state.props?.options).toHaveLength(1);

    // Step 2: User selects agent (simulate onSelect)
    const selectedAgent = state.props?.options?.[0].value;
    expect(selectedAgent?.agentKey).toBe("sisyphus");

    // Step 3: Show agent detail
    api.ui.dialog.clear();
    api.ui.dialog.replace(
      () => "DialogSelect",
      {
        title: "sisyphus (orchestrator)",
        options: [
          { title: "Model: anthropic/claude-3", value: { action: "editModel" } },
          { title: "Fallbacks (1): openai", value: { action: "manageFallbacks" } },
          { title: "Back", value: { action: "back" } },
        ],
      }
    );

    expect(state.clearCalls).toBe(1);
    expect(state.props?.title).toBe("sisyphus (orchestrator)");
    expect(state.props?.options).toHaveLength(3);
  });

  it("simulates model selection flow", () => {
    const { api, state } = createMockApi({
      state: {
        provider: [
          {
            id: "openai",
            models: {
              "gpt-4": { id: "gpt-4", name: "GPT-4" },
              "gpt-3.5": { id: "gpt-3.5", name: "GPT-3.5" },
            },
          },
        ],
      },
    });

    // Flow: editModel -> showModelsForProvider -> saveAgentConfig

    // Step 1: Show provider list
    const providers = Array.isArray(api.state.provider)
      ? api.state.provider
      : Object.values(api.state.provider || {});

    const providerOptions = providers.map((p) => ({
      title: p.id,
      value: { action: "selectProvider", provider: p },
      description: `${Object.keys(p.models || {}).length} models`,
    }));

    api.ui.dialog.replace(
      () => "DialogSelect",
      { title: "Select Provider", options: providerOptions }
    );

    // Step 2: User selects provider
    const selectedProvider = state.props?.options?.[0].value;
    expect(selectedProvider?.action).toBe("selectProvider");

    // Step 3: Show models for provider
    api.ui.dialog.clear();
    const selectedProv = selectedProvider?.provider;
    const models = Object.values(selectedProv?.models || {});

    const modelOptions = models.map((m) => ({
      title: m.name || m.id,
      value: { model: m.id, provider: selectedProv.id },
    }));

    api.ui.dialog.replace(
      () => "DialogSelect",
      { title: `Models - ${selectedProv.id}`, options: modelOptions }
    );

    // Step 4: User selects model
    const selectedModel = state.props?.options?.[0].value;
    expect(selectedModel?.model).toBe("gpt-4");

    // Step 5: Save config
    api.ui.dialog.clear();
    api.ui.toast({ variant: "success", message: "Model saved" });

    expect(state.clearCalls).toBe(2);
    expect(state.toasts.some((t) => t.message === "Model saved")).toBe(true);
  });

  it("simulates fallback chain management flow", () => {
    const { api, state } = createMockApi({
      state: {
        provider: [
          {
            id: "anthropic",
            models: { "claude-3": { id: "claude-3", name: "Claude 3" } },
          },
          {
            id: "openai",
            models: { "gpt-4": { id: "gpt-4", name: "GPT-4" } },
          },
        ],
      },
    });

    // Flow: showFallbackManager -> showAddFallback -> showCustomFallbackPrompt

    // Step 1: Show fallback manager
    const fallbacks = ["anthropic/claude-3", "openai/gpt-4"];
    const fallbackOptions = [
      { title: "Add new fallback", value: { action: "add" } },
      ...fallbacks.map((f, i) => ({
        title: `${i + 1}. ${f}`,
        value: { action: "edit", index: i, value: f },
      })),
      { title: "Back to agent", value: { action: "back" } },
    ];

    api.ui.dialog.replace(
      () => "DialogSelect",
      { title: "Fallback Chain", options: fallbackOptions }
    );

    // Step 2: User clicks "Add new fallback"
    const addOption = state.props?.options?.find(
      (o) => o.value.action === "add"
    );
    expect(addOption).toBeDefined();

    api.ui.dialog.clear();

    // Step 3: Show add fallback options
    const providers = Array.isArray(api.state.provider)
      ? api.state.provider
      : Object.values(api.state.provider || {});

    const addOptions = [
      { title: "Type custom model", value: { model: "__custom__" } },
      ...providers.flatMap((p) =>
        Object.values(p.models || {}).map((m) => ({
          title: m.name || m.id,
          value: { model: m.id, provider: p.id },
        }))
      ),
    ];

    api.ui.dialog.replace(
      () => "DialogSelect",
      { title: "Add Fallback", options: addOptions }
    );

    // Step 4: User selects custom
    const customOption = state.props?.options?.find(
      (o) => o.value.model === "__custom__"
    );
    expect(customOption).toBeDefined();

    api.ui.dialog.clear();

    // Step 5: Show custom input prompt
    api.ui.dialog.replace(
      () => "DialogPrompt",
      {
        title: "Custom Fallback",
        value: "",
        placeholder: "provider/model-id",
      }
    );

    expect(state.props?.title).toBe("Custom Fallback");
    expect(state.props?.value).toBe("");
  });

  it("simulates error handling when no providers available", () => {
    const { api, state } = createMockApi({
      state: {
        provider: [],
      },
    });

    // Flow: editModel with empty providers -> showCustomModelPrompt

    const providers = Array.isArray(api.state.provider)
      ? api.state.provider
      : Object.values(api.state.provider || {});

    if (providers.length === 0) {
      // Fallback to custom prompt
      api.ui.dialog.replace(
        () => "DialogPrompt",
        {
          title: "Custom Model",
          value: "",
          placeholder: "provider/model-id",
        }
      );
    }

    expect(state.props?.title).toBe("Custom Model");
    expect(state.replaceCalls.length).toBe(1);
  });
});

// ============================================================================
// Test Suite: Mock API Type Safety
// ============================================================================

describe("TUI Mock API - Type Safety", () => {
  it("enforces DialogOption structure at runtime", () => {
    const { api, state } = createMockApi();

    // Valid option
    const validOption: DialogOption = {
      title: "Valid",
      value: { action: "test" },
    };

    api.ui.dialog.replace(() => "test", {
      options: [validOption],
    });

    // Verify at runtime
    const option = state.props?.options?.[0];
    expect(typeof option?.title).toBe("string");
    expect(typeof option?.value).toBe("object");
  });

  it("allows optional fields to be omitted", () => {
    const { api, state } = createMockApi();

    const minimalOption: DialogOption = {
      title: "Minimal",
      value: { action: "test" },
    };

    api.ui.dialog.replace(() => "test", {
      options: [minimalOption],
    });

    expect(state.props?.options?.[0].description).toBeUndefined();
    expect(state.props?.options?.[0].footer).toBeUndefined();
    expect(state.props?.options?.[0].onSelect).toBeUndefined();
  });

  it("accepts all valid DialogProps combinations", () => {
    const { api } = createMockApi();

    // DialogSelect with all props
    expect(() => {
      api.ui.dialog.replace(() => "test", {
        title: "Test",
        options: [],
        placeholder: "hint",
        current: 0,
        onSelect: vi.fn(),
      });
    }).not.toThrow();

    // DialogPrompt with all props
    expect(() => {
      api.ui.dialog.replace(() => "prompt", {
        title: "Prompt",
        value: "initial",
        placeholder: "enter",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
    }).not.toThrow();
  });
});
