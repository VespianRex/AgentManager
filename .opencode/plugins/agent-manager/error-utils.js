/**
 * Error utility functions for safe error handling.
 * Ensures no error is silently swallowed and logging never throws.
 */
import { formatError } from "./types.js";
/**
 * Safe error message extraction for logging.
 * Delegates to formatError from types.ts (DRY: single source of truth).
 */
export function getErrorMessage(err) {
    return formatError(err);
}
/**
 * Safe error logging that never throws.
 * Use this for non-critical error logging where failure should not cascade.
 */
export function safeLogError(label, err) {
    try {
        console.error(label, getErrorMessage(err));
    }
    catch {
        // Silent fallback - logging should never throw
        // If even console.error fails, there's nothing we can do
    }
}
/**
 * Safe warning logging that never throws.
 * Use for non-critical warnings.
 */
export function safeLogWarning(label, err) {
    try {
        console.warn(label, getErrorMessage(err));
    }
    catch {
        // Silent fallback - logging should never throw
    }
}
/**
 * Creates a context-aware error handler for promise rejections.
 * Logs the error and optionally re-throws with additional context.
 */
export function createRejectionHandler(context) {
    return (reason) => {
        safeLogError(`Unhandled promise rejection in ${context}:`, reason);
    };
}
//# sourceMappingURL=error-utils.js.map