export interface ModelHealthEntry {
    modelId: string;
    status: "untested" | "healthy" | "degraded" | "unhealthy";
    lastCheckedAt: string | null;
    totalTests: number;
    successfulTests: number;
    failedTests: number;
    errorRate: number;
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    avgTokensPerSecond: number;
    lastError: string | null;
    consecutiveFailures: number;
}
export interface TestResult {
    model: string;
    success: boolean;
    elapsedMs: number;
    tokensPerSecond: number;
    error?: string;
}
export interface HealthRegistryOptions {
    storagePath?: string;
    autoCheckEnabled?: boolean;
    autoCheckIntervalMs?: number;
    degradationThresholdMs?: number;
    failureThreshold?: number;
}
export declare class HealthRegistry {
    private entries;
    private storagePath;
    private autoCheckEnabled;
    private autoCheckIntervalMs;
    private degradationThresholdMs;
    private failureThreshold;
    private _saveQueue;
    private _isSaving;
    constructor(options?: HealthRegistryOptions);
    /**
     * Acquire the save lock (mutex pattern)
     * If save is in progress, queue this call; otherwise start saving immediately
     */
    private acquireSaveLock;
    /**
     * Release the save lock and start the next queued save (if any)
     */
    private releaseSaveLock;
    /** Record a test result and update health stats */
    recordResult(result: TestResult): Promise<void>;
    /** Get a single model's health entry, or null if untested */
    getEntry(modelId: string): ModelHealthEntry | null;
    /** Get all entries, sorted by lastCheckedAt descending (most recent first) */
    getAllEntries(): ModelHealthEntry[];
    /** Human-readable health summary for a model */
    getHealthSummary(modelId: string): string;
    /** Single-character health icon for TUI display */
    getHealthIcon(modelId: string): string;
    /** Toggle auto health checks on/off */
    setAutoCheckEnabled(enabled: boolean): Promise<void>;
    getAutoCheckEnabled(): boolean;
    getAutoCheckIntervalMs(): number;
    getDegradationThresholdMs(): number;
    getFailureThreshold(): number;
    getStoragePath(): string;
    /** Clear all health data */
    reset(): Promise<void>;
    /** Clear health data for a specific model */
    resetEntry(modelId: string): Promise<void>;
    /** Explicitly save to disk using atomic write (temp file + rename) */
    save(): Promise<void>;
    private load;
    private sanitizeEntry;
    private createNewEntry;
    private computeStatus;
    private runningAvg;
    /** Async factory for creating and initializing a HealthRegistry */
    static create(options?: HealthRegistryOptions): Promise<HealthRegistry>;
}
//# sourceMappingURL=health-registry.d.ts.map