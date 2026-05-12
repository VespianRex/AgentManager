/**
 * Type definitions for Agent Manager plugin.
 *
 * Provides type-safe interfaces and validation for tool arguments
 * and TUI command handlers that receive `any` from OpenCode's plugin system.
 *
 * @module
 */
/**
 * Tool arguments for the agent_manager tool.
 */
export interface AgentManagerToolArgs {
    configPath?: string;
    action?: string;
    document?: unknown;
    configs?: unknown[];
    timeoutMs?: number;
}
/**
 * Context object passed to tool execute handlers.
 */
export interface AgentManagerToolContext {
    cwd?: string;
    homeDir?: string;
    [key: string]: unknown;
}
/**
 * Input for TUI command handlers.
 */
export interface TUICommandInput {
    command?: unknown;
    [key: string]: unknown;
}
/**
 * Output object for TUI command handlers.
 */
export interface TUICommandOutput {
    result?: unknown;
    [key: string]: unknown;
}
/**
 * Validates and narrows the tool args to a type-safe interface.
 * Returns the validated args or throws if invalid.
 */
export declare function validateToolArgs(args: unknown): AgentManagerToolArgs;
/**
 * Validates and narrows TUI command input to a type-safe interface.
 */
export declare function validateTUIInput(input: unknown): TUICommandInput;
/**
 * Validates and narrows TUI command output to a type-safe interface.
 */
export declare function validateTUIOutput(output: unknown): TUICommandOutput;
//# sourceMappingURL=plugin-types.d.ts.map