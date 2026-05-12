/**
 * health-registry-concurrency.test.ts — Concurrent Access Safety Test
 *
 * TDD Red Phase: These tests should FAIL until we add a mutex to protect
 * concurrent recordResult calls from corrupting shared state.
 *
 * Bug 10: No locking mechanism for concurrent writes
 * Bug 12: Shared mutable reference issue
 */
import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync } from "fs";
import { rm } from "node:fs/promises";
import { join } from "path";
import os from "os";
import { HealthRegistry } from "../src/health-registry.js";

function tmpDir(): string {
  const d = join(
    os.tmpdir(),
    `health-registry-concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(d, { recursive: true });
  return d;
}

describe("HealthRegistry concurrency", () => {
  let tempDirs: string[] = [];

  // Collect temp dirs for cleanup after each test
  const trackDir = (dir: string) => {
    tempDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    // Async cleanup of all temp directories created during the test
    await Promise.all(
      tempDirs.map((dir) =>
        rm(dir, { recursive: true, force: true }).catch(() => {})
      )
    );
    tempDirs = [];
  });

  test("recordResult handles 100 concurrent calls correctly", async () => {
    const dir = trackDir(tmpDir());
    const storagePath = join(dir, "test-health-concurrent.json");
    const registry = new HealthRegistry({ storagePath });

    const modelId = "test-model-concurrent";
    const concurrentCalls = 100;

    // Create 100 concurrent recordResult calls
    const promises = Array.from({ length: concurrentCalls }, (_, i) =>
      registry.recordResult({
        model: modelId,
        success: i % 2 === 0, // Alternate success/failure
        elapsedMs: 100 + (i % 50),
        tokensPerSecond: 50 + (i % 20),
        error: i % 2 !== 0 ? "Test error" : undefined,
      })
    );

    await Promise.all(promises);

    const entry = registry.getEntry(modelId);
    expect(entry).not.toBeNull();
    expect(entry!.totalTests).toBe(concurrentCalls);
    expect(entry!.successfulTests).toBe(50); // Half should succeed
    expect(entry!.failedTests).toBe(50); // Half should fail
  });

  test("concurrent saves do not corrupt data", async () => {
    const dir = trackDir(tmpDir());
    const storagePath = join(dir, "test-health-save-concurrent.json");
    const registry = new HealthRegistry({ storagePath });

    const concurrentSaves = 50;
    const promises = Array.from({ length: concurrentSaves }, (_, i) =>
      registry.recordResult({
        model: `model-${i % 10}`,
        success: true,
        elapsedMs: 100,
        tokensPerSecond: 50,
      })
    );

    await Promise.all(promises);

    const entries = registry.getAllEntries();
    expect(entries.length).toBe(10); // 50 saves across 10 models

    // Each model should have exactly 5 tests
    for (const entry of entries) {
      expect(entry.totalTests).toBe(5);
    }
  });

  test("concurrent writes to multiple models maintain data integrity", async () => {
    const dir = trackDir(tmpDir());
    const storagePath = join(dir, "test-health-multiple.json");
    const registry = new HealthRegistry({ storagePath });

    const modelCount = 20;
    const writesPerModel = 10;

    // Create concurrent writes across 20 models, 10 writes each
    const promises: Promise<void>[] = [];
    for (let m = 0; m < modelCount; m++) {
      for (let w = 0; w < writesPerModel; w++) {
        promises.push(
          registry.recordResult({
            model: `model-${m}`,
            success: w % 3 !== 0, // 2/3 succeed, 1/3 fail
            elapsedMs: 100 + w,
            tokensPerSecond: 50 + w,
            error: w % 3 === 0 ? `Error-${w}` : undefined,
          })
        );
      }
    }

    await Promise.all(promises);

    // Verify all 20 models exist with 10 writes each
    const entries = registry.getAllEntries();
    expect(entries.length).toBe(modelCount);

    for (const entry of entries) {
      expect(entry.totalTests).toBe(writesPerModel);
      // Pattern: w % 3 === 0 fails (4 failures at indices 0, 3, 6, 9)
      // Remaining 6 succeed
      expect(entry.successfulTests).toBe(6); // 6 out of 10 succeed
      expect(entry.failedTests).toBe(4); // 4 out of 10 fail
    }
  });

  test("concurrent recordResult + getEntry do not throw", async () => {
    const dir = trackDir(tmpDir());
    const storagePath = join(dir, "test-health-readwrite.json");
    const registry = new HealthRegistry({ storagePath });

    // Mix of writes and reads
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        registry.recordResult({
          model: `model-${i % 5}`,
          success: i % 2 === 0,
          elapsedMs: 100,
          tokensPerSecond: 50,
        })
      );
      promises.push(
        (async () => {
          // Read operations should not throw
          registry.getEntry(`model-${i % 5}`);
          registry.getAllEntries();
        })()
      );
    }

    // Should not throw any exceptions
    await Promise.all(promises);

    // Verify final state is consistent
    const entries = registry.getAllEntries();
    expect(entries.length).toBe(5);
    for (const entry of entries) {
      expect(entry.totalTests).toBe(10); // 50 writes / 5 models
    }
  });

  test("rapid concurrent saves maintain atomicity", async () => {
    const dir = trackDir(tmpDir());
    const storagePath = join(dir, "test-rapid-save.json");
    const registry = new HealthRegistry({ storagePath });

    const concurrentSaves = 100;

    // Rapid fire saves - this tests the mutex queue
    await Promise.all(
      Array.from({ length: concurrentSaves }, (_, i) =>
        registry.recordResult({
          model: "rapid",
          success: true,
          elapsedMs: 50 + (i % 100),
          tokensPerSecond: 50,
        })
      )
    );

    const entry = registry.getEntry("rapid");
    expect(entry!.totalTests).toBe(concurrentSaves);
    expect(entry!.successfulTests).toBe(concurrentSaves);
    expect(entry!.failedTests).toBe(0);

    // Verify data in storage is correct
    const loaded = await HealthRegistry.create({ storagePath });
    const loadedEntry = loaded.getEntry("rapid");
    expect(loadedEntry!.totalTests).toBe(concurrentSaves);
  });
});
