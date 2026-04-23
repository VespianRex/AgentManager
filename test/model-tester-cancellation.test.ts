import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Cancellation", () => {
  describe("Cancel In-Flight Tests", () => {
    it("accepts --cancel flag to cancel running tests", () => {
      const result = spawnSync("bun", [CLI_PATH, "--cancel"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toBeDefined();
      expect(result.stdout).toMatch(/cancel|cancelled|aborted/i);
    });

    it("handles cancellation gracefully", () => {
      const result = spawnSync("bun", [CLI_PATH, "--cancel", "--model", "slow-model"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });
});
