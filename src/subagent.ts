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
import { isString, isPlainObject } from "./types.js";
import { getOhMyOpenCodeAgents, getAllFallbackChains, getCategoryChains } from "./agent-metadata.js";
import { AGENT_PERMISSION_FIELDS, KNOWN_HOOKS, PERMISSION_VALUES } from "./hooks.js";

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
export const runSubAgentPipeline = (context: SubAgentContext): SubAgentResult[] => {
  const safeContext = {
    ...context,
    config: (context.config ?? {}) as AgentManagerDocument,
  };
  const results: SubAgentResult[] = [];
  results.push(discoveryAgent(safeContext));
  results.push(systemExplanationAgent(safeContext));
  results.push(validationAgent(safeContext));
  results.push(orchestrationAgent(safeContext));
  results.push(instructionFollowAgent(safeContext));
  return results;
};

/**
 * Discovery agent - identifies and counts agents/categories in config.
 *
 * @param context - Pipeline context
 * @returns Discovery result with agent and category counts
 */
export const discoveryAgent = (context: SubAgentContext): SubAgentResult => {
  const { summary, source } = context;
  return {
    name: "ConfigDiscovery",
    status: "success",
    message: `Found ${summary.agentCount} agents and ${summary.categories} categories in ${source} config.`,
    details: summary,
  };
};

const getConfigRecord = (config: AgentManagerDocument | null | undefined): Record<string, unknown> =>
  isPlainObject(config) ? config : {};

const readStringArrayField = (
  value: unknown,
  fieldName: string,
  typeProblems: string[],
): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    typeProblems.push(`${fieldName} must be an array of strings.`);
    return [];
  }

  const strings = value.filter(isString);
  if (strings.length !== value.length) {
    typeProblems.push(`${fieldName} must be an array of strings.`);
  }
  return strings;
};

const readObjectField = (
  value: unknown,
  fieldName: string,
  typeProblems: string[],
): Record<string, unknown> => {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    typeProblems.push(`${fieldName} must be an object.`);
    return {};
  }
  return value;
};

/**
 * System explanation agent - describes agent roles and fallback chains.
 *
 * @param context - Pipeline context
 * @returns System explanation with Oh My OpenCode agent details
 */
export const systemExplanationAgent = (context: SubAgentContext): SubAgentResult => {
  const agents = getOhMyOpenCodeAgents();
  const fallbackChains = getAllFallbackChains();
  const categoryChains = getCategoryChains();
  const permissions = AGENT_PERMISSION_FIELDS;
  return {
    name: "SystemExplanation",
    status: "success",
    message: "Explained agent roles and fallback chains for Oh My OpenCode.",
    details: { agents, fallbackChains, categoryChains, permissions },
  };
};

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
export const validateAgentPermissions = (agents: Record<string, unknown> | null | undefined): string[] => {
  if (!isPlainObject(agents)) return [];

  const issues: string[] = [];
  const knownPermissionKeys = new Set<string>(AGENT_PERMISSION_FIELDS);
  const permissionValues = new Set<string>(PERMISSION_VALUES);

  for (const [name, agent] of Object.entries(agents)) {
    const agentObj = agent as Record<string, unknown> | undefined;
    if (!agentObj) continue;

    const permission = agentObj.permission;

    // FIX: Must be a plain object to iterate over permission keys
    // Falsy values (null, undefined, 0, false, "") should not crash
    if (!isPlainObject(permission)) {
      continue;
    }

    for (const [key, value] of Object.entries(permission)) {
      if (!knownPermissionKeys.has(key)) {
        continue;
      }

      if (isString(value)) {
        if (!permissionValues.has(value)) {
          issues.push(`Agent ${name} permission ${key} uses invalid value '${value}'.`);
        }
        continue;
      }

      if (value !== null && value !== undefined) {
        issues.push(`Agent ${name} permission ${key} uses invalid value '${value}'.`);
      }
    }
  }
  return issues;
};

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
export const validationAgent = (context: SubAgentContext): SubAgentResult => {
  const config = getConfigRecord(context.config);
  const typeProblems: string[] = [];
  const foundHooks = readStringArrayField(config.disabled_hooks, "disabled_hooks", typeProblems);
  readStringArrayField(config.disabled_agents, "disabled_agents", typeProblems);
  readStringArrayField(config.disabled_skills, "disabled_skills", typeProblems);
  const agents = readObjectField(config.agents, "agents", typeProblems);
  const invalidHooks = foundHooks.filter((hook) => !KNOWN_HOOKS.includes(hook));
  const permissionProblems = validateAgentPermissions(agents);

  const messages = [] as string[];
  if (invalidHooks.length) {
    messages.push(`Unknown hooks disabled: ${invalidHooks.join(", ")}.`);
  }
  if (permissionProblems.length) {
    messages.push(...permissionProblems);
  }
  if (typeProblems.length) {
    messages.push(...typeProblems);
  }

  return {
    name: "ConfigValidation",
    status: messages.length ? "warning" : "success",
    message: messages.length ? "Found validation issues." : "Configuration appears valid.",
    details: { invalidHooks, permissionProblems, typeProblems },
  };
};

