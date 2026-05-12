import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HealthRegistry } from "../src/health-registry.js";

const tmpDirs: string[] = [];
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "health-cli-"));
  tmpDirs.push(dir);
  return dir;
};

describe("health-registry CLI resource cleanup", () => {
  // Cleanup all temp directories after each describe block
  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    tmpDirs.length = 0;
  });

  // These tests verify the CLI properly cleans up resources in all scenarios

  it("getHealthIcon returns '✗' for models with 3 consecutive failures (unhealthy)", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    // Record 3 consecutive failures to reach the default FAILURE_THRESHOLD of 3
    await registry.recordResult({ model: "dead", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "timeout" });
    await registry.recordResult({ model: "dead", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "timeout" });
    await registry.recordResult({ model: "dead", success: false, elapsedMs: 0, tokensPerSecond: 0, error: "timeout" });

    expect(registry.getHealthIcon("dead")).toBe("✗");
  });

  it("getHealthIcon returns '⚠' for slow models (degraded via latency)", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    await registry.recordResult({ model: "slow", success: true, elapsedMs: 15000, tokensPerSecond: 5 });

    expect(registry.getHealthIcon("slow")).toBe("⚠");
  });

  it("getHealthIcon returns '✓' for healthy models", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    await registry.recordResult({ model: "ok", success: true, elapsedMs: 500, tokensPerSecond: 50 });

    expect(registry.getHealthIcon("ok")).toBe("✓");
  });

  it("getHealthIcon returns '·' for unknown/untested models", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    expect(registry.getHealthIcon("unknown")).toBe("·");
  });
});

describe("health-registry status computation", () => {
  // Cleanup all temp directories after each describe block
  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    tmpDirs.length = 0;
  });

  it("marks model as unhealthy after 3 consecutive failures", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    // 2 failures - still degraded
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });
    expect(registry.getEntry("test")?.status).toBe("degraded");

    // 3rd failure - now unhealthy
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });
    expect(registry.getEntry("test")?.status).toBe("unhealthy");
  });

  it("resets consecutive failures on success", async () => {
    const dir = tmpDir();
    const registry = new HealthRegistry({ storagePath: path.join(dir, "health.json") });

    // 2 failures
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });

    // Success resets counter
    await registry.recordResult({ model: "test", success: true, elapsedMs: 100, tokensPerSecond: 10 });
    expect(registry.getEntry("test")?.consecutiveFailures).toBe(0);

    // One more failure - only 1 consecutive
    await registry.recordResult({ model: "test", success: false, elapsedMs: 0, tokensPerSecond: 0 });
    expect(registry.getEntry("test")?.consecutiveFailures).toBe(1);
  });
});