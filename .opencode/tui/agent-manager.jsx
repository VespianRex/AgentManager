/** @jsxImportSource @opentui/solid */
import path from "node:path";
import fs from "node:fs/promises";

import os from "node:os";

// --- Global Error Handlers (must be at module level, before any async code) ---
// Note: In TUI context (server-side SolidJS), we use process-level handlers
if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (reason, promise) => {
    // Prevent default crash behavior
    logError(new Error(`Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`));
    // Only show toast if api is available in the global context
    // Note: TUI plugins receive api via the exported function, not global scope
  });

  process.on('uncaughtException', (error) => {
    logError(error);
    // Log to file for debugging
    const logPath = path.join(process.cwd(), '.opencode/tui/tui-error.log');
    if (typeof Bun !== 'undefined') {
      Bun.write(
        logPath,
        `[${new Date().toISOString()}] Uncaught exception: ${error.stack || error.message}\n`,
        { append: true },
      );
    }
  });
}

// Import from compiled TUI API layer in dist/ (single source of truth, decoupled from internal module structure)
import {
  AGENT_REGISTRY,
  normalizePath,
  modelBadge,
  shortenModel,
  mergeWithDefaults,
  DEFAULT_AGENTS,
  DEFAULT_FALLBACKS,
  getRoleCode,
  HealthRegistry,
} from "../../dist/tui-api.js";
import { findConfigFiles, loadConfig, saveConfig } from "../../dist/config.js";
import { isPlainObject } from "../../dist/types.js";
import { safeLogError } from "../../dist/error-utils.js";

// --- TUI-specific helpers (not duplicated from src/) ---

// Health registry singleton — lazily initialized with async factory
// KISS: Uses promise caching to prevent race condition when multiple components
// call getHealthRegistry() simultaneously. Using value caching (_healthRegistry = null)
// would cause multiple HealthRegistry.create() calls if invoked concurrently.
// With promise caching, all callers share the same promise.
let _healthRegistryPromise = null;
async function getHealthRegistry() {
  if (!_healthRegistryPromise) {
    _healthRegistryPromise = HealthRegistry.create();
  }
  return _healthRegistryPromise;
}

// Guard helper for DialogPrompt (similar to existing TUI API patterns)
// Returns null if DialogPrompt not available, preventing runtime crashes
function getDialogPrompt(api) {
  if (!api?.ui?.DialogPrompt) {
    api.ui.toast?.({ variant: "error", message: "DialogPrompt not available in this OpenCode version" });
    return null;
  }
  return api.ui.DialogPrompt;
}

// Preferences file for TUI settings (auto-test toggle, etc.)
// KISS: Use os.homedir() for robust home directory resolution
const PREFS_PATH = path.join(os.homedir(), ".opencode", "tui", "agent-manager-prefs.json");
let _prefsCache = null;
async function loadPrefs(forceReload = false) {
  // Support cache invalidation for external file changes (DRY: consistent cache pattern)
  if (_prefsCache && !forceReload) return _prefsCache;
  try {
    const text = await fs.readFile(PREFS_PATH, "utf8");
    _prefsCache = JSON.parse(text);
    return _prefsCache;
  } catch {
    _prefsCache = { autoTest: false };
    return _prefsCache;
  }
}
async function savePrefs(prefs) {
  _prefsCache = prefs;
  try {
    await fs.mkdir(path.dirname(PREFS_PATH), { recursive: true });
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2));
  } catch {
    // Non-critical — preferences are optional
  }
}

// Returns a health status icon and color for a model ID
// FIX: Made async to work with HealthRegistry.create()
// FIX: Use getEntry() instead of non-existent getModelHealth()
// FIX: Use totalTests instead of non-existent tests array
async function modelHealthBadge(modelId, health) {
  if (!modelId || !health) return { icon: "○", color: "#6a6a6a", status: "untested" };
  const entry = health.getEntry(modelId);
  if (!entry || entry.totalTests === 0) return { icon: "○", color: "#6a6a6a", status: "untested" };
  // KISS: Map status to icon directly from entry.status
  switch (entry.status) {
    case "healthy": return { icon: "●", color: "#5faf5f", status: "healthy" };
    case "degraded": return { icon: "●", color: "#ffff5f", status: "degraded" };
    case "unhealthy": return { icon: "●", color: "#ff5f5f", status: "unhealthy" };
    default: return { icon: "○", color: "#6a6a6a", status: "untested" };
  }
}

// KISS: Static helper - health icon is derived from entry status
const getHealthIconFromStatus = (status) => {
  switch (status) {
    case "healthy": return "✓";
    case "degraded": return "⚠";
    case "unhealthy": return "✗";
    default: return "·";
  }
};

function extractModelInfo(model) {
  const id = model.id || model.name || "unknown";
  const displayName = model.name || model.id || "unknown";
  return { id, displayName };
}

