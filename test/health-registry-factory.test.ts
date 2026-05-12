/**
 * health-registry-factory.test.ts — HealthRegistry Async Factory Verification
 *
 * Verifies that HealthRegistry.create() async factory method exists and works.
 *
 * KISS: Simple async factory verification test.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import * as fs from "fs";
import os from "os";
import { HealthRegistry } from "../src/health-registry.js";

describe("HealthRegistry Async Factory", () => {
  let tempDir: string;
  let tempPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(join(os.tmpdir(), "health-registry-test-"));
    tempPath = join(tempDir, ".health-test.json");
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should create HealthRegistry via static async create method", async () => {
    const registry = await HealthRegistry.create({ storagePath: tempPath });

    expect(registry).toBeInstanceOf(HealthRegistry);
    expect(registry.getStoragePath()).toBe(tempPath);

    await registry.reset();
  });

  it("should load existing data when creating registry", async () => {
    // Create and populate a registry
    const registry1 = await HealthRegistry.create({ storagePath: tempPath });
    await registry1.recordResult({
      model: "test-model",
      success: true,
      elapsedMs: 100,
      tokensPerSecond: 50,
    });
    await registry1.save();

    // Create new registry with same path - should load existing data
    const registry2 = await HealthRegistry.create({ storagePath: tempPath });
    const entry = registry2.getEntry("test-model");

    expect(entry).not.toBeNull();
    expect(entry?.totalTests).toBe(1);
    expect(entry?.successfulTests).toBe(1);

    await registry1.reset();
    await registry2.reset();
  });

  it("should use default storage path when not specified", async () => {
    const registry = await HealthRegistry.create();

    expect(registry.getStoragePath()).toContain(".config/opencode/agent-manager-health.json");

    await registry.reset();
  });

  it("should support custom options via create method", async () => {
    const registry = await HealthRegistry.create({
      storagePath: tempPath,
      degradationThresholdMs: 5000,
      failureThreshold: 5,
    });

    expect(registry.getDegradationThresholdMs()).toBe(5000);
    expect(registry.getFailureThreshold()).toBe(5);

    await registry.reset();
  });
});
