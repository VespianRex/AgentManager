/**
 * file-lock.ts — Cross-process file locking utility.
 *
 * Uses atomic mkdir for lock acquisition. Cleans up lock on exit
 * (even on error/crash). Suitable for protecting config and health-registry
 * saves from concurrent cross-process writes.
 *
 * @module
 */
import fs from "node:fs/promises";
import path from "node:path";
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
export async function withFileLock(filePath, fn, options) {
    const { retries = 5, delayMs = 50, staleTimeoutMs = 30000 } = options ?? {};
    const lockDir = filePath + ".lock";
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await fs.mkdir(lockDir, { recursive: false }); // atomic acquisition
            break; // lock acquired
        }
        catch (err) {
            const nodeErr = err;
            if (nodeErr.code === "EEXIST") {
                // Lock held — check if stale
                try {
                    const stat = await fs.stat(lockDir);
                    const ageMs = Date.now() - stat.mtimeMs;
                    if (ageMs > staleTimeoutMs) {
                        // Stale lock — remove and retry
                        await fs.rm(lockDir, { recursive: true, force: true });
                        continue;
                    }
                }
                catch {
                    // can't stat, treat as held
                }
                if (attempt === retries - 1) {
                    throw new Error(`Failed to acquire lock for ${filePath}: lock held`);
                }
                // Wait with exponential backoff + jitter
                const jitter = Math.random() * 10;
                await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt) + jitter));
                continue;
            }
            throw err;
        }
    }
    // Write PID file inside lock dir for diagnostics (non-critical)
    try {
        await fs.writeFile(path.join(lockDir, "pid"), String(process.pid), "utf8");
    }
    catch {
        // ignore
    }
    try {
        return await fn();
    }
    finally {
        try {
            await fs.rm(lockDir, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
    }
}
//# sourceMappingURL=file-lock.js.map