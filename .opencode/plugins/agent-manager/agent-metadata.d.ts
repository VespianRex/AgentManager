/**
 * Single source of truth for all agent metadata.
 * Merged from agentSystem.ts and tui-helpers.ts to eliminate DRY violation.
 */
import type { UniqueModelIntricacies } from "./model-metadata.js";
export interface AgentMetadata {
    role: string;
    description: string;
    /**
     * Detailed help text explaining the agent's purpose, how it works,
     * how it interacts with other agents, and whether it can call sub-agents.
     * Displayed in the TUI detail pane on hover or selection.
     */
    helpText: string;
    /**
     * Practical usage tips for the agent.
     * Displayed below helpText in the TUI detail pane.
     */
    tips: string[];
    fallback: string[];
    context_window_size: number;
    recommended_top_k: number;
    recommended_top_p: number;
    prompting_style_guidelines: string;
    unique_model_intricacies: UniqueModelIntricacies;
}
export declare const AGENT_REGISTRY: Record<string, AgentMetadata>;
/**
 * Get all Oh My OpenCode agents (core orchestration agents).
 */
export declare function getOhMyOpenCodeAgents(): Record<string, AgentMetadata>;
/**
 * Get Task Master agents (category-based agents for task classification).
 */
export declare function getTaskMasterAgents(): Record<string, AgentMetadata>;
/**
 * Get fallback chains for all agents as a simple record.
 * Backward compatibility helper.
 */
export declare function getAllFallbackChains(): Record<string, string[]>;
/**
 * Get fallback chains for category agents only.
 * Derives from AGENT_REGISTRY to avoid DRY violation with hardcoded duplicates.
 */
export declare function getCategoryChains(): Record<string, string[]>;
//# sourceMappingURL=agent-metadata.d.ts.map