/**
 * Subagent validation pipeline for agent configuration analysis.
 *
 * Runs a 5-agent pipeline to analyze OpenCode configurations:
 * 1. **ConfigDiscovery**: Counts agents and categories
 * 2. **SystemExplanation**: Explains agent roles and fallback chains
 * 3. **ConfigValidation**: Checks hook names and permission values
 * 4. **OrchestrationReview**: Analyzes Sisyphus/background task settings
 * 5. **InstructionFollowReview**: Detects DRY violations in prompt_append
 *
 * @module
 */
import type { AgentManagerDocument, ConfigSummary } from "./types.js";
/**
 * Context object for subagent validation pipeline.
 */
export interface SubAgentContext {
    config: AgentManagerDocument;
    summary: ConfigSummary;
    source: string;
}
/**
 * Result from a single subagent validation check.
 */
export interface SubAgentResult {
    name: string;
    status: "success" | "warning" | "error";
    message: string;
    details?: unknown;
}
/**
 * Runs the complete 5-agent validation pipeline.
 *
 * Analyzes a config document through five validation stages:
 * - ConfigDiscovery: Identifies agents and categories
 * - SystemExplanation: Explains fallback chains
 * - ConfigValidation: Validates hooks and permissions
 * - OrchestrationReview: Checks orchestration settings
 * - InstructionFollowReview: Detects prompt_append duplicates
 *
 * @param context - Pipeline context with config and summary
 * @returns Array of results from each validation stage
 *
 * @example
 * ```typescript
 * const results = runSubAgentPipeline({
 *   config: document,
 *   summary: configSummary,
 *   source: 'project'
 * });
 * ```
 */
export declare const runSubAgentPipeline: (context: SubAgentContext) => SubAgentResult[];
/**
 * Discovery agent - identifies and counts agents/categories in config.
 *
 * @param context - Pipeline context
 * @returns Discovery result with agent and category counts
 */
export declare const discoveryAgent: (context: SubAgentContext) => SubAgentResult;
/**
 * System explanation agent - describes agent roles and fallback chains.
 *
 * @param context - Pipeline context
 * @returns System explanation with Oh My OpenCode agent details
 */
export declare const systemExplanationAgent: (context: SubAgentContext) => SubAgentResult;
/**
 * Validates agent permissions against known permission fields and values.
 *
 * Checks that each agent's permission object has valid keys and values.
 * Permission fields must be one of: edit, bash, read, write, webfetch, doom_loop,
 * external_directory. Permission values must be one of: ask, allow, deny.
 *
 * @param agents - Record of agent configurations
 * @returns Array of validation error messages (empty if valid)
 */
export declare const validateAgentPermissions: (agents: Record<string, unknown> | null | undefined) => string[];
/**
 * Validation agent - checks config structure and values.
 *
 * Validates:
 * - Hook names are known (from KNOWN_HOOKS list)
 * - Agent permissions have valid keys and values
 * - Arrays contain only expected types
 *
 * @param context - Pipeline context
 * @returns Validation result with any found issues
 */
export declare const validationAgent: (context: SubAgentContext) => SubAgentResult;
/**
 * Orchestration review agent - analyzes Sisyphus and background task settings.
 *
 * @param context - Pipeline context
 * @returns Orchestration review with Sisyphus/background_task status
 */
export declare const orchestrationAgent: (context: SubAgentContext) => SubAgentResult;
/**
 * Finds agents with duplicate prompt_append values.
 *
 * Helps identify DRY violations where multiple agents use the same
 * prompt_append value. Consider using shared categories instead.
 *
 * @param agents - Record of agent configurations
 * @returns Array of agent names that share prompt_append values
 */
export declare const findPromptAppendDuplicates: (agents: Record<string, unknown> | null | undefined) => string[];
/**
 * Instruction follow agent - checks for DRY violations in prompt configuration.
 *
 * @param context - Pipeline context
 * @returns Instruction follow review with any found issues
 */
export declare const instructionFollowAgent: (context: SubAgentContext) => SubAgentResult;
//# sourceMappingURL=subagent.d.ts.map