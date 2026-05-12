interface FileLockOptions {
    /** Number of retry attempts (default: 5) */
    retries?: number;
    /** Base delay between retries in ms (default: 50) */
    delayMs?: number;
    /** Stale lock timeout in ms (default: 30000) */
    staleTimeoutMs?: number;
}
/**
 * Execute a function with exclusive file-based lock.
 *
 * Uses atomic mkdir for lock acquisition. If the lock directory already
 * exists and is older than staleTimeoutMs, it is considered stale and
 * removed before retrying.
 *
 * The lock is always released in the finally block, even if the function
 * throws or the process crashes (the lock directory will be stale on next
 * attempt).
 *
 * @param filePath - Path to the file being locked (lock is stored at `{filePath}.lock`)
 * @param fn - Async function to execute while holding the lock
 * @param options - Optional configuration (retries, delayMs, staleTimeoutMs)
 * @returns The return value of fn
 * @throws Error if lock cannot be acquired after all retries
 */
export declare function withFileLock<T>(filePath: string, fn: () => Promise<T>, options?: FileLockOptions): Promise<T>;
export {};
//# sourceMappingURL=file-lock.d.ts.map