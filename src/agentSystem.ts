/**
 * Agent system configuration and diagram generation.
 *
 * Re-exports from agent-metadata.ts for backward compatibility.
 * Provides orchestration and fallback chain diagrams for visualization.
 *
 * @deprecated Import from agent-metadata.ts for new code.
 * @module
 */
import { AGENT_REGISTRY, getOhMyOpenCodeAgents, getAllFallbackChains, getCategoryChains } from "./agent-metadata.js";
import { AGENT_PERMISSION_FIELDS } from "./hooks.js";
export { AGENT_PERMISSION_FIELDS } from "./hooks.js";

/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export const OH_MY_OPENCODE_AGENTS = getOhMyOpenCodeAgents();

/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export const DEFAULT_FALLBACK_CHAINS = getAllFallbackChains();

/**
 * @deprecated Import getCategoryChains from agent-metadata.ts instead.
 * Kept for backward compatibility - now derives from AGENT_REGISTRY.
 */
export const CATEGORY_PARENT_FALLBACK = getCategoryChains();

/**
 * @deprecated Use individual diagram functions directly. This function is kept for
 * backward compatibility but is no longer called by production code.
 * @returns System overview with agents, fallback chains, and permissions
 */
export const getSystemOverview = () => {
  return {
    agents: OH_MY_OPENCODE_AGENTS,
    fallbackChains: DEFAULT_FALLBACK_CHAINS,
    categoryChains: getCategoryChains(),
    permissions: AGENT_PERMISSION_FIELDS,
  };
};

/**
 * Generates a text diagram of the orchestration flow.
 *
 * Shows how user prompts flow through Prometheus (planner) to
 * Sisyphus (orchestrator) and then to subagents and background agents.
 *
 * @returns ASCII diagram of orchestration flow
 */
export const getOrchestrationDiagram = () => {
  return `
User prompt --> Prometheus (planner) --> Sisyphus (orchestrator)
                           |                 |      \
                           |                 v       \
                           |            Subagents    Background agents
                           |            (atomic tasks)  (search, docs, scans)
                           v
                 Task context injector / prompt append
`;
};

/**
 * Generates a text diagram of the model fallback resolution flow.
 *
 * Shows the priority order for model resolution:
 * 1. User override in oh-my-opencode.json
 * 2. Provider fallback chain for agent/category
 * 3. System default when no provider matches
 *
 * @returns ASCII diagram of fallback resolution
 */
export const getFallbackDiagram = () => {
  return `
Model resolution flow:
  1. User override in oh-my-opencode.json
  2. Provider fallback chain for agent/category
  3. System default when no provider matches

Example for Sisyphus:
  anthropic -> github-copilot -> opencode -> antigravity -> google
`;
};
