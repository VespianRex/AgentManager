import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Output Format", () => {
  describe("Output Format", () => {
    it("outputs human-readable format by default", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      const output = result.stdout;
      expect(output).toBeDefined();
      expect(output).not.toMatch(/^\s*\{/);
    });

    it("accepts --format=json for single-model JSON output", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--format", "json"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      const output = result.stdout.trim();
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("model");
      expect(parsed).toHaveProperty("elapsedMs");
      expect(parsed).toHaveProperty("tokensPerSecond");
    });

    it("accepts --format=human for explicit human-readable output", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--format", "human"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toBeDefined();
    });

    it("rejects invalid format values", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--format", "invalid"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/invalid|error|format/i);
    });

    it("fails when --format is provided without a value", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--format"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/format/i);
    });

    it("fails when no mode flags are provided", () => {
      const result = spawnSync("bun", [CLI_PATH], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/usage:/i);
    });
  });
});