/**
 * Orchestration review agent - analyzes Sisyphus and background task settings.
 *
 * @param context - Pipeline context
 * @returns Orchestration review with Sisyphus/background_task status
 */
export const orchestrationAgent = (context: SubAgentContext): SubAgentResult => {
  const config = getConfigRecord(context.config);
  const hasSisyphus = Boolean(config.sisyphus_agent);
  const hasBackground = Boolean(config.background_task);
  const clue = hasSisyphus && hasBackground
    ? "Subagent orchestration settings are present."
    : hasSisyphus
    ? "Sisyphus orchestrator is configured; background_task settings are missing."
    : "No Sisyphus orchestrator config found; default OpenCode orchestration applies.";

  return {
    name: "OrchestrationReview",
    status: "success",
    message: clue,
    details: {
      sisyphus: config.sisyphus_agent ?? null,
      background_task: config.background_task ?? null,
    },
  };
};

/**
 * Finds agents with duplicate prompt_append values.
 *
 * Helps identify DRY violations where multiple agents use the same
 * prompt_append value. Consider using shared categories instead.
 *
 * @param agents - Record of agent configurations
 * @returns Array of agent names that share prompt_append values
 */
export const findPromptAppendDuplicates = (agents: Record<string, unknown> | null | undefined): string[] => {
  if (!isPlainObject(agents)) return [];

  const duplicates: string[] = [];
  const promptAppends = new Map<string, string>();

  for (const [name, agent] of Object.entries(agents)) {
    const agentObj = agent as Record<string, unknown> | undefined;
    if (!agentObj) continue;

    const promptAppend = agentObj.prompt_append;
    if (isString(promptAppend)) {
      if (promptAppends.has(promptAppend)) {
        duplicates.push(name);
      } else {
        promptAppends.set(promptAppend, name);
      }
    }
  }
  return duplicates;
};

/**
 * Instruction follow agent - checks for DRY violations in prompt configuration.
 *
 * @param context - Pipeline context
 * @returns Instruction follow review with any found issues
 */
export const instructionFollowAgent = (context: SubAgentContext): SubAgentResult => {
  const config = getConfigRecord(context.config);
  const duplicates = findPromptAppendDuplicates((config.agents as Record<string, unknown>) ?? {});

  const issues = [] as string[];
  if (duplicates.length) {
    issues.push(`Detected repeated prompt_append values for agents: ${duplicates.join(", ")}. Consider using shared categories or a DRY prompt strategy.`);
  }

  return {
    name: "InstructionFollowReview",
    status: issues.length ? "warning" : "success",
    message: issues.length ? issues.join(" ") : "Agent instruction patterns appear consistent with KISS/DRY.",
    details: { promptAppendDuplicates: duplicates },
  };
};
