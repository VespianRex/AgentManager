export { AGENT_PERMISSION_FIELDS } from "./hooks.js";
/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export declare const OH_MY_OPENCODE_AGENTS: Record<string, import("./agent-metadata.js").AgentMetadata>;
/**
 * @deprecated Import from agent-metadata.ts instead. Kept for backward compatibility.
 */
export declare const DEFAULT_FALLBACK_CHAINS: Record<string, string[]>;
/**
 * @deprecated Import getCategoryChains from agent-metadata.ts instead.
 * Kept for backward compatibility - now derives from AGENT_REGISTRY.
 */
export declare const CATEGORY_PARENT_FALLBACK: Record<string, string[]>;
/**
 * @deprecated Use individual diagram functions directly. This function is kept for
 * backward compatibility but is no longer called by production code.
 * @returns System overview with agents, fallback chains, and permissions
 */
export declare const getSystemOverview: () => {
    agents: Record<string, import("./agent-metadata.js").AgentMetadata>;
    fallbackChains: Record<string, string[]>;
    categoryChains: Record<string, string[]>;
    permissions: readonly ["edit", "bash", "read", "write", "webfetch", "doom_loop", "external_directory"];
};
/**
 * Generates a text diagram of the orchestration flow.
 *
 * Shows how user prompts flow through Prometheus (planner) to
 * Sisyphus (orchestrator) and then to subagents and background agents.
 *
 * @returns ASCII diagram of orchestration flow
 */
export declare const getOrchestrationDiagram: () => string;
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
export declare const getFallbackDiagram: () => string;
//# sourceMappingURL=agentSystem.d.ts.map