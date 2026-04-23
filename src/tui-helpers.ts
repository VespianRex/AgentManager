import { AGENT_REGISTRY } from "./agent-metadata.js";

function buildDefaultAgents(): Record<string, { role: string; description: string }> {
  const result: Record<string, { role: string; description: string }> = {};
  for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
    result[key.toLowerCase()] = {
      role: metadata.role,
      description: metadata.description,
    };
  }
  return result;
}

function buildDefaultFallbacks(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, metadata] of Object.entries(AGENT_REGISTRY)) {
    result[key.toLowerCase()] = metadata.fallback;
  }
  return result;
}

export const DEFAULT_AGENTS = buildDefaultAgents();

export const DEFAULT_FALLBACKS = buildDefaultFallbacks();

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
  description?: string;
  isDefault: boolean;
  configPath?: string;
  isCategory?: boolean;
}

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
      description: info.description,
      isDefault: true,
    };
  }

  for (const { config, agents, isCategories } of loadedConfigs) {
    for (const [agentKey, agentConfig] of Object.entries(agents)) {
      if (agentKey === "false" || agentKey === "true") continue;

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
          isDefault: false,
          configPath: config.path,
          isCategory: isCategories,
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
