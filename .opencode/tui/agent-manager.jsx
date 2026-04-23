/** @jsxImportSource @opentui/solid */

const DEFAULT_AGENTS = {
  sisyphus: { role: "orchestrator", description: "Main orchestrator - delegates tasks, manages workflow" },
  oracle: { role: "debugger", description: "Debug and architecture expert - reviews code, proposes fixes" },
  librarian: { role: "researcher", description: "Documentation and research - looks up docs, finds examples" },
  explore: { role: "explorer", description: "Fast codebase exploration - maps files, finds patterns" },
  "multimodal-looker": { role: "visual", description: "Visual and UI inspection - analyzes images, diagrams" },
  Prometheus: { role: "planner", description: "Plan builder - generates structured work plans" },
  Metis: { role: "reviewer", description: "Plan consultant - reviews plans, identifies gaps" },
  Momus: { role: "critic", description: "Quality assurance - catches errors, verifies completeness" },
  "visual-engineering": { role: "frontend", description: "Frontend, UI/UX, design, styling, animation" },
  deep: { role: "solver", description: "Goal-oriented autonomous problem-solving" },
  quick: { role: "trivial", description: "Simple tasks - single file changes, typo fixes" },
  ultrabrain: { role: "logic", description: "Hard logic-heavy tasks - architecture, algorithms" },
  artistry: { role: "creative", description: "Unconventional creative problem-solving" },
  "unspecified-low": { role: "misc", description: "Low effort miscellaneous tasks" },
  "unspecified-high": { role: "misc", description: "High effort miscellaneous tasks" },
};

const DEFAULT_FALLBACKS = {
  sisyphus: ["anthropic", "github-copilot", "opencode", "google"],
  oracle: ["openai", "anthropic", "google"],
  librarian: ["opencode", "github-copilot", "anthropic"],
  explore: ["anthropic", "opencode"],
  "multimodal-looker": ["google", "openai", "anthropic"],
  "visual-engineering": ["google", "openai", "anthropic", "github-copilot"],
  deep: ["openai", "anthropic", "google"],
  quick: ["anthropic", "github-copilot", "opencode"],
  ultrabrain: ["openai", "anthropic", "google"],
  artistry: ["google", "openai", "anthropic"],
};

function modelBadge(model) {
  if (!model) return "unset";
  if (typeof model === "string") return model;
  return model.name || model.model || "unknown";
}

function shortenModel(model) {
  const full = modelBadge(model);
  const parts = full.split("/");
  if (parts.length > 2) return parts.slice(-2).join("/");
  return full;
}

function extractModelInfo(model) {
  const id = model.id || model.name || "unknown";
  const displayName = model.name || model.id || "unknown";
  return { id, displayName };
}

