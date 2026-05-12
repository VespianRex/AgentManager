/**
 * Known OpenCode hook names for validation purposes.
 * These hooks are recognized by Oh My OpenCode and OpenCode.
 */
import knownHooksData from "./data/known-hooks.json";
export const KNOWN_HOOKS = Object.freeze(knownHooksData);

/**
 * Valid permission values for agents and categories.
 */
export const PERMISSION_VALUES = ["ask", "allow", "deny"] as const;

/**
 * Known agent permission fields across OpenCode and Oh My OpenCode.
 * Keep this as the single source of truth for schema + runtime validation.
 */
export const AGENT_PERMISSION_FIELDS = [
  "edit",
  "bash",
  "read",
  "write",
  "webfetch",
  "doom_loop",
  "external_directory",
] as const;
