import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Single Model", () => {
  describe("Test a Single Model", () => {
    it("accepts --model flag and tests the specified model", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toBeDefined();
      expect(result.stdout).toContain("test-model");
    });

    it("outputs test results with elapsed time", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "gpt-4"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toMatch(/elapsed|time|ms/i);
    });

    it("outputs token metrics", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "claude-3"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toMatch(/token|throughput|per second/i);
    });
  });
});
