import { getOhMyOpenCodeAgents, getAllFallbackChains } from "./agent-metadata.js";
/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export const OH_MY_OPENCODE_AGENTS = getOhMyOpenCodeAgents();
/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export const DEFAULT_FALLBACK_CHAINS = getAllFallbackChains();
export const CATEGORY_PARENT_FALLBACK = {
    "visual-engineering": ["google", "openai", "anthropic", "github-copilot", "opencode"],
    ultrabrain: ["openai", "anthropic", "google", "github-copilot", "opencode"],
    artistry: ["google", "openai", "anthropic", "github-copilot", "opencode"],
    quick: ["anthropic", "github-copilot", "opencode", "antigravity", "google"],
};
export const AGENT_PERMISSION_FIELDS = ["edit", "bash", "webfetch", "doom_loop", "external_directory"];
export const getSystemOverview = () => {
    return {
        agents: OH_MY_OPENCODE_AGENTS,
        fallbackChains: DEFAULT_FALLBACK_CHAINS,
        categoryChains: CATEGORY_PARENT_FALLBACK,
        permissions: AGENT_PERMISSION_FIELDS,
    };
};
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
