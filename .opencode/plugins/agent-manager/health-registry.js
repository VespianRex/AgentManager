/**
 * health-registry.ts — Persistent per-model health tracking.
 *
 * Stores latency, token speed, error rate, and status for each model.
 * Data persists to JSON for TUI display across sessions.
 *
 * KISS: Simple JSON store, no DB, no daemon.
 * DRY: Single source of truth for model health — used by TUI and plugin.
 */
import * as fs from "fs";
import { join, dirname } from "path";
import os from "os";
import { isPlainObject, isString, formatError, HEALTH_THRESHOLDS, TIMEOUT_LIMITS, STORAGE_PATHS } from "./types.js";
import { isErrorWithCode, createTempPath } from "./utils.js";
import { withFileLock } from "./file-lock.js";
import { safeLogWarning } from "./error-utils.js";
const hasErrorCode = (error) => isErrorWithCode(error) && typeof error.code === "string";
const HEALTH_STATUSES = ["untested", "healthy", "degraded", "unhealthy"];
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const sanitizeNumber = (value) => isFiniteNumber(value) ? value : 0;
const sanitizeCount = (value) => {
    const count = sanitizeNumber(value);
    return count >= 0 ? count : 0;
};
const sanitizeNullableString = (value) => value === null ? null : isString(value) ? value : null;
const isHealthStatus = (value) => isString(value) && HEALTH_STATUSES.includes(value);
export class HealthRegistry {
    entries = {};
    storagePath;
    autoCheckEnabled;
    autoCheckIntervalMs;
    degradationThresholdMs;
    failureThreshold;
    // Mutex for save operations - prevents concurrent writes from corrupting data
    _saveQueue = [];
    _isSaving = false;
    constructor(options) {
        const opts = options ?? {};
        this.storagePath = opts.storagePath ?? join(os.homedir(), STORAGE_PATHS.DEFAULT_HEALTH_FILENAME);
        this.autoCheckEnabled = opts.autoCheckEnabled ?? false;
        this.autoCheckIntervalMs = opts.autoCheckIntervalMs ?? TIMEOUT_LIMITS.DEFAULT_AUTOCHECK_INTERVAL_MS;
        this.degradationThresholdMs = opts.degradationThresholdMs ?? HEALTH_THRESHOLDS.DEGRADATION_THRESHOLD_MS;
        this.failureThreshold = opts.failureThreshold ?? HEALTH_THRESHOLDS.FAILURE_THRESHOLD;
    }
    // ---- Public API ----
    /**
     * Acquire the save lock (mutex pattern)
     * If save is in progress, queue this call; otherwise start saving immediately
     */
    async acquireSaveLock() {
        if (!this._isSaving) {
            this._isSaving = true;
            return;
        }
        // Queue this call - wait for previous save to complete
        return new Promise((resolve) => {
            this._saveQueue.push(resolve);
        });
    }
    /**
     * Release the save lock and start the next queued save (if any)
     */
    releaseSaveLock() {
        const next = this._saveQueue.shift();
        if (next) {
            // Start next save immediately
            next();
        }
        else {
            this._isSaving = false;
        }
    }
    /** Record a test result and update health stats */
    async recordResult(result) {
        // Acquire lock for the entire recordResult + save operation
        await this.acquireSaveLock();
        try {
            const modelId = result.model;
            let entry = this.entries[modelId];
            if (!entry) {
                entry = this.createNewEntry(modelId);
                this.entries[modelId] = entry;
            }
            entry.totalTests++;
            entry.lastCheckedAt = new Date().toISOString();
            if (result.success) {
                entry.successfulTests++;
                entry.consecutiveFailures = 0;
                entry.lastError = null;
                // Running average
                entry.avgLatencyMs = this.runningAvg(entry.avgLatencyMs, entry.successfulTests - 1, result.elapsedMs);
                entry.avgTokensPerSecond = this.runningAvg(entry.avgTokensPerSecond, entry.successfulTests - 1, result.tokensPerSecond);
                // Min/max
                if (result.elapsedMs < entry.minLatencyMs || entry.minLatencyMs === 0) {
                    entry.minLatencyMs = result.elapsedMs;
                }
                if (result.elapsedMs > entry.maxLatencyMs) {
                    entry.maxLatencyMs = result.elapsedMs;
                }
            }
            else {
                entry.failedTests++;
                entry.consecutiveFailures++;
                entry.lastError = result.error ?? null;
            }
            entry.errorRate = entry.totalTests > 0 ? entry.failedTests / entry.totalTests : 0;
            entry.status = this.computeStatus(entry);
            await this.save();
        }
        finally {
            this.releaseSaveLock();
        }
    }
    /** Get a single model's health entry, or null if untested */
    getEntry(modelId) {
        return this.entries[modelId] ?? null;
    }
    /** Get all entries, sorted by lastCheckedAt descending (most recent first) */
    getAllEntries() {
        return Object.values(this.entries).sort((a, b) => {
            if (!a.lastCheckedAt && !b.lastCheckedAt)
                return 0;
            if (!a.lastCheckedAt)
                return 1;
            if (!b.lastCheckedAt)
                return -1;
            return b.lastCheckedAt.localeCompare(a.lastCheckedAt);
        });
    }
    /** Human-readable health summary for a model */
    getHealthSummary(modelId) {
        const entry = this.getEntry(modelId);
        if (!entry) {
            return "untested";
        }
        const icon = this.getHealthIcon(modelId);
        const latency = entry.avgLatencyMs.toFixed(0);
        const tps = entry.avgTokensPerSecond.toFixed(1);
        return `${icon} ${entry.status} · ${latency}ms · ${tps} t/s`;
    }
    /** Single-character health icon for TUI display */
    getHealthIcon(modelId) {
        const entry = this.getEntry(modelId);
        if (!entry)
            return "·";
        switch (entry.status) {
            case "healthy": return "✓";
            case "degraded": return "⚠";
            case "unhealthy": return "✗";
            default: return "·";
        }
    }
    /** Toggle auto health checks on/off */
    async setAutoCheckEnabled(enabled) {
        await this.acquireSaveLock();
        try {
            this.autoCheckEnabled = enabled;
            await this.save();
        }
        finally {
            this.releaseSaveLock();
        }
    }
    getAutoCheckEnabled() {
        return this.autoCheckEnabled;
    }
    getAutoCheckIntervalMs() {
        return this.autoCheckIntervalMs;
    }
    getDegradationThresholdMs() {
        return this.degradationThresholdMs;
    }
    getFailureThreshold() {
        return this.failureThreshold;
    }
    getStoragePath() {
        return this.storagePath;
    }
    /** Clear all health data */
    async reset() {
        await this.acquireSaveLock();
        try {
            this.entries = {};
            await this.save();
        }
        finally {
            this.releaseSaveLock();
        }
    }
    /** Clear health data for a specific model */
    async resetEntry(modelId) {
        await this.acquireSaveLock();
        try {
            delete this.entries[modelId];
            await this.save();
        }
        finally {
            this.releaseSaveLock();
        }
    }
    /** Explicitly save to disk using atomic write (temp file + rename) */
    async save() {
        try {
            const dir = dirname(this.storagePath);
            await fs.promises.mkdir(dir, { recursive: true });
            const data = {
                autoCheckEnabled: this.autoCheckEnabled,
                autoCheckIntervalMs: this.autoCheckIntervalMs,
                entries: this.entries,
            };
            const content = JSON.stringify(data, null, 2);
            // Cross-process lock to prevent concurrent writes from corrupting data
            await withFileLock(this.storagePath, async () => {
                // Atomic write: write to temp file first, then rename
                const tmpPath = createTempPath(this.storagePath);
                try {
                    await fs.promises.writeFile(tmpPath, content, "utf8");
                    // Rename is atomic on most filesystems
                    await fs.promises.rename(tmpPath, this.storagePath);
                }
                catch (writeError) {
                    // Clean up temp file on failure
                    try {
                        await fs.promises.unlink(tmpPath);
                    }
                    catch (err) {
                        // Temp file cleanup failure is non-critical - the file will be cleaned up eventually
                        // This is safe because we don't depend on the temp file existing
                        safeLogWarning('Failed to remove temp backup:', err);
                    }
                    throw writeError;
                }
            });
        }
        catch (error) {
            throw new Error(`Failed to save health registry: ${formatError(error)}`);
        }
    }
    // ---- Private helpers ----
    async load() {
        try {
            const dir = dirname(this.storagePath);
            await fs.promises.mkdir(dir, { recursive: true });
            const raw = await fs.promises.readFile(this.storagePath, "utf8");
            let data;
            try {
                data = JSON.parse(raw);
            }
            catch (parseError) {
                // Corrupt JSON - gracefully recover with empty entries
                this.entries = {};
                return;
            }
            this.autoCheckEnabled = data.autoCheckEnabled ?? this.autoCheckEnabled;
            this.autoCheckIntervalMs = data.autoCheckIntervalMs ?? this.autoCheckIntervalMs;
            this.entries = isPlainObject(data.entries)
                ? Object.fromEntries(Object.entries(data.entries).map(([modelId, entry]) => [
                    modelId,
                    this.sanitizeEntry(modelId, entry),
                ]))
                : {};
        }
        catch (error) {
            if (hasErrorCode(error) && error.code === "ENOENT") {
                this.entries = {};
                return;
            }
            // Any other error (permissions, etc.) - gracefully recover
            this.entries = {};
        }
    }
    sanitizeEntry(modelId, entry) {
        const base = this.createNewEntry(modelId);
        if (!isPlainObject(entry)) {
            return base;
        }
        return {
            modelId,
            status: isHealthStatus(entry.status) ? entry.status : base.status,
            lastCheckedAt: sanitizeNullableString(entry.lastCheckedAt),
            totalTests: sanitizeCount(entry.totalTests),
            successfulTests: sanitizeCount(entry.successfulTests),
            failedTests: sanitizeCount(entry.failedTests),
            errorRate: sanitizeNumber(entry.errorRate),
            avgLatencyMs: sanitizeNumber(entry.avgLatencyMs),
            minLatencyMs: sanitizeNumber(entry.minLatencyMs),
            maxLatencyMs: sanitizeNumber(entry.maxLatencyMs),
            avgTokensPerSecond: sanitizeNumber(entry.avgTokensPerSecond),
            lastError: sanitizeNullableString(entry.lastError),
            consecutiveFailures: sanitizeCount(entry.consecutiveFailures),
        };
    }
    createNewEntry(modelId) {
        return {
            modelId,
            status: "untested",
            lastCheckedAt: null,
            totalTests: 0,
            successfulTests: 0,
            failedTests: 0,
            errorRate: 0,
            avgLatencyMs: 0,
            minLatencyMs: 0,
            maxLatencyMs: 0,
            avgTokensPerSecond: 0,
            lastError: null,
            consecutiveFailures: 0,
        };
    }
    computeStatus(entry) {
        // Unhealthy = hit consecutive failure threshold
        if (entry.consecutiveFailures >= this.failureThreshold) {
            return "unhealthy";
        }
        // Degraded = all tests failed but below threshold
        if (entry.failedTests > 0 && entry.successfulTests === 0) {
            return "degraded";
        }
        // Degraded = high error rate
        if (entry.errorRate > HEALTH_THRESHOLDS.HIGH_ERROR_RATE) {
            return "degraded";
        }
        // Degraded = slow latency
        if (entry.avgLatencyMs >= this.degradationThresholdMs) {
            return "degraded";
        }
        return "healthy";
    }
    runningAvg(currentAvg, count, newValue) {
        if (count === 0)
            return newValue;
        return (currentAvg * count + newValue) / (count + 1);
    }
    /** Async factory for creating and initializing a HealthRegistry */
    static async create(options) {
        const registry = new HealthRegistry(options);
        await registry.load();
        return registry;
    }
}
//# sourceMappingURL=health-registry.js.map