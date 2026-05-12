/**
 * Test: CLI model-tester.ts exports
 *
 * TDD tests for validating CLI export behavior.
 * Ensures createModelTester is exported while unused ModelTester class is not.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "fs";
import { resolve } from "path";

describe("CLI model-tester.ts exports", () => {
  /**
   * Verify createModelTester is still exported (it's used by the CLI)
   */
  it("should export createModelTester function", async () => {
    const exports = await import("../cli/commands/model-tester.ts");
    expect(typeof exports.createModelTester).toBe("function");
  });

  /**
   * Verify ModelTester class is NOT exported from CLI
   * This confirms the dead code removal was successful
   */
  it("should NOT export ModelTester class (dead code removed)", async () => {
    const exports = await import("../cli/commands/model-tester.ts");
    expect(exports.ModelTester).toBeUndefined();
  });

  /**
   * Verify the CLI file exists and is syntactically valid
   */
  it("should have valid CLI file that can be imported", async () => {
    const cliPath = resolve(__dirname, "../cli/commands/model-tester.ts");
    expect(existsSync(cliPath)).toBe(true);

    // Should be able to import without errors
    const mod = await import("../cli/commands/model-tester.ts");
    expect(mod).toBeDefined();
  });

  /**
   * Verify createModelTester creates a functional tester
   */
  it("should createModelTester produce a working instance", async () => {
    const { createModelTester } = await import("../cli/commands/model-tester.ts");

    const tester = createModelTester({
      maxTimeoutMs: 5000,
    });

    expect(tester).toBeDefined();
    expect(typeof tester.sendTestPrompt).toBe("function");
  });
});
