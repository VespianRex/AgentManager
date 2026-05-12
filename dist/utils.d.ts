/**
 * utils.ts — Shared utility functions for AgentManager
 *
 * KISS: Simple, focused helpers that reduce duplication across modules.
 * DRY: Single source of truth for type guards and safe operations.
 */
/**
 * Validates that a value is a non-empty string.
 * Useful for validating config field presence and format.
 */
export declare function isNonEmptyString(value: unknown): value is string;
/**
 * Type guard for Error with optional code property.
 * Standardizes error property access across the codebase.
 */
export declare function isErrorWithCode(err: unknown): err is Error & {
    code?: string;
};
/**
 * Safe string sanitization for logging (prevents circular refs).
 * Falls back to String() conversion if JSON.stringify fails.
 */
export declare function safeStringify(obj: unknown): string;
/**
 * Extracts a safe error message from any thrown value.
 * Ensures consistent error formatting across the codebase.
 */
export declare function getErrorMessage(error: unknown): string;
/**
 * Validates a benchmark config object has required string fields.
 * Returns an error message if invalid, or null if valid.
 */
export declare function validateBenchmarkConfigItem(config: unknown, index: number): string | null;
/**
 * Validates an array of benchmark configs.
 * Returns first validation error, or null if all configs are valid.
 */
export declare function validateBenchmarkConfigs(configs: unknown): string | null;
/**
 * Generates a short random suffix for file naming.
 * Uses crypto.randomUUID when available, falls back to Math.random.
 */
export declare function generateRandomSuffix(length?: number): string;
/**
 * Creates a unique temp file path with random suffix.
 * Prevents collisions in concurrent operations.
 */
export declare function createTempPath(basePath: string): string;
/**
 * Groups items by a key function, returning a Map.
 * Useful for categorizing benchmark results by model/provider.
 */
export declare function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Map<K, T[]>;
/**
 * Clamps a number between min and max values.
 * Useful for validating timeout/limit values.
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Calculates success rate as a percentage (0-100).
 * Handles division by zero gracefully.
 */
export declare function calculateSuccessRate(successful: number, total: number): number;
/**
 * Calculates average of numbers, returns 0 for empty arrays.
 */
export declare function calculateAverage(numbers: number[]): number;
/**
 * Pads a string to a minimum length, truncating if longer.
 * Useful for consistent display formatting.
 */
export declare function padString(str: string, minLength: number, char?: string): string;
/**
 * Formats milliseconds as a human-readable string.
 * e.g., 1500 -> "1.5s", 250 -> "250ms"
 */
export declare function formatDuration(ms: number): string;
/**
 * Wraps a promise to ensure it always resolves (never rejects).
 * Useful for non-critical operations where failures should be silently handled.
 */
export declare function safeAsync<T>(promise: Promise<T>, fallback: T): Promise<T>;
/**
 * Cleans up a temp file, ignoring errors.
 * Ensures temp files don't accumulate on failure.
 */
export declare function cleanupTempFile(filePath: string): Promise<void>;
//# sourceMappingURL=utils.d.ts.map