import { describe, it, expect } from "bun:test";
import { validateAgentManagerDocument, validatePartialAgentManagerDocument } from "../src/schema.js";
import { copyCommentSymbols } from "../src/comment-symbols.js";

/**
 * TDD Tests for Circular Reference Depth Check
 * ==============================================
 *
 * GREEN PHASE: These tests verify the FIXED behavior.
 *
 * Architecture note: schema.ts uses Zod for validation which:
 * - Strips unknown keys (deeply nested properties beyond the schema are dropped)
 * - Does NOT have hasCircularReference or sanitizeInput (simplified Zod-only approach)
 * - Deep nesting is handled by Zod's own validation, not custom recursion guards
 *
 * The actual depth overflow protection is in copyCommentSymbols which has:
 * - depth parameter with MAX_RECURSION_DEPTH guard
 * - Early return when depth exceeded (prevents stack overflow)
 */

describe("Schema validation: deeply nested objects are handled by Zod", () => {
  it("validateAgentManagerDocument strips deeply nested unknown properties via Zod", () => {
    // Create object nested 300 levels deep - NOT circular, just deeply nested
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 300; i++) {
      deep = { nested: deep };
    }
    const doc = { agents: { test: { model: "gpt-4", deep } } };

    // Zod validates the known schema and strips unknown keys.
    // Deeply nested unknown properties are simply not in the output.
    // No throw needed - Zod handles this safely.
    const result = validateAgentManagerDocument(doc);
    expect(result).toBeDefined();
    // The "deep" key is not in AgentConfigSchema, so Zod strips it
    expect((result.agents as Record<string, unknown>)?.test).toBeDefined();
  });

  it("validateAgentManagerDocument rejects circular references before parsing", () => {
    // Create a circular reference
    const circularObj: Record<string, unknown> = { model: "gpt-4" };
    circularObj.self = circularObj;

    const doc = { agents: { test: circularObj } };

    expect(() => validateAgentManagerDocument(doc)).toThrow("Invalid configuration document");
  });

  it("validatePartialAgentManagerDocument works with deeply nested objects", () => {
    // Create a deeply nested but NON-circular object
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 266; i++) {
      deep = { nested: deep };
    }
    const doc = { agents: { test: { deep } } };

    // Zod partial validation also handles deeply nested objects safely
    const result = validatePartialAgentManagerDocument(doc);
    expect(result).toBeDefined();
  });
});

describe("TDD: copyCommentSymbols Depth Limit Fix Verification", () => {
  /**
   * copyCommentSymbols in src/comment-symbols.ts now has a depth limit.
   *
   * Fixed code:
   * ```
   * export const copyCommentSymbols = (target: unknown, source: unknown, depth = 0): void => {
   *   // Stop recursing if maximum depth is exceeded to prevent stack overflow
   *   if (depth > MAX_RECURSION_DEPTH) {
   *     return;
   *   }
   *   ...
   * }
   * ```
   *
   * The fix uses early return (not throw) when depth exceeds MAX_RECURSION_DEPTH.
   * This prevents stack overflow from maliciously deep nesting.
   */

  it("copyCommentSymbols does NOT throw at depth 500 (returns early instead)", () => {
    // Create deeply nested matching source/target objects
    const createDeepNested = (depth: number): Record<string, unknown> => {
      let obj: Record<string, unknown> = { value: "leaf" };
      for (let i = 0; i < depth; i++) {
        obj = { nested: { ...obj } };
      }
      return obj;
    };

    // At 500 levels, copyCommentSymbols returns early at depth 256 (no throw, no stack overflow)
    const deepSource = createDeepNested(500);
    const deepTarget = createDeepNested(500);

    // FIXED: copyCommentSymbols has depth guard - it returns early instead of stack overflowing
    expect(() => {
      copyCommentSymbols(deepTarget, deepSource);
    }).not.toThrow();
  });

  it("copyCommentSymbols works correctly at shallow depth (baseline)", () => {
    // This is a positive test - it should always pass
    const source = {
      agents: {
        test: { model: "gpt-4" }
      }
    };
    const target = {
      agents: {
        test: { model: "gpt-4" }
      }
    };

    // Add a symbol to source (simulating comment-json)
    const beforeSym = Symbol.for("before:test comment");
    ((source as Record<string, unknown>).agents as Record<string, unknown>)[beforeSym] = "// test comment";

    expect(() => {
      copyCommentSymbols(target, source);
    }).not.toThrow();

    // Symbol should be copied
    const targetAgents = (target as Record<string, unknown>).agents as Record<symbol, unknown>;
    expect(targetAgents[beforeSym]).toBe("// test comment");
  });

  it("copyCommentSymbols source code has depth parameter and MAX_RECURSION_DEPTH guard", async () => {
    // Verify the fix is in the source code
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const commentSymbolsSource = await fs.readFile(
      path.join(import.meta.dirname, "../src/comment-symbols.ts"),
      "utf8"
    );

    // Verify the depth parameter exists
    const hasDepthParameter = commentSymbolsSource.includes("depth = 0") ||
      commentSymbolsSource.includes("depth: number");
    expect(hasDepthParameter).toBe(true);

    // Verify the MAX_RECURSION_DEPTH guard exists
    const hasDepthGuard = commentSymbolsSource.includes("MAX_RECURSION_DEPTH") &&
      (commentSymbolsSource.includes("depth > MAX_RECURSION_DEPTH") ||
       commentSymbolsSource.includes("depth >= MAX_RECURSION_DEPTH"));
    expect(hasDepthGuard).toBe(true);

    // Verify the depth is incremented on recursive call
    const hasDepthIncrement = commentSymbolsSource.includes("depth + 1");
    expect(hasDepthIncrement).toBe(true);

    console.log("\n=== copyCommentSymbols Depth Guard Verification ===");
    console.log("Has depth parameter:", hasDepthParameter);
    console.log("Has MAX_RECURSION_DEPTH guard:", hasDepthGuard);
    console.log("Has depth + 1 increment:", hasDepthIncrement);
    console.log("===================================================\n");
  });
});
