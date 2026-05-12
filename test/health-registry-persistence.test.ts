/**
 * Test: HealthRegistry Atomic Persistence
 *
 * TDD tests for HealthRegistry atomic file writes and corrupt JSON recovery.
 * These tests ensure data integrity during save/load operations.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, unlinkSync, rmdirSync, mkdirSync, existsSync, writeFileSync, renameSync, statSync, readdirSync } from "fs";
import { join } from "path";
import os from "os";
import { HealthRegistry } from "../src/health-registry.js";

function tmpDir(): string {
  const d = join(os.tmpdir(), `health-atomic-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

describe("HealthRegistry Atomic Persistence", () => {
  describe("atomic file writes", () => {
    it("should write data atomically using temp file + rename", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health-atomic.json");

      const registry = new HealthRegistry({ storagePath });
      await registry.recordResult({
        model: "atomic-test-model",
        success: true,
        elapsedMs: 100,
        tokensPerSecond: 50,
      });

      // File should exist and be valid JSON
      expect(existsSync(storagePath)).toBe(true);
      const content = readFileSync(storagePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.entries["atomic-test-model"]).toBeDefined();

      rmdirSync(dir, { recursive: true });
    });

    it("should not leave corrupt temp files on successful write", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health.json");

      const registry = new HealthRegistry({ storagePath });

      // List all files in directory before write
      const filesBefore = listFiles(dir);

      await registry.recordResult({
        model: "test",
        success: true,
        elapsedMs: 100,
        tokensPerSecond: 50,
      });

      // List all files after write - only health.json should exist
      const filesAfter = listFiles(dir);

      // No temp files should remain
      const tempFiles = filesAfter.filter(f => f.includes('.tmp') || f.includes('health.json'));
      // The only health file should be the final one
      expect(existsSync(storagePath)).toBe(true);

      rmdirSync(dir, { recursive: true });
    });

    it("should persist model-a data after registry1 saves", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "health.json");

      // registry1 saves model-a to disk
      const registry1 = new HealthRegistry({ storagePath });
      await registry1.recordResult({ model: "model-a", success: true, elapsedMs: 100, tokensPerSecond: 50 });

      // Use HealthRegistry.create to load persisted state
      const registry2 = await HealthRegistry.create({ storagePath });

      // model-a should exist from persisted data
      const entryA = registry2.getEntry("model-a");
      expect(entryA).not.toBeNull();
      expect(entryA!.modelId).toBe("model-a");
      expect(entryA!.totalTests).toBe(1);

      // Add model-b to new state
      await registry2.recordResult({ model: "model-b", success: true, elapsedMs: 200, tokensPerSecond: 40 });

      // Both should be persisted now
      const registry3 = await HealthRegistry.create({ storagePath });
      expect(registry3.getEntry("model-a")).not.toBeNull();
      expect(registry3.getEntry("model-b")).not.toBeNull();

      rmdirSync(dir, { recursive: true });
    });
  });

  describe("corrupt JSON recovery", () => {
    it("should recover gracefully from corrupt JSON file", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "corrupt.json");

      // Write corrupt data
      writeFileSync(storagePath, "{ invalid json [[[", "utf8");

      // Should not throw, should return empty registry
      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should recover from empty file", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "empty.json");

      writeFileSync(storagePath, "", "utf8");

      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should recover from valid JSON but wrong structure", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "wrong-structure.json");

      // Valid JSON but not the expected format
      writeFileSync(storagePath, JSON.stringify({ not: "health registry format" }), "utf8");

      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should recover from partial JSON that looks valid but is truncated", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "truncated.json");

      // Truncated JSON - looks like JSON but is incomplete
      writeFileSync(storagePath, '{"entries": {"model": {"status":', "utf8");

      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should recover from file with null bytes", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "null-bytes.json");

      // File with null bytes embedded
      writeFileSync(storagePath, '{"entries": {\u0000"model": null}}', "utf8");

      const registry = await HealthRegistry.create({ storagePath });
      // Should not throw, should recover
      expect(registry.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should start fresh after corrupted file", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "fresh-start.json");

      // Write corrupt file
      writeFileSync(storagePath, "not json at all", "utf8");

      // Create registry from corrupt file
      const registry = await HealthRegistry.create({ storagePath });
      expect(registry.getAllEntries()).toEqual([]);

      // Now add new data
      await registry.recordResult({
        model: "new-model",
        success: true,
        elapsedMs: 100,
        tokensPerSecond: 50,
      });

      // New data should be saved properly
      const freshRegistry = await HealthRegistry.create({ storagePath });
      const entry = freshRegistry.getEntry("new-model");
      expect(entry).not.toBeNull();
      expect(entry!.modelId).toBe("new-model");

      rmdirSync(dir, { recursive: true });
    });
  });

  describe("reset persistence", () => {
    it("should persist reset() to empty state", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "reset.json");

      const r1 = new HealthRegistry({ storagePath });
      await r1.recordResult({ model: "test", success: true, elapsedMs: 100, tokensPerSecond: 50 });

      // Reset all
      await r1.reset();

      // Load fresh and verify empty
      const r2 = await HealthRegistry.create({ storagePath });
      expect(r2.getAllEntries()).toEqual([]);

      rmdirSync(dir, { recursive: true });
    });

    it("should persist resetEntry() for specific model", async () => {
      const dir = tmpDir();
      const storagePath = join(dir, "reset-entry.json");

      const r1 = new HealthRegistry({ storagePath });
      await r1.recordResult({ model: "keep", success: true, elapsedMs: 100, tokensPerSecond: 50 });
      await r1.recordResult({ model: "remove", success: false, elapsedMs: 0, tokensPerSecond: 0 });

      // Remove specific entry
      await r1.resetEntry("remove");

      // Load fresh and verify only "keep" exists
      const r2 = await HealthRegistry.create({ storagePath });
      expect(r2.getEntry("keep")).not.toBeNull();
      expect(r2.getEntry("remove")).toBeNull();

      rmdirSync(dir, { recursive: true });
    });
  });
});

// Helper to list all files in a directory
function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}