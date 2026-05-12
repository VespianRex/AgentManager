/**
 * utils.ts — Shared utility functions for AgentManager
 *
 * KISS: Simple, focused helpers that reduce duplication across modules.
 * DRY: Single source of truth for type guards and safe operations.
 */
import { isString, formatError } from "./types.js";
import { randomUUID } from "node:crypto";
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Validates that a value is a non-empty string.
 * Useful for validating config field presence and format.
 */
export function isNonEmptyString(value) {
    return isString(value) && value.trim().length > 0;
}
/**
 * Type guard for Error with optional code property.
 * Standardizes error property access across the codebase.
 */
export function isErrorWithCode(err) {
    return err instanceof Error;
}
// =============================================================================
// Safe Operations
// =============================================================================
/**
 * Safe string sanitization for logging (prevents circular refs).
 * Falls back to String() conversion if JSON.stringify fails.
 */
export function safeStringify(obj) {
    if (obj === null || obj === undefined)
        return String(obj);
    try {
        return JSON.stringify(obj);
    }
    catch {
        // Safe fallback - JSON.stringify can fail on circular refs or BigInts
        return String(obj);
    }
}
/**
 * Extracts a safe error message from any thrown value.
 * Ensures consistent error formatting across the codebase.
 */
export function getErrorMessage(error) {
    return formatError(error);
}
// =============================================================================
// Validation Helpers
// =============================================================================
/**
 * Validates a benchmark config object has required string fields.
 * Returns an error message if invalid, or null if valid.
 */
export function validateBenchmarkConfigItem(config, index) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        return `Invalid benchmark config at index ${index}: expected an object.`;
    }
    const item = config;
    if (!item.model || typeof item.model !== "string") {
        return `Invalid benchmark config at index ${index}: missing or invalid 'model' field (string required).`;
    }
    if (typeof item.prompt !== "string") {
        return `Invalid benchmark config at index ${index}: 'prompt' must be a string.`;
    }
    return null;
}
/**
 * Validates an array of benchmark configs.
 * Returns first validation error, or null if all configs are valid.
 */
export function validateBenchmarkConfigs(configs) {
    if (!configs || !Array.isArray(configs)) {
        return "No benchmark configs provided. Pass an array of {model, prompt} objects.";
    }
    if (configs.length === 0) {
        return "Benchmark config array is empty.";
    }
    for (let i = 0; i < configs.length; i++) {
        const error = validateBenchmarkConfigItem(configs[i], i);
        if (error)
            return error;
    }
    return null;
}
// =============================================================================
// Random Generation
// =============================================================================
/**
 * Generates a short random suffix for file naming.
 * Uses crypto.randomUUID when available, falls back to Math.random.
 */
export function generateRandomSuffix(length = 8) {
    try {
        // crypto.randomUUID is available in Node 14.17+ and all modern browsers
        return randomUUID().slice(0, length);
    }
    catch {
        // Safe fallback - Math.random should always be available
        return Math.random().toString(36).slice(2, 2 + length);
    }
}
/**
 * Creates a unique temp file path with random suffix.
 * Prevents collisions in concurrent operations.
 */
export function createTempPath(basePath) {
    return `${basePath}.tmp.${Date.now()}.${generateRandomSuffix()}`;
}
// =============================================================================
// Array Helpers
// =============================================================================
/**
 * Groups items by a key function, returning a Map.
 * Useful for categorizing benchmark results by model/provider.
 */
export function groupBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        const existing = map.get(key);
        if (existing) {
            existing.push(item);
        }
        else {
            map.set(key, [item]);
        }
    }
    return map;
}
// =============================================================================
// Numeric Helpers
// =============================================================================
/**
 * Clamps a number between min and max values.
 * Useful for validating timeout/limit values.
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Calculates success rate as a percentage (0-100).
 * Handles division by zero gracefully.
 */
export function calculateSuccessRate(successful, total) {
    if (total === 0)
        return 0;
    return (successful / total) * 100;
}
/**
 * Calculates average of numbers, returns 0 for empty arrays.
 */
export function calculateAverage(numbers) {
    if (numbers.length === 0)
        return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}
// =============================================================================
// String Helpers
// =============================================================================
/**
 * Pads a string to a minimum length, truncating if longer.
 * Useful for consistent display formatting.
 */
export function padString(str, minLength, char = " ") {
    if (str.length >= minLength)
        return str.slice(0, minLength);
    return str + char.repeat(minLength - str.length);
}
/**
 * Formats milliseconds as a human-readable string.
 * e.g., 1500 -> "1.5s", 250 -> "250ms"
 */
export function formatDuration(ms) {
    if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${ms.toFixed(0)}ms`;
}
// =============================================================================
// Async Helpers
// =============================================================================
/**
 * Wraps a promise to ensure it always resolves (never rejects).
 * Useful for non-critical operations where failures should be silently handled.
 */
export async function safeAsync(promise, fallback) {
    try {
        return await promise;
    }
    catch {
        // Safe fallback - returns provided fallback value on any error
        return fallback;
    }
}
/**
 * Cleans up a temp file, ignoring errors.
 * Ensures temp files don't accumulate on failure.
 */
export async function cleanupTempFile(filePath) {
    try {
        await import("node:fs/promises").then((fs) => fs.unlink(filePath));
    }
    catch {
        // Safe to ignore - temp file cleanup failure doesn't affect main operation
        // File will be cleaned up on next run or by OS eventually
    }
}
//# sourceMappingURL=utils.js.map