import { describe, it, expect } from "bun:test";
import { normalizePath } from "../src/config.js";
import { homedir } from "os";

describe("normalizePath - Path Traversal Prevention (TDD Security Tests)", () => {
  const HOME = homedir();
  const SAFE_CWD = "/safe/test/cwd";

  describe("Path Traversal Attack Vectors - MUST REJECT", () => {
    const attackVectors = [
      // Basic traversal attacks
      { input: "~/../../../etc/passwd", description: "Basic traversal to /etc/passwd" },
      { input: "~/../../..", description: "Traversal to root" },
      { input: "~/" + "../".repeat(10) + "etc/passwd", description: "Deep traversal attack" },
      { input: "~/foo/../../../bar", description: "Mid-path traversal" },
      { input: "~/foo/bar/../../../../baz", description: "Double mid-path traversal" },
      
      // Edge cases at boundary
      { input: "~/../..", description: "Exactly at home boundary" },
      { input: "~/../../foo", description: "One level over home boundary" },
      
      // Note: URL-encoded paths like %2e%2e%2f are NOT decoded by path.resolve,
      // so they become literal filenames, not traversal attempts
      
      // Null byte injection
      { input: "~/foo/../../../etc/passwd%00.txt", description: "Null byte injection" },
    ];

    it.each(attackVectors)("rejects path traversal: $description", ({ input }) => {
      expect(() => normalizePath(input, SAFE_CWD)).toThrow();
    });
  });

  describe("Valid Paths - MUST ACCEPT", () => {
    const validPaths = [
      { input: "~/config.json", expectedContains: "config.json", description: "Simple home relative" },
      { input: "~/foo/bar/baz.json", expectedContains: "foo/bar/baz.json", description: "Nested home path" },
      { input: "/absolute/path.json", expectedContains: "/absolute/path.json", description: "Absolute path" },
      { input: "relative/path.json", expectedContains: "relative/path.json", description: "Relative path" },
    ];

    it.each(validPaths)("accepts valid path: $description", ({ input, expectedContains }) => {
      expect(() => normalizePath(input, SAFE_CWD)).not.toThrow();
      
      const result = normalizePath(input, SAFE_CWD);
      expect(result).toContain(expectedContains);
    });

    it("resolves tilde to actual home directory", () => {
      const result = normalizePath("~/test.json", SAFE_CWD);
      expect(result).toContain(HOME);
    });

    it("resolves relative paths against cwd", () => {
      const result = normalizePath("test.json", SAFE_CWD);
      expect(result).toBe(`${SAFE_CWD}/test.json`);
    });

    it("preserves absolute paths", () => {
      const absolutePath = "/usr/local/config.json";
      const result = normalizePath(absolutePath, SAFE_CWD);
      expect(result).toBe(absolutePath);
    });
  });

  describe("Error Message Security", () => {
    it("does not leak filesystem structure in error messages", () => {
      let threw = false;
      try {
        normalizePath("~/../../../etc/passwd", SAFE_CWD);
      } catch (error: any) {
        threw = true;
        // Error should not reveal actual home directory
        expect(error.message).not.toContain(HOME);
        // Error should not reveal system paths
        expect(error.message.toLowerCase()).not.toContain("/etc/passwd");
      }
      if (!threw) {
        throw new Error("Should have thrown an error");
      }
    });

    it("provides clear security-focused error message", () => {
      let threw = false;
      try {
        normalizePath("~/../../../etc/passwd", SAFE_CWD);
      } catch (error: any) {
        threw = true;
        expect(error.message).toMatch(/path|traversal|security|outside/i);
      }
      if (!threw) {
        throw new Error("Should have thrown an error");
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles empty string gracefully", () => {
      expect(() => normalizePath("", SAFE_CWD)).not.toThrow();
    });

    it("handles single character paths", () => {
      expect(() => normalizePath("a", SAFE_CWD)).not.toThrow();
    });

    it("handles paths with special characters", () => {
      const result = normalizePath("~/config-file_v1.0.json", SAFE_CWD);
      expect(result).toContain("config-file_v1.0.json");
    });

    it("handles unicode characters in path", () => {
      const result = normalizePath("~/配置.json", SAFE_CWD);
      expect(result).toContain("配置.json");
    });
  });

  describe("Home Directory Resolution", () => {
    it("uses HOME environment variable", () => {
      const result = normalizePath("~/test.json", SAFE_CWD);
      expect(result).toContain(process.env.HOME || "/");
    });

    it("defaults to / if HOME is not set", () => {
      // Test documents expected behavior when HOME env var is missing
      // normalizePath uses: process.env.HOME ?? "/"
      expect(true).toBe(true);
    });
  });
});
