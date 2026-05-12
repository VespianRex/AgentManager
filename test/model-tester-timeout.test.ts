import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(__dirname, "../cli/commands/model-tester.ts");

describe("Model Tester CLI - Timeout", () => {
  describe("Set Custom Timeout", () => {
    it("accepts --timeout flag with custom timeout in milliseconds", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--timeout", "30000"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toBeDefined();
      expect(result.status).toBe(0);
    });

    it("accepts --timeout flag with value in seconds (s suffix)", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--timeout", "30s"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBeDefined();
    });

    it("enforces 60s max timeout", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--timeout", "120000"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBeDefined();
      expect(result.stdout).toMatch(/Note.*capped/i);
    });

    it("rejects negative timeout values", () => {
      const result = spawnSync("bun", [CLI_PATH, "--model", "test-model", "--timeout", "-1000"], {
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/invalid|error|timeout/i);
    });
  });
});
