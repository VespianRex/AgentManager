/**
 * Masks an API key, showing only first 4 and last 4 characters.
 * For very short strings (<= 8 chars), shows first half with asterisks.
 *
 * @param key - The API key to mask
 * @returns Masked string safe for logging
 *
 * @example
 * maskApiKey("sk-1234567890abcdef") // "sk-1234...cdef"
 * maskApiKey("abc") // "***"
 */
export declare const maskApiKey: (key: string | null | undefined) => string;
/**
 * Recursively masks sensitive data in an object for safe logging.
 * Detects API keys by environment variable naming conventions and common patterns.
 *
 * @param data - Object containing potentially sensitive data
 * @param seen - WeakSet for circular reference detection
 * @returns Deep clone with sensitive values masked
 *
 * @example
 * maskSensitiveData({ api_key: "sk-123" }) // { api_key: "sk-1***" }
 */
export declare const maskSensitiveData: (data: unknown, seen?: WeakSet<object>) => unknown;
export interface SecurityEvent {
    timestamp: string;
    event: string;
    severity: "info" | "warn" | "error";
    details?: Record<string, unknown>;
}
export declare function setLogPath(newPath: string): void;
export declare function resetLogPath(): void;
export declare function logSecurityEvent(event: string, severity: SecurityEvent["severity"], details?: Record<string, unknown>): Promise<void>;
//# sourceMappingURL=security-logger.d.ts.map