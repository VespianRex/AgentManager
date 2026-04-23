import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Help and Usage", () => {
  describe("Help and Usage", () => {
    it("shows help with --help flag", () => {
      const result = spawnSync("bun", [CLI_PATH, "--help"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toMatch(/help|usage|--model|--timeout|--format|--cancel/i);
    });

    it("shows help when no arguments provided", () => {
      const result = spawnSync("bun", [CLI_PATH], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toMatch(/help|usage|--model/i);
    });
  });

  describe("Error Handling", () => {
    it("shows error when model flag is missing", () => {
      const result = spawnSync("bun", [CLI_PATH], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toMatch(/model|required|error/i);
    });

    it("handles invalid model names gracefully", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "invalid-model-xyz-123"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Combined Options", () => {
    it("accepts multiple flags together", () => {
      const result = spawnSync("bun", [
        CLI_PATH,
        "--model", "test-model",
        "--timeout", "30000",
        "--format", "json"
      ], {
        encoding: "utf-8",
        timeout: 10000,
      });

      const output = result.stdout.trim();
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("handles cancel with timeout", () => {
      const result = spawnSync("bun", [
        CLI_PATH,
        "--cancel",
        "--timeout", "10000"
      ], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(0);
    });
  });
});
