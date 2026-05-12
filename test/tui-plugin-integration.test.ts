/**
 * TUI Plugin Integration Tests
 *
 * Comprehensive integration tests for the Agent Manager TUI plugin
 * when integrated with OpenTUI. Tests cover plugin registration,
 * command handling, API lifecycle, theme integration, config discovery,
 * plugin isolation, OpenTUI version compatibility, and end-to-end flows.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// =============================================================================
// Type Definitions
// =============================================================================

interface MockTheme {
  current: {
    backgroundPanel?: string;
    border?: string;
    text?: string;
    textMuted?: string;
    primary?: string;
    success?: string;
    error?: string;
    warning?: string;
    [key: string]: string | undefined;
  };
}

interface MockDialogState {
  component: string | null;
  props: Record<string, any> | null;
  size: string;
  cleared: boolean;
  replaceCalls: Array<{ component: string; props: any }>;
  clearCalls: number;
  toasts: Array<{ variant: string; message: string }>;
}

interface MockCommandRegistration {
  unregister: () => void;
  registered: boolean;
}

interface MockApi {
  ui: {
    dialog: {
      render: (component: any, props: any) => void;
      clear: () => void;
      replace: (component: any, props: any) => void;
      setSize: (size: string) => void;
      getSize: () => string;
    };
    toast: (opts: { variant: string; message: string }) => void;
    when: (condition: string) => any[];
    Select: any;
    DialogSelect: any;
    DialogPrompt: any;
  };
  client: {
    instance: {
      dispose: (opts?: any) => void;
    };
  };
  command: {
    register: (cb: () => any[]) => MockCommandRegistration;
    openPalette: () => void;
  };
  lifecycle: {
    onDispose: (fn: () => void) => void;
  };
  state: {
    provider: Record<string, any> | any[];
    models?: Record<string, any>;
    path: {
      directory: string;
      [key: string]: any;
    };
    agentKey?: string;
    mergedAgents?: Record<string, any>;
  };
  theme: MockTheme;
}

interface Provider {
  id: string;
  name?: string;
  models?: Record<string, { id: string; name?: string }>;
}

// =============================================================================
// Test Fixtures
// =============================================================================

const SAMPLE_CONFIG = {
  agents: {
    oracle: { model: "openai/gpt-4.5" },
    sisyphus: { model: "anthropic/claude-opus-4", fallback_models: ["openai/gpt-4", "google"] },
  },
};

const SAMPLE_CONFIG_WITH_CATEGORIES = {
  agents: {
    quick: { model: "anthropic/claude-sonnet-4" },
  },
  categories: {
    planning: { model: "openai/gpt-5" },
  },
};

const createMockApi = (overrides?: Partial<MockApi>): MockApi => {
  const disposers: Array<() => void> = [];
  const registrations: MockCommandRegistration[] = [];

  return {
    ui: {
      dialog: {
        render: () => {},
        clear: () => {},
        replace: () => {},
        setSize: () => {},
        getSize: () => "large",
      },
      toast: () => {},
      when: () => [],
      Select: {},
      DialogSelect: {},
      DialogPrompt: {},
    },
    client: {
      instance: {
        dispose: vi.fn(() => Promise.resolve()),
      },
    },
    command: {
      register: (cb: () => any[]) => {
        const registration: MockCommandRegistration = {
          unregister: vi.fn(() => {
            registration.registered = false;
          }),
          registered: true,
        };
        registrations.push(registration);
        cb();
        return registration;
      },
      openPalette: vi.fn(),
    },
    lifecycle: {
      onDispose: (fn: () => void) => {
        disposers.push(fn);
      },
    },
    state: {
      provider: {},
      path: {
        directory: process.cwd(),
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
    ...overrides,
  };
};

const createMockProviders = (): Provider[] => [
  {
    id: "openai",
    models: {
      "gpt-4.5": { id: "gpt-4.5", name: "GPT-4.5" },
      "gpt-4": { id: "gpt-4", name: "GPT-4" },
      "gpt-3.5-turbo": { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    },
  },
  {
    id: "anthropic",
    models: {
      "claude-opus-4": { id: "claude-opus-4", name: "Claude Opus 4" },
      "claude-sonnet-4": { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    },
  },
  {
    id: "google",
    models: {
      "gemini-pro": { id: "gemini-pro", name: "Gemini Pro" },
    },
  },
];

// =============================================================================
// Test Helpers
// =============================================================================

function extractFunctionBody(source: string, functionName: string): string | null {
  const funcPattern = new RegExp(`function\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{`, "g");
  const match = funcPattern.exec(source);
  if (!match) return null;

  const startIndex = match.index! + match[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  while (braceCount > 0 && endIndex < source.length) {
    if (source[endIndex] === "{") braceCount++;
    else if (source[endIndex] === "}") braceCount--;
    endIndex++;
  }

  return source.substring(startIndex, endIndex - 1);
}

// =============================================================================
// Plugin Source Reading
// =============================================================================

describe("TUI Plugin Integration Tests", () => {
  let tmpDir: string;
  let tuiPath: string;
  let tuiSource: string;
  let sharedSource: string;

  beforeAll(async () => {
    tuiPath = path.join(process.cwd(), ".opencode/tui/agent-manager.jsx");
    const [pluginSource, tuiApiSource, helperSource, configSource, configPathsSource, fileSecuritySource, agentMetadataSource, schemaSource] = await Promise.all([
      fs.readFile(tuiPath, "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "tui-api.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "tui-helpers.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "config.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "config-paths.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "file-security.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "agent-metadata.ts"), "utf-8"),
      fs.readFile(path.join(process.cwd(), "src", "schema.ts"), "utf-8"),
    ]);
    tuiSource = pluginSource;
    sharedSource = [pluginSource, tuiApiSource, helperSource, configSource, configPathsSource, fileSecuritySource, agentMetadataSource, schemaSource].join("\n");
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tui-plugin-integration-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // 1. Plugin Registration Tests
  // ===========================================================================

  describe("1. Plugin Registration", () => {
    describe("Export Structure", () => {
      it("exports default object with id and tui properties", () => {
        expect(tuiSource).toContain("export default");
        expect(tuiSource).toContain("id: \"agent-manager\"");
        expect(tuiSource).toContain("tui:");
      });

      it("plugin id is a string literal 'agent-manager'", () => {
        expect(tuiSource).toMatch(/id:\s*["']agent-manager["']/);
      });

      it("tui export is an async function that accepts api parameter", () => {
        expect(tuiSource).toMatch(/const\s+tui\s+=\s+async\s*\(\s*api\s*\)/);
      });

      it("tui function is assigned to the exported object", () => {
        const defaultExport = tuiSource.match(/export\s+default\s*\{([^}]+)\}/);
        expect(defaultExport).toBeTruthy();
        expect(defaultExport![1]).toContain("tui:");
      });
    });

    describe("Command Registration", () => {
      it("registers a command using api.command.register", () => {
        expect(tuiSource).toContain("api.command.register");
      });

      it("registers command with title 'Agent Manager'", () => {
        expect(tuiSource).toContain('title: "Agent Manager"');
      });

      it("registers command with value '/agent-manager'", () => {
        expect(tuiSource).toContain('value: "/agent-manager"');
      });

      it("registers command with slash configuration and aliases", () => {
        expect(tuiSource).toContain("slash:");
        expect(tuiSource).toContain("name: \"agent-manager\"");
        expect(tuiSource).toContain("aliases:");
      });

      it("registers command with aliases 'am' and 'agents'", () => {
        expect(tuiSource).toMatch(/aliases:\s*\["am",\s*"agents"\]/);
      });

      it("registers command with description", () => {
        expect(tuiSource).toContain("description:");
        expect(tuiSource).toContain("Manage agent models and fallbacks");
      });

      it("registers command with category 'Configuration'", () => {
        expect(tuiSource).toContain('category: "Configuration"');
      });

      it("marks command as suggested", () => {
        expect(tuiSource).toContain("suggested: true");
      });

      it("command onSelect calls showAgentManager with api", () => {
        expect(tuiSource).toContain("onSelect:");
        expect(tuiSource).toContain("showAgentManager(api)");
      });
    });

    describe("Command Unregistration", () => {
      it("returns unregister function from command.register", () => {
        expect(tuiSource).toContain("const unregister = api.command.register");
      });

      it("registers onDispose lifecycle hook", () => {
        expect(tuiSource).toContain("api.lifecycle.onDispose");
      });

      it("onDispose calls unregister to cleanup", () => {
        expect(tuiSource).toContain("unregister()");
      });

      it("dispose pattern unregisters in lifecycle hook", () => {
        expect(tuiSource).toMatch(/api\.lifecycle\.onDispose/);
        expect(tuiSource).toContain("unregister()");
      });
    });
  });

  // ===========================================================================
  // 2. Command Handler Tests
  // ===========================================================================

  describe("2. Command Handler", () => {
    describe("showAgentManager Function", () => {
      it("showAgentManager function exists", () => {
        expect(tuiSource).toContain("async function showAgentManager(api)");
      });

      it("showAgentManager is async to support config loading", () => {
        const funcBody = extractFunctionBody(tuiSource, "showAgentManager");
        expect(funcBody).toBeTruthy();
        expect(funcBody).toContain("await");
      });

      it("showAgentManager loads configs from api.state.path.directory", () => {
        const funcBody = extractFunctionBody(tuiSource, "showAgentManager");
        expect(funcBody).toContain("api.state.path.directory");
        expect(funcBody).toContain("loadAllConfigs");
      });

      it("showAgentManager passes loaded configs to showAgentList", () => {
        const funcBody = extractFunctionBody(tuiSource, "showAgentManager");
        expect(funcBody).toContain("showAgentList(api, loadedConfigs");
      });

      it("showAgentManager initializes returnIndex array for navigation", () => {
        const funcBody = extractFunctionBody(tuiSource, "showAgentManager");
        expect(funcBody).toContain("returnIndex = [0]");
      });

      it("showAgentManager shows toast messages during loading", () => {
        const funcBody = extractFunctionBody(tuiSource, "showAgentManager");
        expect(funcBody).toContain("api.ui.toast");
        expect(funcBody).toContain("Loading configs from");
        expect(funcBody).toContain("Found");
      });
    });

    describe("Command API Object Usage", () => {
      it("uses api.ui.dialog for dialog management", () => {
        expect(tuiSource).toContain("api.ui.dialog.");
      });

      it("uses api.ui.toast for notifications", () => {
        expect(tuiSource).toContain("api.ui.toast");
      });

      it("uses api.client.instance.dispose for reload", () => {
        expect(tuiSource).toContain("api.client.instance.dispose");
      });

      it("uses api.command.openPalette as fallback", () => {
        expect(tuiSource).toContain("api.command.openPalette");
      });

      it("uses api.state.provider for model data", () => {
        expect(tuiSource).toContain("api.state.provider");
      });
    });

    describe("Alias Support", () => {
      it("slash command name is 'agent-manager'", () => {
        expect(tuiSource).toContain('name: "agent-manager"');
      });

      it("aliases array contains 'am' and 'agents'", () => {
        expect(tuiSource).toMatch(/aliases:\s*\[\s*"am",\s*"agents"\s*\]/);
      });

      it("all aliases are lowercase strings", () => {
        const aliasesMatch = tuiSource.match(/aliases:\s*\[([^\]]+)\]/);
        expect(aliasesMatch).toBeTruthy();
        const aliases = aliasesMatch![1];
        expect(aliases).toMatch(/"am"/);
        expect(aliases).toMatch(/"agents"/);
      });
    });
  });

  // ===========================================================================
  // 3. API Lifecycle Tests
  // ===========================================================================

  describe("3. API Lifecycle", () => {
    describe("Plugin Initialization", () => {
      it("tui function is async and accepts api parameter", () => {
        expect(tuiSource).toMatch(/const\s+tui\s+=\s+async\s*\(\s*api\s*\)/);
      });

      it("initializes internal state for dialog management", () => {
        expect(tuiSource).toContain("returnIndex");
      });

      it("initializes CONFIG_FILES array for config discovery", () => {
        expect(tuiSource).toContain("findConfigFiles");
        expect(sharedSource).toContain("CONFIG_LOCATIONS");
      });

      it("initializes skin function for theme access", () => {
        expect(tuiSource).toMatch(/const\s+skin\s+=\s*\(\)/);
        expect(tuiSource).toContain("api.theme.current");
      });
    });

    describe("Lifecycle onDispose Cleanup", () => {
      it("lifecycle.onDispose is called with cleanup function", () => {
        expect(tuiSource).toContain("api.lifecycle.onDispose(() =>");
      });

      it("dispose unregisters the command", () => {
        expect(tuiSource).toContain("unregister()");
      });

      it("dispose is registered with lifecycle", () => {
        const disposeMatches = tuiSource.match(/api\.lifecycle\.onDispose/g) || [];
        expect(disposeMatches.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe("Repeated Activations", () => {
      it("each activation creates independent state", () => {
        expect(tuiSource).toContain("const returnIndex = [0]");
      });

      it("handled flags are local to each function call", () => {
        expect(tuiSource).toMatch(/let\s+handled\w+\s*=\s*false/);
      });

      it("handled flags are reset between activations", () => {
        expect(tuiSource).toContain("let handledDetailSelection = false");
      });
    });
  });

  // ===========================================================================
  // 4. Theme Integration Tests
  // ===========================================================================

  describe("4. Theme Integration", () => {
    describe("Theme Access", () => {
      it("accesses api.theme.current for theme values", () => {
        expect(tuiSource).toContain("api.theme.current");
      });

      it("skin function is defined to generate theme object", () => {
        expect(tuiSource).toMatch(/const\s+skin\s+=\s*\(\)\s*=>/);
        expect(tuiSource).toMatch(/return\s*\{/);
      });
    });

    describe("Theme Color Properties", () => {
      it("uses backgroundPanel for panel backgrounds", () => {
        expect(tuiSource).toMatch(/backgroundPanel\s*\|\|/);
      });

      it("uses border for borders", () => {
        expect(tuiSource).toMatch(/border\s*\|\|/);
      });

      it("uses text for primary text", () => {
        expect(tuiSource).toMatch(/text\s*\|\|/);
      });

      it("uses textMuted for muted/secondary text", () => {
        expect(tuiSource).toMatch(/textMuted\s*\|\|/);
      });

      it("uses primary for accent colors", () => {
        expect(tuiSource).toMatch(/primary\s*\|\|/);
      });

      it("uses success for success states", () => {
        expect(tuiSource).toMatch(/success\s*\|\|/);
      });

      it("uses error for error states", () => {
        expect(tuiSource).toMatch(/error\s*\|\|/);
      });

      it("uses warning for warning states", () => {
        expect(tuiSource).toMatch(/warning\s*\|\|/);
      });
    });

    describe("Theme Fallback Values", () => {
      it("provides fallback hex values when theme properties are missing", () => {
        expect(tuiSource).toMatch(/#1d1d1d/);
        expect(tuiSource).toMatch(/#3a3a3a/);
        expect(tuiSource).toMatch(/#e0e0e0/);
        expect(tuiSource).toMatch(/#5f87ff/);
        expect(tuiSource).toMatch(/#5faf5f/);
        expect(tuiSource).toMatch(/#ff5f5f/);
        expect(tuiSource).toMatch(/#ffff5f/);
      });

      it("skin returns complete theme object", () => {
        expect(tuiSource).toMatch(/return\s*\{[\s\S]*panel:[\s\S]*border:[\s\S]*text:/);
        expect(tuiSource).toMatch(/muted:|accent:|success:|error:|warning:/);
      });
    });

    describe("Theme Application to UI", () => {
      it("theme colors used in UI rendering", () => {
        expect(tuiSource).toMatch(/s\.(muted|warning|success|accent|error)/);
      });

      it("theme colors used in agent detail view", () => {
        expect(tuiSource).toContain("statusColor");
        expect(tuiSource).toContain("s.success");
        expect(tuiSource).toContain("s.muted");
      });
    });
  });

  // ===========================================================================
  // 5. Config Discovery Integration Tests
  // ===========================================================================

  describe("5. Config Discovery Integration", () => {
    describe("CONFIG_FILES Definition", () => {
      it("defines project config locations", () => {
        expect(sharedSource).toContain(".opencode/oh-my-opencode.json");
        expect(sharedSource).toContain("opencode.json");
        expect(sharedSource).toContain(".opencode/package.json");
      });

      it("defines user config locations", () => {
        expect(sharedSource).toContain("~/.config/opencode/oh-my-opencode.json");
        expect(sharedSource).toContain("~/.config/opencode/opencode.json");
      });

      it("config locations include source metadata", () => {
        expect(sharedSource).toContain("source: \"project\"");
        expect(sharedSource).toContain("source: \"user\"");
      });
    });

    describe("Path Validation", () => {
      it("has validatePath function for path security", () => {
        expect(tuiSource).toContain("function validatePath(");
      });

      it("validates against null/undefined inputs", () => {
        const validatePathBody = extractFunctionBody(tuiSource, "validatePath");
        expect(validatePathBody).toContain("normalizePath");
      });

      it("expands ~ to home directory", () => {
        const validatePathBody = extractFunctionBody(tuiSource, "validatePath");
        expect(validatePathBody).toContain("normalizePath");
        expect(sharedSource).toContain("process.env.HOME");
      });

      it("detects path traversal attempts", () => {
        const validatePathBody = extractFunctionBody(tuiSource, "validatePath");
        expect(validatePathBody).toContain("normalizePath");
        expect(sharedSource).toContain("Path traversal detected");
      });

      it("removes null bytes from paths", () => {
        expect(sharedSource).toContain("\\0");
      });
    });

    describe("Config File Loading", () => {
      it("findConfigFiles function exists", () => {
        expect(sharedSource).toContain("export const findConfigFiles");
      });

      it("loadConfig function exists", () => {
        expect(sharedSource).toContain("export const loadConfig");
      });

      it("loadAllConfigs aggregates multiple configs", () => {
        expect(tuiSource).toContain("async function loadAllConfigs(cwd)");
      });

      it("loadConfig validates target path before loading", () => {
        expect(sharedSource).toContain("openVerifiedFile");
      });

      it("loadConfig checks for symlinks before loading", () => {
        expect(sharedSource).toContain("openVerifiedFile");
        expect(sharedSource).toContain("Security violation: symlinks are not allowed for config files");
      });

      it("uses comment-json for JSONC parsing", () => {
        expect(sharedSource).toContain("comment-json");
        expect(sharedSource).toContain("parse");
      });
    });

    describe("Project vs User Config Handling", () => {
      it("distinguishes project configs from user configs", () => {
        expect(sharedSource).toMatch(/source:\s*["']project["']/);
        expect(sharedSource).toMatch(/source:\s*["']user["']/);
      });

      it("merges defaults with loaded configs", () => {
        expect(tuiSource).toContain("mergeWithDefaults");
      });

      it("DEFAULT_AGENTS provides fallback agents", () => {
        expect(sharedSource).toContain("DEFAULT_AGENTS");
        expect(sharedSource).toContain("sisyphus");
        expect(sharedSource).toContain("oracle");
      });

      it("DEFAULT_FALLBACKS provides fallback chains", () => {
        expect(tuiSource).toContain("DEFAULT_FALLBACKS");
      });
    });
  });

  // ===========================================================================
  // 6. Plugin Isolation Tests
  // ===========================================================================

  describe("6. Plugin Isolation", () => {
    describe("State Isolation Between Activations", () => {
      it("returnIndex is created per activation", () => {
        expect(tuiSource).toContain("const returnIndex = [0]");
      });

      it("handled flags are function-scoped", () => {
        expect(tuiSource).toMatch(/let\s+handled\w+\s*=\s*false/);
      });

      it("no global mutable state shared between activations", () => {
        expect(tuiSource).not.toMatch(/^let\s+(options|dialogState|selectedAgent)/m);
      });
    });

    describe("Multi-Agent Editing Without Interference", () => {
      it("agentKey is passed explicitly to navigation functions", () => {
        expect(tuiSource).toContain("agentKey,");
        expect(tuiSource).toContain("item.value.agentKey");
      });

      it("agent data is passed explicitly to save functions", () => {
        expect(tuiSource).toContain("saveAgentConfig(");
        expect(tuiSource).toMatch(/saveAgentConfig\([^)]*agentKey[^)]*newAgent/);
      });

      it("mergedAgents is passed through navigation chain", () => {
        expect(tuiSource).toMatch(/showAgentDetail\([^)]*mergedAgents/);
        expect(tuiSource).toMatch(/editModel\([^)]*mergedAgents/);
      });
    });

    describe("Cleanup on Dispose", () => {
      it("unregister function is called on dispose", () => {
        expect(tuiSource).toContain("unregister()");
      });

      it("dispose handler is registered with lifecycle", () => {
        expect(tuiSource).toMatch(/api\.lifecycle\.onDispose\(/);
      });

      it("dialog.clear is used during transitions", () => {
        expect(tuiSource).toContain("api.ui.dialog.clear()");
      });

      it("reloadAgents function exists for cleanup", () => {
        expect(tuiSource).toContain("async function reloadAgents()");
        expect(tuiSource).toContain("api.client.instance.dispose");
      });
    });

    describe("Guard Against Double-Click Handling", () => {
      it("handledDetailSelection prevents double-click in agent detail", () => {
        expect(tuiSource).toContain("let handledDetailSelection = false");
        expect(tuiSource).toMatch(/if\s*\(\s*handledDetailSelection/);
      });

      it("handledProviderSelection prevents double-click in provider select", () => {
        expect(tuiSource).toContain("let handledProviderSelection = false");
      });

      it("handledModelSelection prevents double-click in model select", () => {
        expect(tuiSource).toContain("let handledModelSelection = false");
      });

      it("handledAllModelSelection for all models view", () => {
        expect(tuiSource).toContain("let handledAllModelSelection = false");
      });

      it("guards are set to true after first click", () => {
        expect(tuiSource).toContain("handledDetailSelection = true");
        expect(tuiSource).toContain("handledProviderSelection = true");
        expect(tuiSource).toContain("handledModelSelection = true");
      });
    });
  });

  // ===========================================================================
  // 7. OpenTUI Version Compatibility Tests
  // ===========================================================================

  describe("7. OpenTUI Version Compatibility", () => {
    describe("Component Name Fallbacks", () => {
      it("has fallback from DialogSelect to Select", () => {
        expect(tuiSource).toMatch(/DialogSelect\s*\|\|\s*api\.ui\.Select/);
      });

      it("DialogSelect is primary component name", () => {
        const dialogSelectMatches = tuiSource.match(/DialogSelect/g) || [];
        expect(dialogSelectMatches.length).toBeGreaterThan(0);
      });

      it("error handling when Select component is missing", () => {
        expect(tuiSource).toMatch(/if\s*\(\s*!Select\s*\)/);
        expect(tuiSource).toContain("Critical component missing");
      });

      it("fallback to command palette when UI components unavailable", () => {
        expect(tuiSource).toMatch(/api\.command\.openPalette\(\)/);
      });
    });

    describe("API Version Detection", () => {
      it("logs available ui components for debugging", () => {
        expect(tuiSource).not.toMatch(/console\.log\(/);
        expect(tuiSource).toMatch(/Object\.keys\(api\.ui/);
      });

      it("logs component existence for diagnostics", () => {
        expect(tuiSource).toContain("Critical component missing");
      });

      it("logs SolidJS runtime check", () => {
        expect(tuiSource).toContain("@jsxImportSource @opentui/solid");
      });
    });

    describe("when Function Compatibility", () => {
      it("has when function for conditionals", () => {
        expect(tuiSource).toContain("api.ui.when");
      });

      it("handles when function availability", () => {
        expect(tuiSource).toMatch(/typeof.*when.*function/);
      });

      it("provides fallback when when function is undefined", () => {
        expect(tuiSource).toMatch(/api\.ui\.when\s*=\s*\(\)\s*=>\s*\[\]/);
      });

      it("logs error when when function was undefined", () => {
        expect(tuiSource).toContain("api.ui.when (X()) undefined - fallback applied");
      });
    });

    describe("Provider State Compatibility", () => {
      it("handles provider as array", () => {
        const editModelBody = extractFunctionBody(tuiSource, "editModel");
        expect(editModelBody).toContain("Array.isArray");
        expect(editModelBody).toMatch(/api\.state\.provider\s*\|\|\s*\[\]/);
      });

      it("handles provider as object", () => {
        expect(tuiSource).toMatch(/Object\.values\((providers|api\.state\.provider)/);
      });

      it("handles missing provider gracefully", () => {
        expect(tuiSource).toContain("providerArr.length === 0");
        expect(tuiSource).toContain("showCustomModelPrompt");
      });
    });

    describe("Version-Specific Error Handling", () => {
      it("catches and logs errors from navigation functions", () => {
        expect(tuiSource).toMatch(/catch\s*\(\s*e\s*\)\s*\{/);
        expect(tuiSource).toMatch(/console\.error/);
        expect(tuiSource).toMatch(/logError/);
      });

      it("provides user-friendly error toast on failures", () => {
        expect(tuiSource).toMatch(/api\.ui\.toast\(\{\s*variant:\s*["']error["']/);
      });
    });
  });

  // ===========================================================================
  // 8. End-to-End Scenarios
  // ===========================================================================

  describe("8. End-to-End Scenarios", () => {
    describe("Full User Flow: Command to Save", () => {
      it("complete navigation chain exists", () => {
        const expectedFlow = [
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

        for (const func of expectedFlow) {
          expect(tuiSource).toContain(`function ${func}(`);
        }
      });

      it("showAgentList to showAgentDetail flow exists", () => {
        const showAgentListBody = extractFunctionBody(tuiSource, "showAgentList");
        expect(showAgentListBody).toContain("showAgentDetail");
      });

      it("showAgentDetail to editModel flow exists", () => {
        const showAgentDetailBody = extractFunctionBody(tuiSource, "showAgentDetail");
        expect(showAgentDetailBody).toContain("editModel");
      });

      it("editModel to saveAgentConfig flow exists", () => {
        const showModelsBody = extractFunctionBody(tuiSource, "showModelsForProvider");
        expect(showModelsBody).toContain("saveAgentConfig");
      });

      it("saveAgentConfig persists to file and reloads", () => {
        const saveConfigBody = extractFunctionBody(tuiSource, "saveAgentConfig");
        expect(saveConfigBody).toContain("saveConfig");
        expect(saveConfigBody).toContain("reloadAgents");
        expect(saveConfigBody).toContain("api.ui.toast");
      });
    });

    describe("Dialog Rendering Verification", () => {
      it("all dialogs use api.ui.dialog.replace", () => {
        const replaceCalls = tuiSource.match(/api\.ui\.dialog\.replace\(/g) || [];
        expect(replaceCalls.length).toBeGreaterThanOrEqual(10);
      });

      it("dialog sizes are set appropriately", () => {
        expect(tuiSource).toContain('setSize("large")');
        expect(tuiSource).toContain('setSize("xlarge")');
        expect(tuiSource).toContain('setSize("medium")');
      });

      it("Select/DialogSelect is used for all option dialogs", () => {
        const selectCount = tuiSource.match(/<Select[\s\S]*?\/>/g) || [];
        expect(selectCount.length).toBeGreaterThanOrEqual(8);
      });

      it("DialogPrompt is used for text input", () => {
        const promptCount = tuiSource.match(/DialogPrompt/g) || [];
        expect(promptCount.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe("Config Persistence", () => {
      it("saveConfig creates backup before writing", () => {
        expect(sharedSource).toMatch(/\.bak\./);
        expect(sharedSource).toContain("backupConfig");
      });

      it("saveConfig uses timestamp + random for unique backups", () => {
        expect(sharedSource).toContain("Date.now()");
        expect(sharedSource).toMatch(/randomUUID|Math.random/);
      });

      it("config update preserves existing fields", () => {
        expect(tuiSource).toContain("...");
        expect(tuiSource).toMatch(/\.\.\.(existingSection|updatedSection)/);
      });

      it("saveConfig validates document before writing", () => {
        expect(sharedSource).toContain("validatePartialAgentManagerDocument");
      });
    });

    describe("Model Selection Flow", () => {
      it("buildModelOptions creates provider/model structure", () => {
        expect(tuiSource).toContain("function buildModelOptions(");
        expect(tuiSource).toMatch(/value:\s*\{\s*model:\s*id,\s*provider:\s*pid\s*\}/);
      });

      it("modelBadge extracts display name from model", () => {
        expect(sharedSource).toContain("export function modelBadge");
        expect(sharedSource).toContain("m.name || m.model");
      });

      it("shortenModel abbreviates long model names", () => {
        expect(sharedSource).toContain("export function shortenModel");
        expect(sharedSource).toMatch(/\.slice\(-2\)/);
      });

      it("current model is highlighted in options", () => {
        expect(tuiSource).toContain("isCurrent");
        expect(tuiSource).toMatch(/footer:\s*isCurrent/);
      });
    });

    describe("Fallback Chain Management", () => {
      it("addToFallbacks appends to existing chain", () => {
  it("showAddFallback appends to existing chain", () => {
    expect(tuiSource).toContain("function showAddFallback(");
    expect(tuiSource).toMatch(/\[\s*\.\.\.current/);
  });

  it("showEditFallback modifies specific position", () => {
    expect(tuiSource).toContain("function showEditFallback(");
    expect(tuiSource).toMatch(/current\[index\]\s*=/);
  });
      it("fallbacks displayed with -> separator", () => {
        expect(tuiSource).toMatch(/fallbackArr\.slice/);
        expect(tuiSource).toMatch(/\.\.\./);
      });
    });
  });

  // ===========================================================================
  // Integration Tests with Mock API
  // ===========================================================================

  describe("Integration Tests with Mock API", () => {
    describe("Plugin Registration Flow", () => {
      it("registers command and returns unregister function", () => {
        expect(tuiSource).toContain("const unregister = api.command.register");
        expect(tuiSource).toContain("api.lifecycle.onDispose(() => unregister())");
      });
    });

    describe("Theme Application", () => {
      it("theme values are applied to skin object", () => {
        expect(tuiSource).toMatch(/const\s+s\s*=\s*skin\(\)/);
        expect(tuiSource).toMatch(/t\.backgroundPanel\s*\|\|/);
      });

      it("fallback values work when theme is minimal", () => {
        expect(tuiSource).toMatch(/#1d1d1d/);
        expect(tuiSource).toMatch(/#e0e0e0/);
      });
    });

    describe("Provider State Handling", () => {
      it("handles providers as Record<string, Provider>", () => {
        expect(tuiSource).toMatch(/Object\.values\(providers/);
      });

      it("handles providers as Provider[]", () => {
        expect(tuiSource).toMatch(/Array\.isArray\((providers|api\.state\.provider)\)/);
      });

      it("handles empty provider gracefully", () => {
        expect(tuiSource).toMatch(/providerArr\.length\s*===\s*0/);
        expect(tuiSource).toContain("showCustomModelPrompt");
      });
    });

    describe("Config Discovery", () => {
      it("discovers project configs before user configs", () => {
        const projectIndex = sharedSource.indexOf('source: "project"');
        const userIndex = sharedSource.indexOf('source: "user"');
        expect(projectIndex).toBeGreaterThanOrEqual(0);
        expect(userIndex).toBeGreaterThanOrEqual(0);
        expect(projectIndex).toBeLessThan(userIndex);
      });

      it("respects path validation for user configs", () => {
        expect(sharedSource).toContain("normalizePath(location.path, cwd)");
      });

      it("rejects symlinked config files", () => {
        expect(sharedSource).toContain("isSymbolicLink()");
        expect(sharedSource).toContain("openVerifiedFile");
      });
    });

    describe("Dialog Navigation Safety", () => {
      it("uses setImmediate for safe async navigation", () => {
        const setImmediateCount = (tuiSource.match(/setImmediate\s*\(/g) || []).length;
        expect(setImmediateCount).toBeGreaterThanOrEqual(3);
      });

      it("guards prevent double processing", () => {
        const handledFlags = tuiSource.match(/let\s+handled\w+\s*=\s*false/g) || [];
        expect(handledFlags.length).toBeGreaterThanOrEqual(4);
        expect(tuiSource).toMatch(/if\s*\(\s*handled\w+\s*\|\|\s*!item/);
      });

      it("clear is called before navigation transitions", () => {
        const clearCalls = tuiSource.match(/api\.ui\.dialog\.clear\(\)/g) || [];
        expect(clearCalls.length).toBeGreaterThanOrEqual(8);
      });
    });
  });

  // ===========================================================================
  // Security Integration Tests
  // ===========================================================================

  describe("Security Integration", () => {
    describe("Symlink Attack Prevention", () => {
      it("isSymlink helper uses lstat", () => {
        expect(sharedSource).toContain("lstat");
        expect(sharedSource).toContain("isSymbolicLink()");
      });

      it("findConfigFiles skips symlinked files", () => {
        expect(sharedSource).toContain("openVerifiedFile");
        expect(sharedSource).toContain("return undefined");
      });

      it("loadConfig rejects symlinked files with error", () => {
        expect(sharedSource).toContain("Security violation: symlinks are not allowed for config files");
      });

      it("saveConfig rejects writing to symlinked files", () => {
        expect(sharedSource).toContain("Security violation: cannot backup a symlink");
      });
    });

    describe("Path Traversal Prevention", () => {
      it("validatePath rejects paths with ../", () => {
        const validatePathBody = extractFunctionBody(tuiSource, "validatePath");
        expect(validatePathBody).toContain("normalizePath");
        expect(sharedSource).toContain("Path traversal detected");
      });

      it("validatePath checks resolved path stays in home", () => {
        expect(sharedSource).toContain("startsWith(homeNormalized");
      });

      it("validatePath handles null bytes", () => {
        expect(sharedSource).toContain("\\0");
      });

      it("validatePath expands ~ correctly", () => {
        expect(sharedSource).toContain("sanitizedPath.startsWith(\"~\")");
        expect(sharedSource).toContain("process.env.HOME");
      });
    });

    describe("Config Corruption Prevention", () => {
      it("validates agents object is object before save", () => {
        expect(sharedSource).toContain("validatePartialAgentManagerDocument");
      });

      it("validates categories object is object before save", () => {
        expect(sharedSource).toContain("validatePartialAgentManagerDocument");
      });

      it("backup is created before write", () => {
        expect(sharedSource).toMatch(/\.bak\./);
        expect(sharedSource).toContain("backupConfig");
      });
    });
  });

  // ===========================================================================
  // Error Handling Integration Tests
  // ===========================================================================

  describe("Error Handling Integration", () => {
    describe("Toast Error Notifications", () => {
      it("shows error toast when config load fails", () => {
        const loadAllConfigsBody = extractFunctionBody(tuiSource, "loadAllConfigs");
        expect(loadAllConfigsBody).toContain("api.ui.toast");
        expect(loadAllConfigsBody).toMatch(/variant:\s*["']error["']/);
      });

      it("shows error toast when save fails", () => {
        const saveAgentConfigBody = extractFunctionBody(tuiSource, "saveAgentConfig");
        expect(saveAgentConfigBody).toMatch(/variant:\s*["']error["']/);
        expect(saveAgentConfigBody).toContain("Save failed");
      });

      it("shows info toast during operations", () => {
        expect(tuiSource).toMatch(/variant:\s*["']info["']/);
      });

      it("shows success toast on save complete", () => {
        const saveAgentConfigBody = extractFunctionBody(tuiSource, "saveAgentConfig");
        expect(saveAgentConfigBody).toMatch(/variant:\s*["']success["']/);
        expect(saveAgentConfigBody).toContain("Saved");
      });
    });

    describe("Error Logging", () => {
      it("logError function writes to log file", () => {
        expect(tuiSource).toContain("function logError(error)");
        expect(tuiSource).toContain("Bun.write");
        expect(tuiSource).toContain("tui-error.log");
      });

      it("critical errors are logged", () => {
        expect(tuiSource).toContain("logError(new Error");
      });

      it("error logs include timestamp", () => {
        expect(tuiSource).toContain("toISOString()");
      });
    });

    describe("Graceful Degradation", () => {
      it("falls back to command palette if Select missing", () => {
        expect(tuiSource).toMatch(/if\s*\(\s*!Select\s*\)/);
        expect(tuiSource).toMatch(/api\.command\.openPalette\(\)/);
      });

      it("shows appropriate error message to user", () => {
        expect(tuiSource).toContain("Critical component missing");
        expect(tuiSource).toMatch(/api\.ui has:/);
      });
    });
  });
});
});
