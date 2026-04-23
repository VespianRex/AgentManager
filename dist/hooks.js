/**
 * Known OpenCode hook names for validation purposes.
 * These hooks are recognized by Oh My OpenCode and OpenCode.
 */
export const KNOWN_HOOKS = [
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
/**
 * Valid permission values for agents and categories.
 */
export const PERMISSION_VALUES = ["ask", "allow", "deny"];