function buildModelOptions(providers, currentFullModelId) {
  const options = [];
  const providerArr = Array.isArray(providers) ? providers : Object.values(providers || {});
  for (const provider of providerArr) {
    const pid = provider.id || provider.name || "unknown";
    const modelsObj = provider.models || {};
    const modelArr = Object.values(modelsObj);
    for (const model of modelArr) {
      const { id, displayName } = extractModelInfo(model);
      const fullModelId = `${pid}/${id}`;
      const isCurrent = currentFullModelId !== undefined && fullModelId === currentFullModelId;
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
    title: "← Back",
    value: { action: "back" },
    description,
    footer: "back",
  };
}

function saveModelSelection(item, agent) {
  return { ...agent, model: `${item.value.provider}/${item.value.model}` };
}

function addToFallbacks(item, agent) {
  const current = Array.isArray(agent.fallback) ? agent.fallback : [];
  return [...current, `${item.value.provider}/${item.value.model}`];
}

function editFallbackAt(item, agent, index) {
  const current = Array.isArray(agent.fallback) ? [...agent.fallback] : [];
  current[index] = `${item.value.provider}/${item.value.model}`;
  return current;
}

const tui = async (api) => {
  const CONFIG_FILES = [
    { path: ".opencode/oh-my-opencode.json", source: "project" },
    { path: "opencode.json", source: "project" },
    { path: ".opencode/package.json", source: "project" },
    { path: "~/.config/opencode/oh-my-opencode.json", source: "user" },
    { path: "~/.config/opencode/opencode.json", source: "user" },
  ];

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

  async function findConfigFiles(cwd) {
    const results = [];
    for (const loc of CONFIG_FILES) {
      const resolved = loc.path.startsWith("~")
        ? `${process.env.HOME || "/"}${loc.path.slice(1)}`
        : `${cwd}/${loc.path}`;
      try {
        const f = Bun.file(resolved);
        if (await f.exists()) results.push({ ...loc, path: resolved });
      } catch { /* skip */ }
    }
    return results;
  }

  async function loadConfig(target) {
    const file = Bun.file(target.path);
    const text = await file.text();
    const commentJson = await import("comment-json");
    const doc = commentJson.parse(text);
    return { config: target, document: doc };
  }

  async function loadAllConfigs(cwd) {
    const files = await findConfigFiles(cwd);
    const results = [];
    for (const file of files) {
      try {
        const { config, document } = await loadConfig(file);
        const agents = document.agents;
        const categories = document.categories;
        if (agents && typeof agents === "object" && !Array.isArray(agents)) {
          results.push({ config: file, agents: agents, document });
        }
        if (categories && typeof categories === "object" && !Array.isArray(categories)) {
          results.push({ config: file, agents: categories, document, isCategories: true });
        }
      } catch (e) {
        api.ui.toast({ variant: "error", message: `Load error ${file.path}: ${e.message}` });
      }
    }
    return results;
  }

function mergeWithDefaults(loadedConfigs) {
  const merged = {};
  for (const [agentKey, info] of Object.entries(DEFAULT_AGENTS)) {
    merged[agentKey.toLowerCase()] = {
      key: agentKey,
      model: null,
      fallback: DEFAULT_FALLBACKS[agentKey] || [],
      role: info.role,
      description: info.description,
      isDefault: true,
    };
  }
  for (const { config, agents, isCategories } of loadedConfigs) {
    for (const [agentKey, agentConfig] of Object.entries(agents)) {
      if (agentKey === "false" || agentKey === "true") continue;
      const normalizedKey = agentKey.toLowerCase();
      if (merged[normalizedKey]) {
        merged[normalizedKey].model = agentConfig.model || merged[normalizedKey].model;
        merged[normalizedKey].fallback = agentConfig.fallback_models || agentConfig.fallback || merged[normalizedKey].fallback;
        merged[normalizedKey].isDefault = false;
        merged[normalizedKey].configPath = config.path;
        merged[normalizedKey].isCategory = isCategories || merged[normalizedKey].isCategory;
        merged[normalizedKey].key = agentKey;
      } else {
        merged[normalizedKey] = {
          key: agentKey,
          model: agentConfig.model,
          fallback: agentConfig.fallback_models || agentConfig.fallback || [],
          role: isCategories ? "category" : "custom",
          isDefault: false,
          configPath: config.path,
          isCategory: isCategories,
        };
      }
    }
  }
  return merged;
}

  async function saveConfig(target, document) {
    const commentJson = await import("comment-json");
    const currentPath = target.path;
    const raw = await Bun.file(currentPath).text();
    const currentDoc = commentJson.parse(raw);
    const nextDoc = commentJson.assign(currentDoc, document);
    const backup = `${currentPath}.bak.${Date.now()}`;
    await Bun.write(backup, raw);
    const content = commentJson.stringify(nextDoc, null, 2) + "\n";
    await Bun.write(currentPath, content);
    return { backup, path: currentPath };
  }

async function reloadAgents() {
  try {
    await api.client.instance.dispose({});
    return true;
  } catch {
    return false;
  }
}

  function showAgentList(api, loadedConfigs, returnIndex) {
    const Select = api.ui.DialogSelect;
    const s = skin();
    const mergedAgents = mergeWithDefaults(loadedConfigs);

  const options = [];
  for (const [agentKey, agent] of Object.entries(mergedAgents)) {
    const displayName = agent.key || agentKey;
    const model = agent.model ? shortenModel(agent.model) : "default";
    const fallbackDisplay = Array.isArray(agent.fallback)
      ? agent.fallback.slice(0, 2).join(" → ") + (agent.fallback.length > 2 ? " ..." : "")
      : (agent.fallback || "—");
    const statusIcon = agent.model ? "●" : "○";
    const sourceTag = agent.isDefault ? "default" : (agent.configPath?.includes(".config") ? "global" : "local");
    const roleTag = agent.role || "agent";

    options.push({
      title: `${statusIcon} ${displayName}`,
      value: { agentKey, agent, mergedAgents },
      description: `${model} → ${fallbackDisplay}`,
      footer: `${sourceTag}:${roleTag}`,
    });
  }

    if (options.length === 0) {
      api.ui.dialog.replace(() => (
        <box flexDirection="column" gap={1} padding={1}>
          <text fg={s.warning} bold={true}>No Agents Found</text>
          <text fg={s.muted}>This should not happen - defaults should show.</text>
        </box>
      ));
      return;
    }

    api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title="Agent Manager"
      options={options}
      current={returnIndex && returnIndex[0] !== undefined ? returnIndex[0] : undefined}
      placeholder="↓/↑ navigate · Enter edit · r reload"
      onSelect={(item) => {
        if (item && item.value) {
          if (returnIndex) returnIndex[0] = options.indexOf(item);
          showAgentDetail(api, loadedConfigs, item.value.agentKey, item.value.agent, item.value.mergedAgents, returnIndex);
        }
      }}
    />
  ));
}

