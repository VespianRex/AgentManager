/**
 * HealthRegistry — TDD Unit Tests
 *
 * Tests for persistent per-model health tracking with
 * latency, token speed, error rate, and auto-check toggle.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, unlinkSync, rmdirSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { HealthRegistry } from "../src/health-registry.js";

// ---------------------------------------------------------------------------
// 1. HealthRegistry Interface (defined before implementation per TDD)
// ---------------------------------------------------------------------------

interface ModelHealthEntry {
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

interface HealthRegistryOptions {
  storagePath?: string;
  autoCheckEnabled?: boolean;
  autoCheckIntervalMs?: number;
  degradationThresholdMs?: number;
  failureThreshold?: number;
}

// ---------------------------------------------------------------------------
// 2. Helper to create a temp dir for each test
// ---------------------------------------------------------------------------

function tmpDir(): string {
  const d = join(os.tmpdir(), `health-registry-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// ---------------------------------------------------------------------------
// 3. Tests
// ---------------------------------------------------------------------------

describe("HealthRegistry", () => {

  // --- 3a. Creation & defaults ---

  describe("creation and defaults", () => {
    it("creates with default options and empty state", () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });
      expect(registry).toBeInstanceOf(HealthRegistry);
      expect(registry.getAllEntries()).toEqual([]);
      expect(registry.getAutoCheckEnabled()).toBe(false);
      expect(registry.getDegradationThresholdMs()).toBe(10000);
      expect(registry.getFailureThreshold()).toBe(3);
      rmdirSync(dir, { recursive: true });
    });

    it("accepts custom options", () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({
        storagePath: join(dir, "health.json"),
        autoCheckEnabled: true,
        autoCheckIntervalMs: 30000,
        degradationThresholdMs: 5000,
        failureThreshold: 5,
      });
      expect(registry.getAutoCheckEnabled()).toBe(true);
      expect(registry.getAutoCheckIntervalMs()).toBe(30000);
      expect(registry.getDegradationThresholdMs()).toBe(5000);
      expect(registry.getFailureThreshold()).toBe(5);
      rmdirSync(dir, { recursive: true });
    });

    it("sets default storagePath when not provided", () => {
      const dir = tmpDir();
      const oldHome = process.env.HOME;
      process.env.HOME = dir;
      try {
        const registry = new HealthRegistry();
        const entries = registry.getAllEntries();
        expect(Array.isArray(entries)).toBe(true);
      } finally {
        process.env.HOME = oldHome;
      }
      rmdirSync(dir, { recursive: true });
    });
  });

  // --- 3b. Recording test results ---

  describe("recording test results", () => {
    it("records a successful test result for a model", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({
        model: "nvidia/z-ai/glm-5.1",
        success: true,
        elapsedMs: 1200,
        tokensPerSecond: 45.5,
      });

      const entry = registry.getEntry("nvidia/z-ai/glm-5.1");
      expect(entry).not.toBeNull();
      expect(entry!.modelId).toBe("nvidia/z-ai/glm-5.1");
      expect(entry!.status).toBe("healthy");
      expect(entry!.totalTests).toBe(1);
      expect(entry!.successfulTests).toBe(1);
      expect(entry!.failedTests).toBe(0);
      expect(entry!.avgLatencyMs).toBe(1200);
      expect(entry!.minLatencyMs).toBe(1200);
      expect(entry!.maxLatencyMs).toBe(1200);
      expect(entry!.avgTokensPerSecond).toBeCloseTo(45.5);
      expect(entry!.lastCheckedAt).not.toBeNull();
      expect(entry!.lastError).toBeNull();

      rmdirSync(dir, { recursive: true });
    });

    it("records a failed test result", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({
        model: "nvidia/z-ai/glm-5.1",
        success: false,
        elapsedMs: 0,
        tokensPerSecond: 0,
        error: "Connection refused",
      });

      const entry = registry.getEntry("nvidia/z-ai/glm-5.1");
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe("degraded");
      expect(entry!.totalTests).toBe(1);
      expect(entry!.failedTests).toBe(1);
      expect(entry!.errorRate).toBe(1);
      expect(entry!.lastError).toBe("Connection refused");
      expect(entry!.consecutiveFailures).toBe(1);

      rmdirSync(dir, { recursive: true });
    });

    it("marks model as degraded when latency exceeds threshold", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({
        storagePath: join(dir, "health.json"),
        degradationThresholdMs: 2000,
      });

      await registry.recordResult({
        model: "slow-model",
        success: true,
        elapsedMs: 5000,
        tokensPerSecond: 10,
      });

      const entry = registry.getEntry("slow-model");
      expect(entry!.status).toBe("degraded");
      expect(entry!.avgLatencyMs).toBe(5000);

      rmdirSync(dir, { recursive: true });
    });

    it("accumulates multiple test results with running averages", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "test-model", success: true, elapsedMs: 1000, tokensPerSecond: 50 });
      await registry.recordResult({ model: "test-model", success: true, elapsedMs: 2000, tokensPerSecond: 30 });
      await registry.recordResult({ model: "test-model", success: true, elapsedMs: 3000, tokensPerSecond: 20 });

      const entry = registry.getEntry("test-model");
      expect(entry!.totalTests).toBe(3);
      expect(entry!.successfulTests).toBe(3);
      expect(entry!.avgLatencyMs).toBe(2000); // (1000+2000+3000)/3
      expect(entry!.minLatencyMs).toBe(1000);
      expect(entry!.maxLatencyMs).toBe(3000);
      expect(entry!.avgTokensPerSecond).toBeCloseTo((50+30+20)/3);

      rmdirSync(dir, { recursive: true });
    });

    it("tracks consecutive failures", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({
        storagePath: join(dir, "health.json"),
        failureThreshold: 3,
      });

      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err1" });
      expect(registry.getEntry("flaky")!.consecutiveFailures).toBe(1);

      await registry.recordResult({ model: "flaky", success: true, elapsedMs: 500, tokensPerSecond: 100 });
      // Consecutive failures reset on success
      expect(registry.getEntry("flaky")!.consecutiveFailures).toBe(0);

      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err2" });
      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err3" });
      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err4" });
      expect(registry.getEntry("flaky")!.consecutiveFailures).toBe(3);
      // Status should be unhealthy when consecutiveFailures >= failureThreshold
      expect(registry.getEntry("flaky")!.status).toBe("unhealthy");

      rmdirSync(dir, { recursive: true });
    });

    it("status becomes 'unhealthy' after consecutive failures equal threshold", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({
        storagePath: join(dir, "health.json"),
        failureThreshold: 2,
      });

      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err1" });
      expect(registry.getEntry("flaky")!.status).toBe("degraded");

      await registry.recordResult({ model: "flaky", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "err2" });
      expect(registry.getEntry("flaky")!.status).toBe("unhealthy");

      // Recovery: one success resets consecutive failures, but error rate is still 66% → degraded
      await registry.recordResult({ model: "flaky", success: true, elapsedMs: 500, tokensPerSecond: 100 });
      expect(registry.getEntry("flaky")!.status).toBe("degraded");
      expect(registry.getEntry("flaky")!.consecutiveFailures).toBe(0);

      rmdirSync(dir, { recursive: true });
    });
  });

  // --- 3c. Persistence ---

  describe("persistence", () => {
    it("persists entries to disk and reloads them", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health.json");

      // First instance: write data
      const r1 = new HealthRegistry({ storagePath });
      await r1.recordResult({ model: "persist-test", success: true, elapsedMs: 1500, tokensPerSecond: 33 });
      await r1.save();

      // Second instance: load from same path
      const r2 = await HealthRegistry.create({ storagePath });
      const entries = r2.getAllEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].modelId).toBe("persist-test");
      expect(entries[0].avgLatencyMs).toBe(1500);

      rmdirSync(dir, { recursive: true });
    });

    it("auto-saves on recordResult without explicit save", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health-auto.json");

      const r1 = new HealthRegistry({ storagePath });
      await r1.recordResult({ model: "auto-save", success: true, elapsedMs: 100, tokensPerSecond: 99 });

      // File should exist (auto-saved)
      expect(existsSync(storagePath)).toBe(true);
      const content = JSON.parse(readFileSync(storagePath, "utf8"));
      expect(content.entries["auto-save"]).toBeDefined();

      rmdirSync(dir, { recursive: true });
    });

    it("handles missing storage file gracefully", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "nonexistent.json");

      const registry = await HealthRegistry.create({ storagePath });
      const entries = registry.getAllEntries();
      expect(entries).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("creates parent directory if it does not exist before loading", async () => {
      const dir = tmpDir();
      // Create a nested subdirectory path that doesn't exist
      const nestedPath = join(dir, "nested", "deeper", "health.json");

      // Verify directory doesn't exist
      expect(existsSync(join(dir, "nested"))).toBe(false);

      // This should create the nested directories automatically
      const registry = await HealthRegistry.create({ storagePath: nestedPath });
      const entries = registry.getAllEntries();
      expect(entries).toEqual([]);

      // Verify the directory was created
      expect(existsSync(join(dir, "nested"))).toBe(true);
      expect(existsSync(join(dir, "nested", "deeper"))).toBe(true);

      rmdirSync(dir, { recursive: true });
    });

    it("recovers gracefully from corrupted storage files", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "corrupt.json");
      writeFileSync(storagePath, "{{{not valid json}}");

      // Should recover gracefully, not throw
      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      // After recovery, we should be able to add new entries
      await registry.recordResult({ model: "new-model", success: true, elapsedMs: 100, tokensPerSecond: 50 });
      expect(registry.getEntry("new-model")).not.toBeNull();

      rmdirSync(dir, { recursive: true });
    });

    it("sanitizes corrupted persisted entries before generating summaries", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "corrupt-entry.json");
      writeFileSync(storagePath, JSON.stringify({
        autoCheckEnabled: false,
        autoCheckIntervalMs: 60000,
        entries: {
          broken: {
            modelId: "broken",
            status: "healthy",
            lastCheckedAt: null,
            totalTests: 1,
            successfulTests: 1,
            failedTests: 0,
            errorRate: 0,
            avgLatencyMs: null,
            minLatencyMs: 0,
            maxLatencyMs: 0,
            avgTokensPerSecond: "fast",
            lastError: null,
            consecutiveFailures: 0,
          },
        },
      }), "utf8");

      const registry = await HealthRegistry.create({ storagePath });
      expect(() => registry.getHealthSummary("broken")).not.toThrow();
      expect(registry.getEntry("broken")?.avgLatencyMs).toBe(0);
      expect(registry.getEntry("broken")?.avgTokensPerSecond).toBe(0);
      expect(registry.getHealthSummary("broken")).toContain("0ms");
      expect(registry.getHealthSummary("broken")).toContain("0.0 t/s");

      rmdirSync(dir, { recursive: true });
    });
  });

  // --- 3d. Auto-check toggle ---

  describe("auto-check toggle", () => {
    it("toggles auto-check on and off", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      expect(registry.getAutoCheckEnabled()).toBe(false);
      await registry.setAutoCheckEnabled(true);
      expect(registry.getAutoCheckEnabled()).toBe(true);
      await registry.setAutoCheckEnabled(false);
      expect(registry.getAutoCheckEnabled()).toBe(false);

      rmdirSync(dir, { recursive: true });
    });

    it("persists auto-check toggle state across instances", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health-toggle.json");

      const r1 = new HealthRegistry({ storagePath });
      await r1.setAutoCheckEnabled(true);
      await r1.recordResult({ model: "test", success: true, elapsedMs: 100, tokensPerSecond: 50 });

      const r2 = await HealthRegistry.create({ storagePath });
      expect(r2.getAutoCheckEnabled()).toBe(true);

      rmdirSync(dir, { recursive: true });
    });
  });

  // --- 3e. Entry querying ---

  describe("entry querying", () => {
    it("returns null for non-existent model", () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });
      expect(registry.getEntry("nonexistent")).toBeNull();
      rmdirSync(dir, { recursive: true });
    });

    it("returns all entries sorted by lastCheckedAt descending", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "A", success: true, elapsedMs: 100, tokensPerSecond: 10 });
      // Small delay so timestamps differ
      const t1 = Date.now();
      while (Date.now() - t1 < 5) {}
      await registry.recordResult({ model: "B", success: true, elapsedMs: 200, tokensPerSecond: 20 });

      const entries = registry.getAllEntries();
      expect(entries.length).toBe(2);
      // Most recent first
      expect(entries[0].modelId).toBe("B");
      expect(entries[1].modelId).toBe("A");

      rmdirSync(dir, { recursive: true });
    });

    it("provides health summary string for each model", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "healthy-model", success: true, elapsedMs: 500, tokensPerSecond: 50 });
      await registry.recordResult({ model: "degraded-model", success: true, elapsedMs: 15000, tokensPerSecond: 5 });
      await registry.recordResult({ model: "unhealthy-model", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "timeout" });

      const healthySummary = registry.getHealthSummary("healthy-model");
      expect(healthySummary).toContain("healthy");
      expect(healthySummary).toContain("500ms");

      const degradedSummary = registry.getHealthSummary("degraded-model");
      expect(degradedSummary).toContain("degraded");

      const degradedSummary2 = registry.getHealthSummary("unhealthy-model");
      expect(degradedSummary2).toContain("degraded");

      const noneSummary = registry.getHealthSummary("nonexistent");
      expect(noneSummary).toContain("untested");

      rmdirSync(dir, { recursive: true });
    });

    it("provides health status icon for display", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "ok", success: true, elapsedMs: 500, tokensPerSecond: 50 });
      await registry.recordResult({ model: "slow", success: true, elapsedMs: 15000, tokensPerSecond: 5 });
      await registry.recordResult({ model: "dead", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "timeout" });

      expect(registry.getHealthIcon("ok")).toBe("✓");
      expect(registry.getHealthIcon("slow")).toBe("⚠");
      expect(registry.getHealthIcon("dead")).toBe("⚠");
      expect(registry.getHealthIcon("unknown")).toBe("·");

      rmdirSync(dir, { recursive: true });
    });
  });

  // --- 3f. Resetting ---

  describe("resetting", () => {
    it("clears all entries", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "A", success: true, elapsedMs: 100, tokensPerSecond: 10 });
      await registry.recordResult({ model: "B", success: true, elapsedMs: 200, tokensPerSecond: 20 });
      expect(registry.getAllEntries().length).toBe(2);

      await registry.reset();
      expect(registry.getAllEntries().length).toBe(0);

      rmdirSync(dir, { recursive: true });
    });

    it("clears entries for a specific model", async () => {
      const dir = tmpDir();
      const registry = new HealthRegistry({ storagePath: join(dir, "health.json") });

      await registry.recordResult({ model: "A", success: true, elapsedMs: 100, tokensPerSecond: 10 });
      await registry.recordResult({ model: "B", success: true, elapsedMs: 200, tokensPerSecond: 20 });

      await registry.resetEntry("A");
      expect(registry.getEntry("A")).toBeNull();
      expect(registry.getEntry("B")).not.toBeNull();

      rmdirSync(dir, { recursive: true });
    });
  });
});
