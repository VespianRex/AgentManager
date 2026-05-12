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
export function validateToolArgs(args: unknown): AgentManagerToolArgs {
  if (!args || typeof args !== "object") {
    throw new Error("Invalid tool arguments: expected an object");
  }
  // Args from OpenCode are already validated by the tool schema.
  // We just need to narrow the type.
  const a = args as Record<string, unknown>;
  return {
    configPath: typeof a.configPath === "string" ? a.configPath : undefined,
    action: typeof a.action === "string" ? a.action : undefined,
    document: a.document,
    configs: Array.isArray(a.configs) ? a.configs : undefined,
    timeoutMs: typeof a.timeoutMs === "number" ? a.timeoutMs : undefined,
  };
}

/**
 * Validates and narrows TUI command input to a type-safe interface.
 */
export function validateTUIInput(input: unknown): TUICommandInput {
  if (!input || typeof input !== "object") {
    return { command: undefined };
  }
  const i = input as Record<string, unknown>;
  return {
    command: i.command,
  };
}

/**
 * Validates and narrows TUI command output to a type-safe interface.
 */
export function validateTUIOutput(output: unknown): TUICommandOutput {
  if (!output || typeof output !== "object") {
    return {};
  }
  return output as TUICommandOutput;
}