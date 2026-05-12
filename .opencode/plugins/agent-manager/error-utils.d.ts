/**
 * Error utility functions for safe error handling.
 * Ensures no error is silently swallowed and logging never throws.
 */
/**
 * Safe error message extraction for logging.
 * Delegates to formatError from types.ts (DRY: single source of truth).
 */
export declare function getErrorMessage(err: unknown): string;
/**
 * Safe error logging that never throws.
 * Use this for non-critical error logging where failure should not cascade.
 */
export declare function safeLogError(label: string, err: unknown): void;
/**
 * Safe warning logging that never throws.
 * Use for non-critical warnings.
 */
export declare function safeLogWarning(label: string, err: unknown): void;
/**
 * Creates a context-aware error handler for promise rejections.
 * Logs the error and optionally re-throws with additional context.
 */
export declare function createRejectionHandler(context: string): (reason: unknown) => void;
//# sourceMappingURL=error-utils.d.ts.map