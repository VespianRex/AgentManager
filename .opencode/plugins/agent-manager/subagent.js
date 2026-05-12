import { isString, isPlainObject } from "./types.js";
import { getOhMyOpenCodeAgents, getAllFallbackChains, getCategoryChains } from "./agent-metadata.js";
import { AGENT_PERMISSION_FIELDS, KNOWN_HOOKS, PERMISSION_VALUES } from "./hooks.js";
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
export const runSubAgentPipeline = (context) => {
    const safeContext = {
        ...context,
        config: (context.config ?? {}),
    };
    const results = [];
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
export const discoveryAgent = (context) => {
    const { summary, source } = context;
    return {
        name: "ConfigDiscovery",
        status: "success",
        message: `Found ${summary.agentCount} agents and ${summary.categories} categories in ${source} config.`,
        details: summary,
    };
};
const getConfigRecord = (config) => isPlainObject(config) ? config : {};
const readStringArrayField = (value, fieldName, typeProblems) => {
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
const readObjectField = (value, fieldName, typeProblems) => {
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
export const systemExplanationAgent = (context) => {
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
export const validateAgentPermissions = (agents) => {
    if (!isPlainObject(agents))
        return [];
    const issues = [];
    const knownPermissionKeys = new Set(AGENT_PERMISSION_FIELDS);
    const permissionValues = new Set(PERMISSION_VALUES);
    for (const [name, agent] of Object.entries(agents)) {
        const agentObj = agent;
        if (!agentObj)
            continue;
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
export const validationAgent = (context) => {
    const config = getConfigRecord(context.config);
    const typeProblems = [];
    const foundHooks = readStringArrayField(config.disabled_hooks, "disabled_hooks", typeProblems);
    readStringArrayField(config.disabled_agents, "disabled_agents", typeProblems);
    readStringArrayField(config.disabled_skills, "disabled_skills", typeProblems);
    const agents = readObjectField(config.agents, "agents", typeProblems);
    const invalidHooks = foundHooks.filter((hook) => !KNOWN_HOOKS.includes(hook));
    const permissionProblems = validateAgentPermissions(agents);
    const messages = [];
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
export const orchestrationAgent = (context) => {
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
export const findPromptAppendDuplicates = (agents) => {
    if (!isPlainObject(agents))
        return [];
    const duplicates = [];
    const promptAppends = new Map();
    for (const [name, agent] of Object.entries(agents)) {
        const agentObj = agent;
        if (!agentObj)
            continue;
        const promptAppend = agentObj.prompt_append;
        if (isString(promptAppend)) {
            if (promptAppends.has(promptAppend)) {
                duplicates.push(name);
            }
            else {
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
export const instructionFollowAgent = (context) => {
    const config = getConfigRecord(context.config);
    const duplicates = findPromptAppendDuplicates(config.agents ?? {});
    const issues = [];
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
//# sourceMappingURL=subagent.js.map