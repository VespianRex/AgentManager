/**
 * types.ts — Shared types, constants, and utilities for AgentManager.
 *
 * KISS: Simple, focused exports that reduce duplication across modules.
 * DRY: Single source of truth for type guards and constants.
 */
/**
 * Type guard for plain objects (non-null, non-array objects).
 * Returns true for objects created with {} or Object.create(null).
 */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/**
 * Type guard for primitive string values.
 * Returns false for String objects created with new String().
 */
export declare function isString(value: unknown): value is string;
/**
 * Extracts a safe error message from any thrown value.
 * Ensures consistent error formatting across the codebase.
 */
export declare function formatError(error: unknown): string;
/**
 * Creates an Error with a cause property (node Error cause support).
 */
export declare function errorWithCause(message: string, cause: unknown): Error;
/**
 * Type guard for Node.js errors with optional code property.
 * Standardizes error property access across the codebase.
 */
export declare function isNodeError(value: unknown): value is NodeJS.ErrnoException;
/**
 * Simple deep merge for plain objects.
 * Copies properties from source over target, recursively for nested objects.
 */
export declare function merge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown>;
export declare const CONFIG_TYPE_NAMES: {
    readonly OPENCODE: "opencode";
    readonly OH_MY_OPENCODE: "oh-my-opencode";
};
export declare const TIMEOUT_LIMITS: {
    readonly MAX_TIMEOUT_MS: 60000;
    readonly DEFAULT_AUTOCHECK_INTERVAL_MS: 60000;
};
export declare const HEALTH_THRESHOLDS: {
    readonly DEGRADATION_THRESHOLD_MS: 10000;
    readonly FAILURE_THRESHOLD: 3;
    readonly HIGH_ERROR_RATE: 0.5;
};
export declare const CACHE_DEFAULTS: {
    readonly CONFIG_CACHE_TTL_MS: 30000;
};
export declare const DEFAULT_MODEL: "opencode/gpt-4o";
export declare const TOKEN_ESTIMATION: {
    readonly WORD_TO_TOKEN_MULTIPLIER: 1.5;
};
export declare const STORAGE_PATHS: {
    readonly DEFAULT_HEALTH_FILENAME: ".config/opencode/agent-manager-health.json";
};
export declare const FILE_SECURITY: {
    readonly SECURE_FILE_MODE: 384;
};
export declare const BACKUP_CONSTANTS: {
    readonly BACKUP_RANDOM_BYTES: 8;
};
export declare const FILE_LIMITS: {
    readonly MAX_CONFIG_FILE_SIZE: number;
};
export declare const BENCHMARK_LIMITS: {
    readonly MIN_TIMEOUT_MS: 5000;
    readonly MAX_MODELS_PER_BATCH: 10;
};
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
export type AgentManagerDocument = import("./schema.js").AgentManagerDocument;
//# sourceMappingURL=types.d.ts.map