function showAgentDetail(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const s = skin();
  const displayName = agent.key || agentKey;
  const model = agent.model ? modelBadge(agent.model) : "default";
  const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];
  const fallbackPreview = fallbackArr.length > 0 ? fallbackArr.slice(0, 3).join(" → ") + (fallbackArr.length > 3 ? " ..." : "") : "none";
  const sourceTag = agent.isDefault ? "default" : (agent.configPath?.includes(".config") ? "global" : "local");
  const statusIcon = agent.model ? "●" : "○";
  const statusColor = agent.model ? s.success : s.muted;
  const roleInfo = agent.role || "";

  const options = [
    {
      title: `Model: ${model}`,
      value: { action: "editModel" },
      description: "Press Enter to change the primary model",
      footer: "primary"
    },
    {
      title: `Fallbacks (${fallbackArr.length}): ${fallbackPreview}`,
      value: { action: "manageFallbacks" },
      description: "Press Enter to add/edit/remove fallback models",
      footer: "chain"
    },
    {
      title: "Reload from server",
      value: { action: "reload" },
      description: "Refresh agent configuration from OpenCode",
      footer: "refresh"
    },
    {
      title: "← Back to list",
      value: { action: "back" },
      description: "Return to agent list",
      footer: "esc"
    },
  ];

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title={`${statusIcon} ${displayName} ${roleInfo ? `(${roleInfo})` : ""}`}
      rows={options}
      placeholder="↑/↓ navigate · Enter to select"
      onValueChange={(item) => {
        if (!item || !item.value) return;
        const { action } = item.value;
        if (action === "editModel") {
          // Defer to next event loop tick - dialog system needs to finish processing
          // the current selection before we can replace the dialog
          setImmediate(() => {
            try {
              editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
            } catch (e) {
              console.error("editModel error:", e);
              api.ui.toast({ variant: "error", message: `editModel error: ${e.message}` });
            }
          });
        } else if (action === "manageFallbacks") {
          showFallbackManager(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else if (action === "reload") {
          reloadAgents();
          api.ui.toast({ variant: "success", message: "Agents reloaded" });
        } else if (action === "back") {
          showAgentList(api, loadedConfigs, returnIndex);
        }
      }}
    />
  ));
}

function editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const s = skin();
  const currentModel = agent.model ? modelBadge(agent.model) : "";

  // Step 1: Show providers
  const providers = api.state.provider || [];
  const providerArr = Array.isArray(providers) ? providers : Object.values(providers || {});
  console.log("editModel: providers count =", providerArr.length);

  if (providerArr.length === 0) {
    showCustomModelPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
    return;
  }

  const providerOptions = [];
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
    });
  }

  providerOptions.push({
    title: "Show all models (all providers)",
    value: { action: "showAll" },
    description: "Browse every available model",
    footer: "all",
  });

  providerOptions.push({
    title: "Type custom model",
    value: { action: "custom" },
    description: "Enter a model ID manually",
    footer: "custom",
  });

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title={`Select Provider — ${agentKey}`}
      rows={providerOptions}
      placeholder="↑/↓ navigate · Enter select"
      onValueChange={(item) => {
        if (!item || !item.value) return;
        const { action, providerId, provider } = item.value;
        if (action === "selectProvider") {
          showModelsForProvider(api, loadedConfigs, agentKey, agent, provider, mergedAgents, returnIndex);
        } else if (action === "showAll") {
          showAllModels(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else if (action === "custom") {
          showCustomModelPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        }
      }}
    />
  ));
}

function showModelsForProvider(api, loadedConfigs, agentKey, agent, provider, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const pid = provider.id || provider.name || "unknown";

  const options = buildModelOptions([provider], agent.model);

  options.unshift({
    title: "← Back to providers",
    value: { action: "back" },
    description: `Return to provider list`,
    footer: "back",
  });

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title={`Models — ${pid} — ${agentKey}`}
      rows={options}
      placeholder="↑/↓ navigate · Enter select"
      onValueChange={(item) => {
        if (!item || !item.value) return;
        if (item.value.action === "back") {
          editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else {
          // Construct full model ID: "provider/model-name" format used by OpenCode
          const fullModelId = `${item.value.provider}/${item.value.model}`;
          saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, model: fullModelId }, returnIndex);
        }
      }}
    />
  ));
}

