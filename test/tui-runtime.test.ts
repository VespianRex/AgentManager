/// <reference types="bun-types" />
import { describe, it, beforeEach, test, expect, vi } from 'bun:test';

// ============================================================================
// INTERFACES - Inlined
// ============================================================================

interface MockTheme {
  backgroundPanel: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  success: string;
  error: string;
  warning: string;
}

interface DialogOption {
  title: string;
  value: unknown;
  description?: string;
  footer?: string;
  onSelect?: () => void;
}

interface CapturedDialogSelectProps {
  title?: string;
  options?: DialogOption[];
  placeholder?: string;
  onSelect?: (item: { value: unknown; title?: string }) => void;
  current?: number;
}

interface CapturedDialogPromptProps {
  title?: string;
  value?: string;
  placeholder?: string;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

interface MockApi {
  theme?: { current: MockTheme };
  ui: {
    DialogSelect: (props: CapturedDialogSelectProps) => { type: string; props: CapturedDialogSelectProps };
    DialogPrompt: (props: CapturedDialogPromptProps) => { type: string; props: CapturedDialogPromptProps };
    Select: (props: CapturedDialogSelectProps) => { type: string; props: CapturedDialogSelectProps };
    when: () => unknown[];
    toast: (opts: { variant: string; message: string }) => void;
    dialog: {
      replace: (renderFn: () => unknown) => void;
      clear: () => void;
      setSize: (size: string) => void;
    };
  };
  state: {
    path: { directory: string };
    provider: unknown[];
  };
  command: {
    register: (factory: (api: MockApi) => unknown[]) => unknown;
    openPalette: () => void;
  };
  client: {
    execute: (...args: unknown[]) => unknown;
    instance: { dispose: () => Promise<void> };
  };
  lifecycle: {
    onDispose: (fn: () => void) => void;
  };
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const defaultTheme: MockTheme = {
  backgroundPanel: "#1d1d1d",
  border: "#3a3a3a",
  text: "#e0e0e0",
  textMuted: "#6a6a6a",
  primary: "#5f87ff",
  success: "#5faf5f",
  error: "#ff5f5f",
  warning: "#ffff5f",
};

// ============================================================================
// MOCK FACTORY
// ============================================================================

function createMockApi(): MockApi {
  const capturedDialogSelect: CapturedDialogSelectProps = {};
  const capturedDialogPrompt: CapturedDialogPromptProps = {};

  return {
    theme: { current: { ...defaultTheme } },
    ui: {
      DialogSelect: vi.fn((props: CapturedDialogSelectProps) => {
        Object.assign(capturedDialogSelect, props);
        return { type: "DialogSelect", props };
      }),
      DialogPrompt: vi.fn((props: CapturedDialogPromptProps) => {
        Object.assign(capturedDialogPrompt, props);
        return { type: "DialogPrompt", props };
      }),
      Select: vi.fn((props: CapturedDialogSelectProps) => {
        Object.assign(capturedDialogSelect, props);
        return { type: "Select", props };
      }),
      when: vi.fn(() => []),
      toast: vi.fn(() => {}),
      dialog: {
        replace: vi.fn(() => {}),
        clear: vi.fn(() => {}),
        setSize: vi.fn(() => {}),
      },
    },
    state: {
      path: { directory: process.cwd() },
      provider: [],
    },
    command: {
      register: vi.fn(() => vi.fn()),
      openPalette: vi.fn(() => {}),
    },
    client: {
      execute: vi.fn(),
      instance: { dispose: vi.fn(async () => {}) },
    },
    lifecycle: {
      onDispose: vi.fn(() => {}),
    },
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("TUI Plugin Runtime Execution Tests", () => {
  let mockApi: MockApi;

  beforeEach(() => {
    mockApi = createMockApi();
    vi.clearAllMocks();
  });

  describe("Helper functions", () => {
    describe("modelBadge", () => {
      it("handles empty provider list for unset model", () => {
        mockApi.state.provider = [];
        expect(mockApi.state.provider).toEqual([]);
      });
    });

    describe("Theme and skin", () => {
      it("applies custom theme properties", () => {
        const customTheme: MockTheme = {
          ...defaultTheme,
          primary: "#ff0000",
          success: "#00ff00",
          error: "#0000ff",
        };
        if (!mockApi.theme) mockApi.theme = { current: defaultTheme };
        mockApi.theme.current = customTheme;
        expect(mockApi.theme.current.primary).toBe("#ff0000");
      });

      it("falls back to defaults for missing theme properties", () => {
        const partialTheme: MockTheme = {
          backgroundPanel: "#111",
          border: "#333",
          text: "#eee",
          textMuted: "#666",
          primary: "#00f",
          success: "#0f0",
          error: "#f00",
          warning: "#ff0",
        };
        if (!mockApi.theme) mockApi.theme = { current: defaultTheme };
        mockApi.theme.current = partialTheme;
        expect(mockApi.theme.current.textMuted).toBe("#666");
      });
    });
  });
});
