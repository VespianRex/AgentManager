import type { AgentManagerDocument, ConfigSummary } from "./types.js";
import { getSystemOverview } from "./agentSystem.js";

export interface SubAgentContext {
  config: AgentManagerDocument;
  summary: ConfigSummary;
  source: string;
}

export interface SubAgentResult {
  name: string;
  status: "success" | "warning" | "error";
  message: string;
  details?: unknown;
}

const PERMISSION_VALUES = ["ask", "allow", "deny"];
const KNOWN_HOOKS = [
  "todo-continuation-enforcer",
  "context-window-monitor",
  "session-recovery",
  "session-notification",
  "comment-checker",
  "grep-output-truncator",
  "tool-output-truncator",
  "directory-agents-injector",
  "directory-readme-injector",
  "empty-task-response-detector",
  "think-mode",
  "anthropic-context-window-limit-recovery",
  "rules-injector",
  "background-notification",
  "auto-update-checker",
  "startup-toast",
  "keyword-detector",
  "agent-usage-reminder",
  "non-interactive-env",
  "interactive-bash-session",
  "compaction-context-injector",
  "thinking-block-validator",
  "claude-code-hooks",
  "ralph-loop",
  "preemptive-compaction",
];

export const runSubAgentPipeline = (context: SubAgentContext): SubAgentResult[] => {
  const results: SubAgentResult[] = [];
  results.push(discoveryAgent(context));
  results.push(systemExplanationAgent(context));
  results.push(validationAgent(context));
  results.push(orchestrationAgent(context));
  results.push(instructionFollowAgent(context));
  return results;
};

const discoveryAgent = (context: SubAgentContext): SubAgentResult => {
  const { summary, source } = context;
  return {
    name: "ConfigDiscovery",
    status: "success",
    message: `Found ${summary.agentCount} agents and ${summary.categories} categories in ${source} config.`,
    details: summary,
  };
};

const systemExplanationAgent = (context: SubAgentContext): SubAgentResult => {
  const { agents, fallbackChains, categoryChains, permissions } = getSystemOverview();
  return {
    name: "SystemExplanation",
    status: "success",
    message: "Explained agent roles and fallback chains for Oh My OpenCode.",
    details: { agents, fallbackChains, categoryChains, permissions },
  };
};

const validationAgent = (context: SubAgentContext): SubAgentResult => {
  const foundHooks = context.config.disabled_hooks ?? [];
  const invalidHooks = foundHooks.filter((hook) => !KNOWN_HOOKS.includes(hook));
  const permissionProblems: string[] = [];

  const agents = context.config.agents ?? {};
  for (const [name, agent] of Object.entries(agents)) {
    const permission = (agent as any).permission;
    if (permission && typeof permission === "object") {
      for (const [key, value] of Object.entries(permission)) {
        if (!PERMISSION_VALUES.includes(value as string)) {
          permissionProblems.push(`Agent ${name} permission ${key} uses invalid value '${value}'.`);
        }
      }
    }
  }

  const messages = [] as string[];
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

const orchestrationAgent = (context: SubAgentContext): SubAgentResult => {
  const hasSisyphus = Boolean(context.config.sisyphus_agent);
  const hasBackground = Boolean(context.config.background_task);
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
      sisyphus: context.config.sisyphus_agent ?? null,
      background_task: context.config.background_task ?? null,
    },
  };
};

const instructionFollowAgent = (context: SubAgentContext): SubAgentResult => {
  const duplicates: string[] = [];
  const promptAppends = new Map<string, string>();

  const agents = context.config.agents ?? {};
  for (const [name, agent] of Object.entries(agents)) {
    const prompt_append = (agent as any).prompt_append;
    if (typeof prompt_append === "string") {
      if (promptAppends.has(prompt_append)) {
        duplicates.push(name);
      } else {
        promptAppends.set(prompt_append, name);
      }
    }
  }

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