function buildModelOptions(providers, currentFullModelId) {
  const options = [];
  const providerArr = Array.isArray(providers)
    ? providers
    : Object.values(providers || {});
  for (const provider of providerArr) {
    const pid = provider.id || provider.name || "unknown";
    const modelsObj = provider.models || {};
    const modelArr = Object.values(modelsObj);
    for (const model of modelArr) {
      const { id, displayName } = extractModelInfo(model);
      const fullModelId = `${pid}/${id}`;
      const isCurrent =
        currentFullModelId !== undefined && fullModelId === currentFullModelId;
      options.push({
        title: displayName,
        value: { model: id, provider: pid },
        description: pid,
        footer: isCurrent ? "current" : "",
      });
    }
  }
  return options;
}

function backButton(description = "Return to previous menu") {
  return {
    title: "Back",
    value: { action: "back" },
    description,
    footer: "back",
  };
}

// Use relative path based on cwd to avoid exposing filesystem structure
function logError(error) {
  const logPath = path.join(process.cwd(), '.opencode/tui/tui-error.log');
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  console.error(msg);
  if (typeof Bun !== "undefined") {
    Bun.write(
      logPath,
      `[${new Date().toISOString()}] ${msg}\n`,
      { append: true },
    );
  }
}

// Guard against missing DialogSelect/when - extracted to eliminate 6x copy-paste
function guardApiUi(api) {
  const Select = api.ui.DialogSelect || api.ui.Select;
  if (typeof api.ui.when !== "function") {
    api.ui.when = () => [];
    logError(new Error("api.ui.when (X()) undefined - fallback applied"));
  }
  if (!Select) {
    api.ui.toast({
      variant: "error",
      message: `Critical component missing - api.ui has: ${Object.keys(api.ui || {}).join(", ")}`,
    });
    api.command.openPalette();
    return null;
  }
  return Select;
}

