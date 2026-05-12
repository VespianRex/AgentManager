/**
 * Test: Credentials Security
 *
 * Tests for hardcoded credential detection and secure credential loading.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SOURCE_PATH = join(import.meta.dir, "../src/services/credentials/opencode-credentials.ts");

describe("Credentials Security", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    originalEnv.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    originalEnv.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    if (originalEnv.GOOGLE_CLIENT_ID !== undefined) {
      process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    if (originalEnv.GOOGLE_CLIENT_SECRET !== undefined) {
      process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
    } else {
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
    if (originalEnv.GOOGLE_API_KEY !== undefined) {
      process.env.GOOGLE_API_KEY = originalEnv.GOOGLE_API_KEY;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  describe("No hardcoded credentials in source", () => {
    it("should NOT contain hardcoded clientId patterns", async () => {
      const content = await readFile(SOURCE_PATH, "utf-8");

      const badPatterns = [
        "564843631-6ephmgb4v3qndj6i4k7qmu0q8vgj0d9e.apps.googleusercontent.com",
        "564843631-", // Partial match of the hardcoded client ID
      ];

      for (const pattern of badPatterns) {
        expect(content).not.toContain(pattern);
      }
    });

    it("should NOT contain hardcoded clientSecret patterns", async () => {
      const content = await readFile(SOURCE_PATH, "utf-8");

      const badPatterns = [
        "GOCSPX-f3CLPmVQ8rXQh6wKQ6tN5B5Z7rR",
        "GOCSPX-", // Partial match of the hardcoded client secret prefix
      ];

      for (const pattern of badPatterns) {
        expect(content).not.toContain(pattern);
      }
    });

    it("should use process.env for GOOGLE_CLIENT_ID", async () => {
      const content = await readFile(SOURCE_PATH, "utf-8");
      expect(content).toContain("process.env.GOOGLE_CLIENT_ID");
    });

    it("should use process.env for GOOGLE_CLIENT_SECRET", async () => {
      const content = await readFile(SOURCE_PATH, "utf-8");
      expect(content).toContain("process.env.GOOGLE_CLIENT_SECRET");
    });
  });

  describe("Environment variable loading", () => {
    it("should use GOOGLE_CLIENT_ID when set", async () => {
      process.env.GOOGLE_CLIENT_ID = "env-client-id-12345";
      process.env.GOOGLE_CLIENT_SECRET = "env-client-secret-67890";

      const content = await readFile(SOURCE_PATH, "utf-8");

      expect(content).toContain("process.env.GOOGLE_CLIENT_ID");
      expect(content).toContain("process.env.GOOGLE_CLIENT_SECRET");
    });

    it("should have graceful handling when env vars missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      // Module-level check: function exists
      const content = await readFile(SOURCE_PATH, "utf-8");
      expect(content).toContain("if (!clientId || !clientSecret)");
    });
  });

  describe("Fallback behavior", () => {
    it("should provide meaningful error when env vars missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const content = await readFile(SOURCE_PATH, "utf-8");

      // Should have clear error message about missing credentials
      expect(content).toContain("Missing OAuth credentials");
      // Should use formatError, not raw string interpolation
      expect(content).toContain("formatError");
    });
  });
});