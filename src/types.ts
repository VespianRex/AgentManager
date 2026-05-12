/**
 * types.ts — Shared types, constants, and utilities for AgentManager.
 *
 * KISS: Simple, focused exports that reduce duplication across modules.
 * DRY: Single source of truth for type guards and constants.
 */

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Type guard for plain objects (non-null, non-array objects).
 * Returns true for objects created with {} or Object.create(null).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard for primitive string values.
 * Returns false for String objects created with new String().
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Extracts a safe error message from any thrown value.
 * Ensures consistent error formatting across the codebase.
 */
export function formatError(error: unknown): string {
 if (error instanceof Error) return error.message;
 if (typeof error === "string") return error;
 return String(error);
}

/**
 * Creates an Error with a cause property (node Error cause support).
 */
export function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause: unknown }).cause = cause;
  return error;
}

/**
 * Type guard for Node.js errors with optional code property.
 * Standardizes error property access across the codebase.
 */
export function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

/**
 * Simple deep merge for plain objects.
 * Copies properties from source over target, recursively for nested objects.
 */
export function merge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = merge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

// =============================================================================
// Constants
// =============================================================================

export const CONFIG_TYPE_NAMES = {
  OPENCODE: "opencode",
  OH_MY_OPENCODE: "oh-my-opencode",
} as const;

export const TIMEOUT_LIMITS = {
  MAX_TIMEOUT_MS: 60000,
  DEFAULT_AUTOCHECK_INTERVAL_MS: 60000,
} as const;

export const HEALTH_THRESHOLDS = {
  DEGRADATION_THRESHOLD_MS: 10000,
  FAILURE_THRESHOLD: 3,
  HIGH_ERROR_RATE: 0.5,
} as const;

export const CACHE_DEFAULTS = {
  CONFIG_CACHE_TTL_MS: 30000,
} as const;

export const DEFAULT_MODEL = "opencode/gpt-4o" as const;

export const TOKEN_ESTIMATION = {
  WORD_TO_TOKEN_MULTIPLIER: 1.5,
} as const;

export const STORAGE_PATHS = {
  DEFAULT_HEALTH_FILENAME: ".config/opencode/agent-manager-health.json",
} as const;

export const FILE_SECURITY = {
  SECURE_FILE_MODE: 0o600,
} as const;

export const BACKUP_CONSTANTS = {
  BACKUP_RANDOM_BYTES: 8,
} as const;

export const FILE_LIMITS = {
  MAX_CONFIG_FILE_SIZE: 10 * 1024 * 1024,
} as const;

export const BENCHMARK_LIMITS = {
  MIN_TIMEOUT_MS: 5000,
  MAX_MODELS_PER_BATCH: 10,
} as const;

// =============================================================================
// Interfaces
// =============================================================================

export interface ConfigLocation {
  path: string;
  source: "project" | "user";
  type: "oh-my-opencode" | "opencode";
}

export interface ConfigSummary {
  path: string;
  source: string;
  type: string;
  agentCount: number;
  categories: number;
  hasSisyphus: boolean;
  disabledHooks: string[];
  disabledAgents: string[];
  disabledSkills: string[];
}

export interface BenchmarkConfig {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

// Re-export type from Zod schema for consistency
export type AgentManagerDocument = import("./schema.js").AgentManagerDocument;