const tui = async (api) => {
  // KISS: No console.log in production - errors go to logError() instead

  // Mounted flag to prevent setTimeout callbacks from running after unmount
  let mounted = true;
  api.lifecycle.onDispose(() => {
    mounted = false;
  });

  // Helper: wraps setTimeout with mounted guard to prevent stale UI updates
  const safeSetTimeout = (fn, delay = 0) => {
    return setTimeout(() => {
      if (!mounted) return;
      fn();
    }, delay);
  };

  const skin = () => {
    const t = api.theme.current;
    return {
      panel: t.backgroundPanel || "#1d1d1d",
      border: t.border || "#3a3a3a",
      text: t.text || "#e0e0e0",
      muted: t.textMuted || "#6a6a6a",
      accent: t.primary || "#5f87ff",
      success: t.success || "#5faf5f",
      error: t.error || "#ff5f5f",
      warning: t.warning || "#ffff5f",
    };
  };

  // Path traversal prevention - delegates to normalizePath from config.ts
  // (DRY: single implementation, consistent security checks)
  function validatePath(pathStr, cwd) {
    return normalizePath(pathStr, cwd || process.cwd());
  }

  async function loadAllConfigs(cwd) {
    const files = await findConfigFiles(cwd);
    const results = [];
    for (const file of files) {
      try {
        const { config, document } = await loadConfig(file);
        // Reuse shared isPlainObject type guard (DRY)
        const agents = isPlainObject(document.agents) ? document.agents : null;
        const categories = isPlainObject(document.categories) ? document.categories : null;
        if (agents) {
          results.push({ config: file, agents: agents, document });
        }
        if (categories) {
          results.push({
            config: file,
            agents: categories,
            document,
            isCategories: true,
          });
        }
      } catch (e) {
        api.ui.toast({
          variant: "error",
          message: `Load error ${file.path}: ${e.message}`,
        });
      }
    }
    return results;
  }

  async function reloadAgents() {
    try {
      await api.client.instance.dispose({});
      return true;
    } catch {
      return false;
    }
  }

  async function showAgentList(api, loadedConfigs, returnIndex) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const mergedAgents = mergeWithDefaults(loadedConfigs);

    const options = [];
    for (const [agentKey, agent] of Object.entries(mergedAgents)) {
      const displayName = agent.key || agentKey;
      const model = agent.model ? shortenModel(agent.model) : "default";
      const fallbackDisplay = Array.isArray(agent.fallback)
        ? agent.fallback.slice(0, 2).join(" -> ") +
          (agent.fallback.length > 2 ? " ..." : "")
        : agent.fallback || "--";
      // FIX: Use async modelHealthBadge
      const health = await getHealthRegistry();
      const badge = await modelHealthBadge(agent.model, health);
      const statusIcon = badge.icon;
      const healthColor = badge.color;
      const healthDesc = badge.status;
      const sourceTag = agent.isDefault
        ? "default"
        : agent.configPath?.includes(".config")
        ? "global"
        : "local";
const roleCode = agent.roleCode || getRoleCode(agent.role);
    options.push({
      title: `${roleCode} ${statusIcon} ${displayName}`,
      value: { agentKey, agent, mergedAgents, index: options.length },
      description: `${model} [${healthDesc}] -> ${fallbackDisplay}`,
      footer: `${sourceTag}:${agent.role}`,
    });
  }
    if (options.length === 0) {
      api.ui.dialog.replace(() => (
        <box flexDirection="column" gap={1} padding={1}>
          <text fg={s.warning} bold={true}>
            No Agents Found
          </text>
          <text fg={s.muted}>
            This should not happen - defaults should show.
          </text>
        </box>
      ));
      return;
    }

    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() => (
      <Select
        title="Agent Manager"
        options={options}
        current={
          returnIndex && returnIndex[0] !== undefined
            ? returnIndex[0]
            : undefined
        }
        placeholder="↓/↑ navigate · Enter edit · r reload"
        onSelect={(item) => {
          api.ui.dialog.clear();
          if (!item?.value) return;
          const ak = item.value.agentKey;
          const ag = item.value.agent;
          const ma = item.value.mergedAgents;
          const index = item.value.index;
          if (returnIndex && typeof index === "number") returnIndex[0] = index;
          safeSetTimeout(() => {
            showAgentDetail(api, loadedConfigs, ak, ag, ma, returnIndex);
          });
        }}
      />
    ));
  }

  async function showAgentDetail(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const displayName = agent.key || agentKey;
    const model = agent.model ? modelBadge(agent.model) : "default";
    const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];
    const fallbackPreview =
      fallbackArr.length > 0
      ? fallbackArr.slice(0, 3).join(" -> ") +
        (fallbackArr.length > 3 ? " ..." : "")
      : "none";
    const sourceTag = agent.isDefault
      ? "default"
      : agent.configPath?.includes(".config")
      ? "global"
      : "local";
    const roleInfo = agent.role || "";

    // Load preferences for auto-test toggle
    const prefs = await loadPrefs();

    const options = [
      {
        title: `Model: ${model}`,
        value: { action: "editModel" },
        description: "Press Enter to change the primary model",
        footer: "primary",
      },
      {
        title: `Fallbacks (${fallbackArr.length}): ${fallbackPreview}`,
        value: { action: "manageFallbacks" },
        description: "Press Enter to add/edit/remove fallback models",
        footer: "chain",
      },
      {
        title: "Reload from server",
        value: { action: "reload" },
        description: "Refresh agent configuration from OpenCode",
        footer: "refresh",
      },
      {
        title: `Test Model: ${modelBadge(agent.model)}`,
        value: { action: "testModel" },
        description: "Run quick latency/throughput test",
        footer: "test",
      },
      {
        title: "Back to list",
        value: { action: "back" },
        description: "Return to agent list",
        footer: "esc",
      },
    ];

    // Auto-test toggle state
    const autoTestLabel = prefs.autoTest
      ? "Auto-test on load: ON"
      : "Auto-test on load: OFF";
    options.push({
      title: autoTestLabel,
      value: { action: "toggleAutoTest" },
      description: "Toggle automatic health check when viewing agents",
      footer: "prefs",
    });

    api.ui.dialog.setSize("xlarge");
    let handledDetailSelection = false;
    api.ui.dialog.replace(() => (
      <box flexDirection="column" gap={0} padding={0}>
        {/* Agent description pane */}
        <box flexDirection="column" gap={0} padding={[1, 2]} border="single" borderColor={s.muted}>
          <text fg={s.text} wrap="word">
            {agent.helpText || ""}
          </text>
          {agent.tips && agent.tips.length > 0 && (
            <>
              <box height={1} />
              <text fg={s.accent} bold={true}>
                Tips:
              </text>
              {agent.tips.map((tip) => (
                <text fg={s.muted}>
                  {"  • "}{tip}
                </text>
              ))}
            </>
          )}
        </box>
        <Select
          title={`${displayName}${roleInfo ? ` (${roleInfo})` : ""}`}
          options={options}
          placeholder="↑/↓ navigate · Enter to select"
          onSelect={(item) => {
            api.ui.dialog.clear();
            if (handledDetailSelection || !item?.value) return;
            handledDetailSelection = true;
          const { action } = item.value;
          if (action === "editModel") {
            api.ui.dialog.clear();
            safeSetTimeout(async () => {
              try {
                await editModel(
                  api,
                  loadedConfigs,
                  agentKey,
                  agent,
                  mergedAgents,
                  returnIndex,
                );
              } catch (e) {
                safeLogError("editModel error:", e);
                api.ui.toast({
                  variant: "error",
                  message: `editModel error: ${e.message}`,
                });
              }
            });
          } else if (action === "manageFallbacks") {
            api.ui.dialog.clear();
            safeSetTimeout(async () => {
              try {
                await showFallbackManager(
                  api,
                  loadedConfigs,
                  agentKey,
                  agent,
                  mergedAgents,
                  returnIndex,
                );
              } catch (e) {
                safeLogError("showFallbackManager error:", e);
                api.ui.toast({ variant: "error", message: `Failed to open fallback manager: ${e.message}` });
              }
            });
          } else if (action === "reload") {
            safeSetTimeout(async () => {
              try {
                await reloadAgents();
                api.ui.toast({ variant: "success", message: "Agents reloaded" });
              } catch (e) {
                safeLogError("reloadAgents error:", e);
                api.ui.toast({ variant: "error", message: `Reload failed: ${e.message}` });
              }
            });
          } else if (action === "testModel") {
            api.ui.dialog.clear();
            safeSetTimeout(async () => {
              try {
                await testAgentModel(
                  api,
                  loadedConfigs,
                  agentKey,
                  agent,
                  mergedAgents,
                  returnIndex,
                );
              } catch (e) {
                safeLogError("testAgentModel error:", e);
                api.ui.toast({ variant: "error", message: `Test failed: ${e.message}` });
              }
            });
          } else if (action === "toggleAutoTest") {
            loadPrefs()
              .then(async (prefs) => {
                const newPrefs = { ...prefs, autoTest: !prefs.autoTest };
                await savePrefs(newPrefs);
                api.ui.toast({
                  variant: "info",
                  message: `Auto-test ${newPrefs.autoTest ? "ON" : "OFF"}`,
                });
                handledDetailSelection = false;
                showAgentDetail(
                  api,
                  loadedConfigs,
                  agentKey,
                  agent,
                  mergedAgents,
                  returnIndex,
                );
              })
              .catch((e) => {
                safeLogError("loadPrefs error:", e);
                api.ui.toast({ variant: "error", message: `Failed to load preferences: ${e.message}` });
              });
          } else if (action === "back") {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              showAgentList(api, loadedConfigs, returnIndex);
            });
          }
        }}
      />
    </box>
    ));

    // Auto-test: if enabled and model has never been tested, run a health check
    // FIX: Use async getHealthRegistry() and correct API methods
    if (prefs.autoTest && agent.model) {
      const health = await getHealthRegistry();
      const entry = health.getEntry(agent.model);
      // FIX: Use totalTests instead of tests array
      if (!entry || entry.totalTests === 0) {
        safeSetTimeout(() => {
          void testAgentModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        }, 500);
      }
    }
  }

  function editModel(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const currentModel = agent.model ? modelBadge(agent.model) : "";

    const providers = api.state.provider || [];
    const providerArr = Array.isArray(providers)
      ? providers
      : Object.values(providers || {});

    if (providerArr.length === 0) {
      showCustomModelPrompt(
        api,
        loadedConfigs,
        agentKey,
        agent,
        mergedAgents,
        returnIndex,
      );
      return;
    }

    const providerOptions = [];
    let handledProviderSelection = false;
    const commitProviderSelection = (item) => {
      if (handledProviderSelection || !item || !item.value) return;
      handledProviderSelection = true;
      const { action, provider } = item.value;
      api.ui.dialog.clear();
      if (action === "selectProvider") {
        setImmediate(() => {
          showModelsForProvider(
            api,
            loadedConfigs,
            agentKey,
            agent,
            provider,
            mergedAgents,
            returnIndex,
          );
        });
      } else if (action === "showAll") {
        setImmediate(() => {
          showAllModels(
            api,
            loadedConfigs,
            agentKey,
            agent,
            mergedAgents,
            returnIndex,
          );
        });
      } else if (action === "custom") {
        setImmediate(() => {
          showCustomModelPrompt(
            api,
            loadedConfigs,
            agentKey,
            agent,
            mergedAgents,
            returnIndex,
          );
        });
      }
    };
    for (const provider of providerArr) {
      const pid = provider.id || provider.name || "unknown";
      const modelsObj = provider.models || {};
      const modelArr = Object.values(modelsObj);
      const modelCount = modelArr.length;
      const isCurrent = currentModel.startsWith(pid);

      providerOptions.push({
        title: pid,
        value: { action: "selectProvider", providerId: pid, provider },
        description: `${modelCount} model${modelCount !== 1 ? "s" : ""} available`,
        footer: isCurrent ? "current" : "",
        onSelect: () => {
          commitProviderSelection({
            value: { action: "selectProvider", provider },
          });
        },
      });
    }

    providerOptions.push({
      title: "Show all models (all providers)",
      value: { action: "showAll" },
      description: "Browse every available model",
      footer: "all",
      onSelect: () => {
        commitProviderSelection({ value: { action: "showAll" } });
      },
    });

    providerOptions.push({
      title: "Type custom model",
      value: { action: "custom" },
      description: "Enter a model ID manually",
      footer: "custom",
      onSelect: () => {
        commitProviderSelection({ value: { action: "custom" } });
      },
    });

    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() => (
      <Select
        title={`Select Provider - ${agentKey}`}
        options={providerOptions}
        placeholder="↑/↓ navigate · Enter select"
        onSelect={(item) => commitProviderSelection(item)}
      />
    ));
  }

  function showModelsForProvider(
    api,
    loadedConfigs,
    agentKey,
    agent,
    provider,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const pid = provider.id || provider.name || "unknown";

    const options = buildModelOptions([provider], agent.model);
    let handledModelSelection = false;
    const commitModelSelection = (item) => {
      if (handledModelSelection || !item || !item.value) return;
      handledModelSelection = true;
      const { action } = item.value;
      api.ui.dialog.clear();
      if (action === "back") {
        safeSetTimeout(() => {
          editModel(
            api,
            loadedConfigs,
            agentKey,
            agent,
            mergedAgents,
            returnIndex,
          );
        });
        return;
      }
      const fullModelId = `${item.value.provider}/${item.value.model}`;
      saveAgentConfig(
        api,
        loadedConfigs,
        agentKey,
        { ...agent, model: fullModelId },
        returnIndex,
      );
    };
    const backOption = {
      title: "Back to providers",
      value: { action: "back" },
      description: `Return to provider list`,
      footer: "back",
      onSelect: () => {
        commitModelSelection({ value: { action: "back" } });
      },
    };
    const modelSelectOptions = options.map((option) => ({
      ...option,
      onSelect: () => {
        commitModelSelection(option);
      },
    }));
    api.ui.dialog.replace(() => (
      <Select
        title={`Models - ${pid} - ${agentKey}`}
        options={[backOption, ...modelSelectOptions]}
        placeholder="↑/↓ navigate · Enter select"
        onSelect={(item) => commitModelSelection(item)}
      />
    ));
  }

  function showAllModels(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const providers = api.state.provider || [];

    const options = buildModelOptions(providers, agent.model);
    let handledAllModelSelection = false;
    const commitAllModelSelection = (item) => {
      if (handledAllModelSelection || !item || !item.value) return;
      handledAllModelSelection = true;
      const { action } = item.value;
      api.ui.dialog.clear();
      if (action === "back") {
        safeSetTimeout(() => {
          editModel(
            api,
            loadedConfigs,
            agentKey,
            agent,
            mergedAgents,
            returnIndex,
          );
        });
        return;
      }
      const fullModelId = `${item.value.provider}/${item.value.model}`;
      saveAgentConfig(
        api,
        loadedConfigs,
        agentKey,
        { ...agent, model: fullModelId },
        returnIndex,
      );
    };
    api.ui.dialog.setSize("xlarge");
    const backOption = {
      title: "Back to providers",
      value: { action: "back" },
      description: "Return to provider list",
      footer: "back",
      onSelect: () => {
        commitAllModelSelection({ value: { action: "back" } });
      },
    };
    const allModelSelectOptions = options.map((option) => ({
      ...option,
      onSelect: () => {
        commitAllModelSelection(option);
      },
    }));
    api.ui.dialog.replace(() => (
      <Select
        title={`All Models - ${agentKey}`}
        options={[backOption, ...allModelSelectOptions]}
        placeholder="↑/↓ navigate · Enter select"
        onSelect={(item) => commitAllModelSelection(item)}
      />
    ));
  }

  function showCustomModelPrompt(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Prompt = getDialogPrompt(api);
    if (!Prompt) return;
    const s = skin();
    const currentModel = agent.model ? modelBadge(agent.model) : "";

    api.ui.dialog.setSize("medium");
    api.ui.dialog.replace(() => (
      <Prompt
        title={`Custom Model - ${agentKey}`}
        value={currentModel}
        placeholder="provider/model-id"
        onConfirm={async (value) => {
          if (!value || !value.trim()) {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              editModel(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
              );
            });
            return;
          }
          api.ui.dialog.clear();
          const newModel = value.trim();
          await saveAgentConfig(
            api,
            loadedConfigs,
            agentKey,
            { ...agent, model: newModel },
            returnIndex,
          );
        }}
        onCancel={() => {
          api.ui.dialog.clear();
          safeSetTimeout(() => {
            editModel(
              api,
              loadedConfigs,
              agentKey,
              agent,
              mergedAgents,
              returnIndex,
            );
          });
        }}
      />
    ));
  }

  function showFallbackManager(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];

    const options = [
      {
        title: "Add new fallback",
        value: { action: "add" },
        description: "Add a model to the fallback chain",
      },
    ];

    for (let i = 0; i < fallbackArr.length; i++) {
      options.push({
        title: `${i + 1}. ${fallbackArr[i]}`,
        value: { action: "edit", index: i, value: fallbackArr[i] },
        description: `Position ${i + 1} in chain`,
      });
    }

    if (fallbackArr.length > 0) {
      options.push({
        title: "Remove last fallback",
        value: { action: "remove" },
        description: `Remove: ${fallbackArr[fallbackArr.length - 1]}`,
      });
    }

    options.push({
      title: "Back to agent",
      value: { action: "back" },
      description: "Return to agent detail",
    });

    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() => (
      <Select
        title={`Fallback Chain - ${agentKey}`}
        options={options}
        placeholder="Select action"
        onSelect={(item) => {
          api.ui.dialog.clear();
          if (!item?.value) return;
          const { action, index, value } = item.value;
          if (action === "add") {
            safeSetTimeout(() => {
              showAddFallback(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
              );
            });
          } else if (action === "edit") {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              showEditFallback(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
                index,
                value,
              );
            });
          } else if (action === "remove") {
            api.ui.dialog.clear();
            const newFallbacks = fallbackArr.slice(0, -1);
            saveAgentConfig(
              api,
              loadedConfigs,
              agentKey,
              { ...agent, fallback: newFallbacks },
              returnIndex,
              () => {
                showFallbackManager(
                  api,
                  loadedConfigs,
                  agentKey,
                  { ...agent, fallback: newFallbacks },
                  mergedAgents,
                  returnIndex,
                );
              },
            );
          } else if (action === "back") {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              showAgentDetail(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
              );
            });
          }
        }}
      />
    ));
  }

  function showAddFallback(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const rawProviders = api.state.provider;
    const providers = Array.isArray(rawProviders)
      ? rawProviders
      : rawProviders
      ? Object.values(rawProviders)
      : [];

    const options = [
      {
        title: "Type custom model",
        value: { model: "__custom__" },
        description: "Enter a model ID manually",
        footer: "custom",
      },
      ...buildModelOptions(providers, undefined),
    ];

    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() => (
      <Select
        title={`Add Fallback - ${agentKey}`}
        options={options}
        placeholder="↑/↓ navigate · Enter select"
        onSelect={(item) => {
          api.ui.dialog.clear();
          if (item.value.model === "__custom__") {
            safeSetTimeout(() => {
              showCustomFallbackPrompt(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
              );
            });
          } else {
            api.ui.dialog.clear();
            const currentFallbacks = Array.isArray(agent.fallback)
              ? agent.fallback
              : [];
            const fullModelId = `${item.value.provider}/${item.value.model}`;
            const newFallbacks = [...currentFallbacks, fullModelId];
            saveAgentConfig(
              api,
              loadedConfigs,
              agentKey,
              { ...agent, fallback: newFallbacks },
              returnIndex,
              () => {
                showFallbackManager(
                  api,
                  loadedConfigs,
                  agentKey,
                  { ...agent, fallback: newFallbacks },
                  mergedAgents,
                  returnIndex,
                );
              },
            );
          }
        }}
      />
    ));
  }

  function showCustomFallbackPrompt(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
  ) {
    const Prompt = getDialogPrompt(api);
    if (!Prompt) return;
    const s = skin();

    api.ui.dialog.setSize("medium");
    api.ui.dialog.replace(() => (
      <Prompt
        title={`Custom Fallback - ${agentKey}`}
        value=""
        placeholder="provider/model-id"
        onConfirm={async (value) => {
          if (!value || !value.trim()) {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              showAddFallback(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
              );
            });
            return;
          }
          api.ui.dialog.clear();
          const newModel = value.trim();
          const currentFallbacks = Array.isArray(agent.fallback)
            ? agent.fallback
            : [];
          const newFallbacks = [...currentFallbacks, newModel];
          saveAgentConfig(
            api,
            loadedConfigs,
            agentKey,
            { ...agent, fallback: newFallbacks },
            returnIndex,
            () => {
              showFallbackManager(
                api,
                loadedConfigs,
                agentKey,
                { ...agent, fallback: newFallbacks },
                mergedAgents,
                returnIndex,
              );
            },
          );
        }}
        onCancel={() => {
          api.ui.dialog.clear();
          safeSetTimeout(() => {
            showAddFallback(
              api,
              loadedConfigs,
              agentKey,
              agent,
              mergedAgents,
              returnIndex,
            );
          });
        }}
      />
    ));
  }

  function showEditFallback(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
    index,
    currentValue,
  ) {
    const Select = guardApiUi(api);
    if (!Select) return;
    const s = skin();
    const rawProviders = api.state.provider;
    const providers = Array.isArray(rawProviders)
      ? rawProviders
      : rawProviders
      ? Object.values(rawProviders)
      : [];

    const options = [
      {
        title: "Type custom model",
        value: { model: "__custom__" },
        description: "Enter a model ID manually",
        footer: "custom",
      },
      ...buildModelOptions(providers, currentValue),
    ];

    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() => (
      <Select
        title={`Edit Fallback ${index + 1} - ${agentKey}`}
        options={options}
        placeholder="↑/↓ navigate · Enter select"
        onSelect={(item) => {
          api.ui.dialog.clear();
          if (!item?.value) return;
          if (item.value.model === "__custom__") {
            safeSetTimeout(() => {
              showEditFallbackPrompt(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
                index,
                currentValue,
              );
            });
          } else {
            api.ui.dialog.clear();
            const currentFallbacks = Array.isArray(agent.fallback)
              ? [...agent.fallback]
              : [];
            const fullModelId = `${item.value.provider}/${item.value.model}`;
            currentFallbacks[index] = fullModelId;
            saveAgentConfig(
              api,
              loadedConfigs,
              agentKey,
              { ...agent, fallback: currentFallbacks },
              returnIndex,
              () => {
                showFallbackManager(
                  api,
                  loadedConfigs,
                  agentKey,
                  { ...agent, fallback: currentFallbacks },
                  mergedAgents,
                  returnIndex,
                );
              },
            );
          }
        }}
      />
    ));
  }

  function showEditFallbackPrompt(
    api,
    loadedConfigs,
    agentKey,
    agent,
    mergedAgents,
    returnIndex,
    index,
    currentValue,
  ) {
    const Prompt = getDialogPrompt(api);
    if (!Prompt) return;
    const s = skin();

    api.ui.dialog.setSize("medium");
    api.ui.dialog.replace(() => (
      <Prompt
        title={`Edit Fallback ${index + 1} - ${agentKey}`}
        value={currentValue}
        placeholder="provider/model-id"
        onConfirm={async (value) => {
          if (!value || !value.trim()) {
            api.ui.dialog.clear();
            safeSetTimeout(() => {
              showEditFallback(
                api,
                loadedConfigs,
                agentKey,
                agent,
                mergedAgents,
                returnIndex,
                index,
                currentValue,
              );
            });
            return;
          }
          api.ui.dialog.clear();
          const newModel = value.trim();
          const currentFallbacks = Array.isArray(agent.fallback)
            ? [...agent.fallback]
            : [];
          currentFallbacks[index] = newModel;
          saveAgentConfig(
            api,
            loadedConfigs,
            agentKey,
            { ...agent, fallback: currentFallbacks },
            returnIndex,
            () => {
              showFallbackManager(
                api,
                loadedConfigs,
                agentKey,
                { ...agent, fallback: currentFallbacks },
                mergedAgents,
                returnIndex,
              );
            },
          );
        }}
        onCancel={() => {
          api.ui.dialog.clear();
          safeSetTimeout(() => {
            showEditFallback(
              api,
              loadedConfigs,
              agentKey,
              agent,
              mergedAgents,
              returnIndex,
              index,
              currentValue,
            );
          });
        }}
      />
    ));
  }

  async function saveAgentConfig(
    api,
    loadedConfigs,
    agentKey,
    newAgent,
    returnIndex,
    onSuccess,
  ) {
    let configPath = newAgent.configPath;

    if (!configPath) {
      const userConfig = loadedConfigs.find((c) =>
        c.config.path.includes(".config"),
      );
      const projectConfig = loadedConfigs.find(
        (c) => !c.config.path.includes(".config"),
      );
      configPath = (userConfig || projectConfig)?.config?.path;
    }

    if (!configPath) {
      api.ui.toast({
        variant: "error",
        message: "No config file found. Please create a config file first.",
      });
      return;
    }

    const configEntry = loadedConfigs.find((c) => c.config.path === configPath);
    if (!configEntry) {
      api.ui.toast({ variant: "error", message: "Config not found" });
      return;
    }

    const isCategory = newAgent.isCategory || configEntry.isCategories;
    const sectionKey = isCategory ? "categories" : "agents";

    api.ui.toast({
      variant: "info",
      message: `Saving ${agentKey} to ${sectionKey}...`,
    });

    try {
      const existingSection = configEntry.document[sectionKey] || {};
      const updatedSection = { ...existingSection };

      if (newAgent.model) {
        updatedSection[agentKey] = {
          ...updatedSection[agentKey],
          model: newAgent.model,
        };
      }
      if (newAgent.fallback !== undefined) {
        updatedSection[agentKey] = {
          ...updatedSection[agentKey],
          fallback_models: newAgent.fallback,
        };
      }

      const updated = { ...configEntry.document, [sectionKey]: updatedSection };

      await saveConfig(configEntry.config, updated);
      await reloadAgents();
      api.ui.toast({ variant: "success", message: `Saved ${agentKey}` });

      const reloaded = await loadAllConfigs(
        api.state.path.directory || process.cwd(),
      );
      const newMerged = mergeWithDefaults(reloaded);

      if (onSuccess) {
        onSuccess();
      } else {
        showAgentDetail(
          api,
          reloaded,
          agentKey,
          newMerged[agentKey],
          newMerged,
          returnIndex,
        );
      }
    } catch (e) {
      api.ui.toast({ variant: "error", message: `Save failed: ${e.message}` });
    }
  }

  // Runs a health test on a single model via the server plugin tool
  async function testAgentModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
    const s = skin();
    const modelToTest = agent.model;
    if (!modelToTest) {
      api.ui.toast({ variant: "error", message: "No model configured for this agent" });
      return;
    }

    api.ui.toast({ variant: "info", message: `Testing ${shortenModel(modelToTest)}...` });
    api.ui.dialog.replace(() => (
      <box flexDirection="column" gap={1} padding={1}>
        <text fg={s.accent} bold={true}>Testing {shortenModel(modelToTest)}...</text>
        <text fg={s.muted}>Running quick latency and throughput test</text>
      </box>
    ));

    try {
      // Use the server plugin's benchmark tool
      const result = await api.client.execute("agent_manager", {
        action: "benchmark",
        configs: [{ model: modelToTest, prompt: "Hello, respond in one sentence." }],
        timeoutMs: 30000,
      });

      let report;
      try {
        const parsed = JSON.parse(result);
        report = parsed.report;
      } catch {
        report = null;
      }

      // Update health registry
      const health = await getHealthRegistry();
      if (report && report.modelResults && report.modelResults.length > 0) {
        for (const mr of report.modelResults) {
          await health.recordResult({
            model: mr.model,
            success: mr.success,
            elapsedMs: mr.response?.elapsedMs ?? 0,
            tokensPerSecond: mr.response?.tokensPerSecond ?? 0,
            error: mr.error,
          });
        }
      }

      const entry = health.getEntry(modelToTest);
      const status = entry?.status ?? "untested";
      const lastTest = entry && entry.totalTests > 0 ? {
        success: entry.successfulTests > entry.failedTests,
        elapsedMs: entry.avgLatencyMs,
        tokensPerSecond: entry.avgTokensPerSecond,
        error: entry.lastError,
        timestamp: entry.lastCheckedAt,
      } : null;

      const statusColor = status === "healthy" ? s.success : status === "degraded" ? s.warning : s.error;
      const statusLabel = status === "healthy" ? "HEALTHY" : status === "degraded" ? "DEGRADED" : status === "unhealthy" ? "UNHEALTHY" : "UNTESTED";

      const backOption = {
        title: "Back to agent",
        value: { action: "back" },
        description: "Return to agent detail",
        footer: "back",
      };

      const Select = guardApiUi(api);
      if (!Select) return;

      api.ui.dialog.replace(() => (
        <box flexDirection="column" gap={1} padding={1}>
          <text fg={statusColor} bold={true}>Test Result: {shortenModel(modelToTest)}</text>
          {lastTest ? (
            <box flexDirection="column" gap={0}>
              <text fg={s.text}>Status:    <text fg={statusColor} bold={true}>{statusLabel}</text></text>
              <text fg={lastTest.success ? s.success : s.error}>
                Result:    {lastTest.success ? "SUCCESS" : "FAILED"}
              </text>
              <text fg={s.text}>
                Latency:   {lastTest.elapsedMs.toFixed(0)}ms
              </text>
              <text fg={s.text}>
                Throughput:{lastTest.tokensPerSecond.toFixed(1)} tok/s
              </text>
              <text fg={s.text}>
                Tests run: {entry.totalTests} ({entry.consecutiveFailures} consecutive failures)
              </text>
              {lastTest.error && (
                <text fg={s.error}>Error:     {lastTest.error}</text>
              )}
              <text fg={s.muted}>
                Last tested: {new Date(lastTest.timestamp).toLocaleString()}
              </text>
            </box>
          ) : (
            <text fg={s.warning}>No test results available</text>
          )}
          <box>
            <button type="button" onClick={() => {
              api.ui.dialog.clear();
              safeSetTimeout(() => void testAgentModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex));
            }}>
              Retry
            </button>
            <button type="button" onClick={() => {
              api.ui.dialog.clear();
              safeSetTimeout(() => showAgentDetail(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex));
            }}>
              Back
            </button>
          </box>
        </box>
      ));
    } catch (e) {
      api.ui.toast({ variant: "error", message: `Test failed: ${e.message}` });
      safeSetTimeout(() => showAgentDetail(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex));
    }
  }

  async function showAgentManager(api) {
    try {
      const cwd = api.state.path.directory || process.cwd();
      api.ui.toast({
        variant: "info",
        message: `Loading configs from ${cwd}...`,
      });
      const loadedConfigs = await loadAllConfigs(cwd);
      api.ui.toast({
        variant: "info",
        message: `Found ${loadedConfigs.length} config(s)`,
      });
      const returnIndex = [0];
      await showAgentList(api, loadedConfigs, returnIndex);
    } catch (e) {
      safeLogError("showAgentManager error:", e);
      logError(e instanceof Error ? e : new Error(String(e)));
      api.ui.toast({
        variant: "error",
        message: `Error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const unregister = api.command.register(() => [
    {
      title: "Agent Manager",
      value: "/agent-manager",
      description: "Manage agent models and fallbacks",
      category: "Configuration",
      suggested: true,
      slash: { name: "agent-manager", aliases: ["am", "agents"] },
      onSelect: () => showAgentManager(api),
    },
  ]);
  api.lifecycle.onDispose(() => unregister());
};

export default {
  id: "agent-manager",
  tui: tui,
};
