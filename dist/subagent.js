import { getSystemOverview } from "./agentSystem.js";
import { KNOWN_HOOKS, PERMISSION_VALUES } from "./hooks.js";
export const runSubAgentPipeline = (context) => {
    const results = [];
    results.push(discoveryAgent(context));
    results.push(systemExplanationAgent(context));
    results.push(validationAgent(context));
    results.push(orchestrationAgent(context));
    results.push(instructionFollowAgent(context));
    return results;
};
export const discoveryAgent = (context) => {
    const { summary, source } = context;
    return {
        name: "ConfigDiscovery",
        status: "success",
        message: `Found ${summary.agentCount} agents and ${summary.categories} categories in ${source} config.`,
        details: summary,
    };
};
export const systemExplanationAgent = (context) => {
    const { agents, fallbackChains, categoryChains, permissions } = getSystemOverview();
    return {
        name: "SystemExplanation",
        status: "success",
        message: "Explained agent roles and fallback chains for Oh My OpenCode.",
        details: { agents, fallbackChains, categoryChains, permissions },
    };
};
export const validateAgentPermissions = (agents) => {
    if (!agents)
        return [];
    const issues = [];
    const knownPermissionKeys = ["edit", "bash", "read", "write"];
    for (const [name, agent] of Object.entries(agents)) {
        const agentObj = agent;
        if (!agentObj)
            continue;
        const permission = agentObj.permission;
        if (permission && typeof permission === "object" && permission !== null) {
            for (const [key, value] of Object.entries(permission)) {
                // Only validate known permission keys
                if (knownPermissionKeys.includes(key)) {
                    // For known keys, only string values are valid
                    if (typeof value === "string") {
                        if (!PERMISSION_VALUES.includes(value)) {
                            issues.push(`Agent ${name} permission ${key} uses invalid value '${value}'.`);
                        }
                    }
                    else {
                        // Non-string values (except null/undefined) are invalid
                        if (value !== null && value !== undefined) {
                            issues.push(`Agent ${name} permission ${key} uses invalid value '${value}'.`);
                        }
                    }
                }
                // Ignore unknown keys completely
            }
        }
    }
    return issues;
};
export const validationAgent = (context) => {
    const config = context.config ?? {};
    const foundHooks = config.disabled_hooks ?? [];
    const invalidHooks = foundHooks.filter((hook) => !KNOWN_HOOKS.includes(hook));
    const permissionProblems = validateAgentPermissions(config.agents ?? {});
    const messages = [];
    if (invalidHooks.length) {
        messages.push(`Unknown hooks disabled: ${invalidHooks.join(", ")}.`);
    }
    if (permissionProblems.length) {
        messages.push(...permissionProblems);
    }
    return {
        name: "ConfigValidation",
        status: messages.length ? "warning" : "success",
        message: messages.length ? "Found validation issues." : "Configuration appears valid.",
        details: { invalidHooks, permissionProblems },
    };
};
export const orchestrationAgent = (context) => {
    const config = context.config ?? {};
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
export const findPromptAppendDuplicates = (agents) => {
    if (!agents)
        return [];
    const duplicates = [];
    const promptAppends = new Map();
    for (const [name, agent] of Object.entries(agents)) {
        const agentObj = agent;
        if (!agentObj)
            continue;
        const prompt_append = agentObj.prompt_append;
        if (typeof prompt_append === "string") {
            if (promptAppends.has(prompt_append)) {
                duplicates.push(name);
            }
            else {
                promptAppends.set(prompt_append, name);
            }
        }
    }
    return duplicates;
};
export const instructionFollowAgent = (context) => {
    const config = context.config ?? {};
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
