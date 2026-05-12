/**
 * UI helper functions and types for the TUI plugin.
 *
 * Provides agent data transformation, default merging, model formatting,
 * and agent update construction used by the TUI for displaying and editing agent configurations.
 */
import { AGENT_REGISTRY } from "./agent-metadata.js";

export interface AgentConfig {
  model?: string | { name?: string; model?: string };
  fallback_models?: string[];
  fallback?: string[];
}

export interface LoadedConfig {
  config: { path: string; source: string };
  agents: Record<string, AgentConfig>;
  document: Record<string, unknown>;
  isCategories?: boolean;
}

export interface MergedAgent {
  key: string;
  model: string | null;
  fallback: string[];
  role: string;
  roleCode: string;
  description?: string;
  helpText?: string;
  tips?: string[];
  isDefault: boolean;
  configPath?: string;
  isCategory?: boolean;
}

const ROLE_CODE_MAP: Record<string, string> = {
  "main orchestrator": "[O]",
  "master orchestrator": "[O]",
  "autonomous deep worker": "[A]",
  planner: "[P]",
  "plan consultant": "[V]",
  explorer: "[X]",
  "fast codebase exploration": "[X]",
  "debugging and architecture expert": "[D]",
  researcher: "[R]",
  "research and documentation": "[R]",
  critic: "[C]",
  "visual and UI inspection": "[U]",
  visual: "[U]",
  frontend: "[F]",
  solver: "[S]",
  logic: "[L]",
  creative: "[*]",
  trivial: "[+]",
  misc: "[?]",
  category: "[#]",
  custom: "[*]",
};

export function getRoleCode(role: string): string {
  return ROLE_CODE_MAP[role] || "[*]";
}

const buildFromRegistry = <T>(extract: (metadata: { role: string; description: string; fallback: string[]; helpText: string; tips: string[] }) => T): Record<string, T> => {
  const result: Record<string, T> = {};
  for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
    result[key.toLowerCase()] = extract(metadata);
  }
  return result;
};

const buildDefaultAgents = (): Record<string, { role: string; description: string }> =>
  buildFromRegistry((m) => ({ role: m.role, description: m.description }));

const buildDefaultFallbacks = (): Record<string, string[]> =>
  buildFromRegistry((m) => m.fallback);

const buildDefaultHelpTexts = (): Record<string, string> =>
  buildFromRegistry((m) => m.helpText);

const buildDefaultTips = (): Record<string, string[]> =>
  buildFromRegistry((m) => m.tips);

export const DEFAULT_AGENTS = buildDefaultAgents();
export const DEFAULT_FALLBACKS = buildDefaultFallbacks();
export const DEFAULT_HELP_TEXTS = buildDefaultHelpTexts();
export const DEFAULT_TIPS = buildDefaultTips();

export function modelBadge(model: unknown): string {
  if (!model) return "unset";
  if (typeof model === "string") return model;
  if (typeof model === "object" && model !== null) {
    const m = model as { name?: string; model?: string };
    return m.name || m.model || "unknown";
  }
  return "unknown";
}

export function shortenModel(model: unknown): string {
  const full = modelBadge(model);
  const parts = full.split("/");
  if (parts.length > 2) return parts.slice(-2).join("/");
  return full;
}

export function mergeWithDefaults(loadedConfigs: LoadedConfig[]): Record<string, MergedAgent> {
  const merged: Record<string, MergedAgent> = {};

  for (const [agentKey, info] of Object.entries(DEFAULT_AGENTS)) {
    merged[agentKey.toLowerCase()] = {
      key: agentKey,
      model: null,
      fallback: DEFAULT_FALLBACKS[agentKey] || [],
      role: info.role,
      roleCode: getRoleCode(info.role),
      description: info.description,
      helpText: DEFAULT_HELP_TEXTS[agentKey] || "",
      tips: DEFAULT_TIPS[agentKey] || [],
      isDefault: true,
    };
  }

  for (const { config, agents, isCategories } of loadedConfigs) {
    for (const [agentKey, agentConfig] of Object.entries(agents)) {
      // KISS: Normalize key for lookup, preserve original for display
      const normalizedKey = agentKey.toLowerCase();

      if (merged[normalizedKey]) {
        merged[normalizedKey].model = agentConfig.model ? modelBadge(agentConfig.model) : merged[normalizedKey].model;
        merged[normalizedKey].fallback = agentConfig.fallback_models || agentConfig.fallback || merged[normalizedKey].fallback;
        merged[normalizedKey].isDefault = false;
        merged[normalizedKey].configPath = config.path;
        merged[normalizedKey].isCategory = isCategories || merged[normalizedKey].isCategory;
        merged[normalizedKey].key = agentKey;
      } else {
        merged[normalizedKey] = {
          key: agentKey,
          model: agentConfig.model ? modelBadge(agentConfig.model) : null,
          fallback: agentConfig.fallback_models || agentConfig.fallback || [],
          role: isCategories ? "category" : "custom",
          roleCode: getRoleCode(isCategories ? "category" : "custom"),
          isDefault: false,
          configPath: config.path,
          isCategory: isCategories,
          helpText: isCategories ? `Category agent for ${agentKey} tasks. Routes to the appropriate model based on the oh-my-openagent category configuration.` : `Custom agent "${agentKey}" defined in user configuration.`,
          tips: isCategories ? ["Configured via the categories section of oh-my-openagent", "Model and routing determined by category definition"] : ["Custom agent — behavior depends on its model and system prompt configuration"],
        };
      }
    }
  }

  return merged;
}

export function determineSectionKey(agent: MergedAgent, configEntry: LoadedConfig): "agents" | "categories" {
  const isCategory = agent.isCategory || configEntry.isCategories;
  return isCategory ? "categories" : "agents";
}

export function buildAgentUpdate(
  existingSection: Record<string, AgentConfig>,
  agentKey: string,
  newAgent: { model?: string; fallback?: string[] }
): Record<string, AgentConfig> {
  const updated = { ...existingSection };
  updated[agentKey] = {
    ...updated[agentKey],
    ...(newAgent.model !== undefined && { model: newAgent.model }),
    ...(newAgent.fallback !== undefined && { fallback_models: newAgent.fallback }),
  };
  return updated;
}
