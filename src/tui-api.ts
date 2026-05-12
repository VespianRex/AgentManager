/**
 * tui-api.ts — Stable public API for the TUI plugin.
 *
 * This is the ONLY module the TUI JSX should import from src/.
 * It provides a stable interface so internal module restructuring
 * never breaks the TUI plugin.
 *
 * KISS: Simple re-export facade.
 * DRY: Single import target for all TUI needs.
 */
export { AGENT_REGISTRY } from "./agent-metadata.js";
export { normalizePath } from "./config.js";
export {
  modelBadge,
  shortenModel,
  mergeWithDefaults,
  DEFAULT_AGENTS,
  DEFAULT_FALLBACKS,
  DEFAULT_HELP_TEXTS,
  DEFAULT_TIPS,
  getRoleCode,
} from "./tui-helpers.js";
export { HealthRegistry } from "./health-registry.js";
export type { ModelHealthEntry, TestResult, HealthRegistryOptions } from "./health-registry.js";