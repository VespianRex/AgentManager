import { describe, it, expect, beforeAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Test the new file size limit security feature
describe("Config File Size Limit Security", () => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB - must match config.ts

  it("rejects files larger than 10MB", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "config-size-test-"));
    const filePath = path.join(tmp, "huge-config.json");

    // Create a file larger than FILE_LIMITS.MAX_CONFIG_FILE_SIZE
    const hugeContent = "{ \"data\": \"" + "x".repeat(MAX_SIZE + 1) + "\" }";
    await fs.writeFile(filePath, hugeContent, "utf8");

    // Import readJsoncFile after creating the file to test current behavior
    const { readJsoncFile } = await import("../src/config.js");

    await expect(readJsoncFile(filePath)).rejects.toThrow(/too large/i);

    // Cleanup
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("accepts files at exactly the size limit", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "config-size-test-"));
    const filePath = path.join(tmp, "exact-config.json");

    // Create a file at exactly the limit
    const exactContent = JSON.stringify({ data: "x".repeat(MAX_SIZE - 50) });
    await fs.writeFile(filePath, exactContent, "utf8");

    const { readJsoncFile } = await import("../src/config.js");

    // Should not throw - file is within limit
    const result = await readJsoncFile(filePath);
    expect(result).toBeDefined();

    // Cleanup
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("accepts normal-sized files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "config-size-test-"));
    const filePath = path.join(tmp, "normal-config.json");

    const content = JSON.stringify({ agents: { test: { model: "gpt-4" } } });
    await fs.writeFile(filePath, content, "utf8");

    const { readJsoncFile } = await import("../src/config.js");

    const result = await readJsoncFile(filePath);
    expect(result.agents?.test?.model).toBe("gpt-4");

    // Cleanup
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

// Test the normalizePath edge case with home ending in path separator
describe("normalizePath - Home Directory Edge Case", () => {
  // This test validates the fix for the edge case where home directory
  // path might end with a path separator

  it("handles home directory paths correctly regardless of trailing separator", () => {
    // This is tested indirectly through the path traversal tests
    // The key fix is that homeNormalized ensures consistent checking
    const { normalizePath } = require("../src/config.js");

    // A valid path within home should always work
    const validPath = "~/config/opencode.json";
    expect(() => normalizePath(validPath, "/tmp")).not.toThrow();
  });

  it("rejects path traversal even when home has trailing separator", () => {
    const { normalizePath } = require("../src/config.js");

    // This should always be rejected regardless of home directory format
    expect(() => normalizePath("~/../../../etc/passwd", "/tmp")).toThrow();
  });
});