function showAllModels(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const providers = api.state.provider || [];

  const options = buildModelOptions(providers, agent.model);

  options.unshift({
    title: "← Back to providers",
    value: { action: "back" },
    description: "Return to provider list",
    footer: "back",
  });

  api.ui.dialog.setSize("xlarge");
  api.ui.dialog.replace(() => (
    <Select
      title={`All Models — ${agentKey}`}
      rows={options}
      placeholder="↑/↓ navigate · Enter select"
      onValueChange={(item) => {
        if (!item || !item.value) return;
        if (item.value.action === "back") {
          editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else {
          const fullModelId = `${item.value.provider}/${item.value.model}`;
          saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, model: fullModelId }, returnIndex);
        }
      }}
    />
  ));
}

function showCustomModelPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Prompt = api.ui.DialogPrompt;
  const s = skin();
  const currentModel = agent.model ? modelBadge(agent.model) : "";

  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => (
    <Prompt
      title={`Custom Model — ${agentKey}`}
      value={currentModel}
      placeholder="provider/model-id"
      onConfirm={async (value) => {
        if (!value || !value.trim()) {
          editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
          return;
        }
        const newModel = value.trim();
        await saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, model: newModel }, returnIndex);
      }}
      onCancel={() => editModel(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex)}
    />
  ));
}

function showFallbackManager(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const Prompt = api.ui.DialogPrompt;
  const s = skin();
  const fallbackArr = Array.isArray(agent.fallback) ? agent.fallback : [];

  const options = [
    { title: "Add new fallback", value: { action: "add" }, description: "Add a model to the fallback chain" },
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
      title={`Fallback Chain — ${agentKey}`}
      options={options}
      placeholder="Select action"
      onSelect={(item) => {
        const { action, index, value } = item.value;
        if (action === "add") {
          showAddFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else if (action === "edit") {
          showEditFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, value);
        } else if (action === "remove") {
          const newFallbacks = fallbackArr.slice(0, -1);
          saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, returnIndex, () => {
            showFallbackManager(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, mergedAgents, returnIndex);
          });
        } else if (action === "back") {
          showAgentDetail(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        }
      }}
    />
  ));
}

function showAddFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Select = api.ui.DialogSelect;
  const s = skin();
  const rawProviders = api.state.provider;
  const providers = Array.isArray(rawProviders) ? rawProviders : (rawProviders ? Object.values(rawProviders) : []);

  const options = [
    { title: "✏ Type custom model", value: { model: "__custom__" }, description: "Enter a model ID manually", footer: "custom" },
    ...buildModelOptions(providers, undefined)  // no current highlight for fallbacks
  ];

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title={`Add Fallback — ${agentKey}`}
      options={options}
      placeholder="↑/↓ navigate · Enter select"
      onSelect={(item) => {
        if (item.value.model === "__custom__") {
          showCustomFallbackPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
        } else {
          const currentFallbacks = Array.isArray(agent.fallback) ? agent.fallback : [];
          const fullModelId = `${item.value.provider}/${item.value.model}`;
          const newFallbacks = [...currentFallbacks, fullModelId];
          saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, returnIndex, () => {
            showFallbackManager(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, mergedAgents, returnIndex);
          });
        }
      }}
    />
  ));
}

function showCustomFallbackPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex) {
  const Prompt = api.ui.DialogPrompt;
  const s = skin();

  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => (
    <Prompt
      title={`Custom Fallback — ${agentKey}`}
      value=""
      placeholder="provider/model-id"
      onConfirm={async (value) => {
        if (!value || !value.trim()) {
          showAddFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex);
          return;
        }
        const newModel = value.trim();
        const currentFallbacks = Array.isArray(agent.fallback) ? agent.fallback : [];
        const newFallbacks = [...currentFallbacks, newModel];
        saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, returnIndex, () => {
          showFallbackManager(api, loadedConfigs, agentKey, { ...agent, fallback: newFallbacks }, mergedAgents, returnIndex);
        });
      }}
      onCancel={() => showAddFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex)}
    />
  ));
}

function showEditFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, currentValue) {
  const Select = api.ui.DialogSelect;
  const s = skin();
  const rawProviders = api.state.provider;
  const providers = Array.isArray(rawProviders) ? rawProviders : (rawProviders ? Object.values(rawProviders) : []);

  const options = [
    { title: "✏ Type custom model", value: { model: "__custom__" }, description: "Enter a model ID manually", footer: "custom" },
    ...buildModelOptions(providers, currentValue)  // highlight current fallback
  ];

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => (
    <Select
      title={`Edit Fallback ${index + 1} — ${agentKey}`}
      options={options}
      placeholder="↑/↓ navigate · Enter select"
      onSelect={(item) => {
        if (item.value.model === "__custom__") {
          showEditFallbackPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, currentValue);
        } else {
          const currentFallbacks = Array.isArray(agent.fallback) ? [...agent.fallback] : [];
          const fullModelId = `${item.value.provider}/${item.value.model}`;
          currentFallbacks[index] = fullModelId;
          saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, fallback: currentFallbacks }, returnIndex, () => {
            showFallbackManager(api, loadedConfigs, agentKey, { ...agent, fallback: currentFallbacks }, mergedAgents, returnIndex);
          });
        }
      }}
    />
  ));
}

function showEditFallbackPrompt(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, currentValue) {
  const Prompt = api.ui.DialogPrompt;
  const s = skin();

  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => (
    <Prompt
      title={`Edit Fallback ${index + 1} — ${agentKey}`}
      value={currentValue}
      placeholder="provider/model-id"
      onConfirm={async (value) => {
        if (!value || !value.trim()) {
          showEditFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, currentValue);
          return;
        }
        const newModel = value.trim();
        const currentFallbacks = Array.isArray(agent.fallback) ? [...agent.fallback] : [];
        currentFallbacks[index] = newModel;
        saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, fallback: currentFallbacks }, returnIndex, () => {
          showFallbackManager(api, loadedConfigs, agentKey, { ...agent, fallback: currentFallbacks }, mergedAgents, returnIndex);
        });
      }}
      onCancel={() => showEditFallback(api, loadedConfigs, agentKey, agent, mergedAgents, returnIndex, index, currentValue)}
    />
  ));
}

async function saveAgentConfig(api, loadedConfigs, agentKey, newAgent, returnIndex, onSuccess) {
  let configPath = newAgent.configPath;
  
  if (!configPath) {
    const userConfig = loadedConfigs.find(c => c.config.path.includes(".config"));
    const projectConfig = loadedConfigs.find(c => !c.config.path.includes(".config"));
    configPath = (userConfig || projectConfig)?.config?.path;
  }
  
  if (!configPath) {
    api.ui.toast({ variant: "error", message: "No config file found. Please create a config file first." });
    return;
  }

  const configEntry = loadedConfigs.find(c => c.config.path === configPath);
  if (!configEntry) {
    api.ui.toast({ variant: "error", message: "Config not found" });
    return;
  }

  const isCategory = newAgent.isCategory || configEntry.isCategories;
  const sectionKey = isCategory ? "categories" : "agents";

  api.ui.toast({ variant: "info", message: `Saving ${agentKey} to ${sectionKey}...` });
  
  try {
    const existingSection = configEntry.document[sectionKey] || {};
    const updatedSection = { ...existingSection };
    
    if (newAgent.model) {
      updatedSection[agentKey] = { 
        ...updatedSection[agentKey],
        model: newAgent.model 
      };
    }
    if (newAgent.fallback !== undefined) {
      updatedSection[agentKey] = { 
        ...updatedSection[agentKey],
        fallback_models: newAgent.fallback 
      };
    }
    
    const updated = { ...configEntry.document, [sectionKey]: updatedSection };
    
    await saveConfig(configEntry.config, updated);
    await reloadAgents();
    api.ui.toast({ variant: "success", message: `Saved ${agentKey}` });

    const reloaded = await loadAllConfigs(api.state.path.directory || process.cwd());
    const newMerged = mergeWithDefaults(reloaded);

    if (onSuccess) {
      onSuccess();
    } else {
      showAgentDetail(api, reloaded, agentKey, newMerged[agentKey], newMerged, returnIndex);
    }
  } catch (e) {
    api.ui.toast({ variant: "error", message: `Save failed: ${e.message}` });
  }
}

async function showAgentManager(api) {
  const cwd = api.state.path.directory || process.cwd();
  api.ui.toast({ variant: "info", message: `Loading configs from ${cwd}...` });
  const loadedConfigs = await loadAllConfigs(cwd);
  api.ui.toast({ variant: "info", message: `Found ${loadedConfigs.length} config(s)` });
  const returnIndex = [0];
  showAgentList(api, loadedConfigs, returnIndex);
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
