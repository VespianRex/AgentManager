/**
 * Type definitions for Agent Manager plugin.
 *
 * Provides type-safe interfaces and validation for tool arguments
 * and TUI command handlers that receive `any` from OpenCode's plugin system.
 *
 * @module
 */
/**
 * Validates and narrows the tool args to a type-safe interface.
 * Returns the validated args or throws if invalid.
 */
export function validateToolArgs(args) {
    if (!args || typeof args !== "object") {
        throw new Error("Invalid tool arguments: expected an object");
    }
    // Args from OpenCode are already validated by the tool schema.
    // We just need to narrow the type.
    const a = args;
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
export function validateTUIInput(input) {
    if (!input || typeof input !== "object") {
        return { command: undefined };
    }
    const i = input;
    return {
        command: i.command,
    };
}
/**
 * Validates and narrows TUI command output to a type-safe interface.
 */
export function validateTUIOutput(output) {
    if (!output || typeof output !== "object") {
        return {};
    }
    return output;
}
//# sourceMappingURL=plugin-types.js.map