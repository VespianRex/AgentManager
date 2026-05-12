import { describe, it, expect } from "bun:test";
import type { AgentManagerArgs, ToolContext } from "../src/plugin.js";
import type { BenchmarkConfig } from "../src/services/model-tester/model-tester.js";

/**
 * TDD RED phase: Type safety tests for src/plugin.ts lines 49, 143
 *
 * These tests verify that:
 * 1. AgentManagerArgs.configs is typed as BenchmarkConfig[] (not unknown[])
 *    - This fixes TS2339 on line 101/104 (.model/.prompt access on object)
 *    - This fixes TS2345 on line 125 (unknown[] not assignable to BenchmarkConfig[])
 * 2. ToolContext has proper AbortSignal typing
 * 3. DRY: BenchmarkConfig is imported from model-tester, not duplicated
 */
describe("plugin type safety (C1)", () => {
  describe("AgentManagerArgs interface", () => {
    it("should reject number for configPath", () => {
      // @ts-expect-error - number should not be assignable to string | undefined
      const invalidArgs: AgentManagerArgs = { configPath: 123 };
      expect(invalidArgs).toBeDefined();
    });

    it("should reject boolean for action", () => {
      // @ts-expect-error - boolean should not be assignable to string | undefined
      const invalidArgs: AgentManagerArgs = { action: true };
      expect(invalidArgs).toBeDefined();
    });

    it("should reject string for document", () => {
      // @ts-expect-error - string should not be assignable to AgentManagerDocument | undefined
      const invalidArgs: AgentManagerArgs = { document: "not an object" };
      expect(invalidArgs).toBeDefined();
    });

    it("should reject non-array object for configs", () => {
      // @ts-expect-error - plain object should not be assignable to BenchmarkConfig[] | undefined
      const invalidArgs: AgentManagerArgs = { configs: { model: "gpt-4" } };
      expect(invalidArgs).toBeDefined();
    });

    it("should reject string for timeoutMs", () => {
      // @ts-expect-error - string should not be assignable to number | undefined
      const invalidArgs: AgentManagerArgs = { timeoutMs: "30000" };
      expect(invalidArgs).toBeDefined();
    });

    it("should accept valid args with all optional fields", () => {
      const validArgs: AgentManagerArgs = {
        configPath: "opencode.json",
        action: "save",
        document: { agents: {} },
        configs: [{ model: "gpt-4", prompt: "test" }],
        timeoutMs: 30000,
      };
      expect(validArgs.configPath).toBe("opencode.json");
      expect(validArgs.action).toBe("save");
      expect(validArgs.timeoutMs).toBe(30000);
    });

    it("should accept partial args", () => {
      const partialArgs: AgentManagerArgs = { configPath: "test.json" };
      expect(partialArgs.configPath).toBe("test.json");
      expect(partialArgs.action).toBeUndefined();
    });

    it("should accept empty args object", () => {
      const emptyArgs: AgentManagerArgs = {};
      expect(emptyArgs).toBeDefined();
    });
  });

  describe("AgentManagerArgs.configs typed as BenchmarkConfig[]", () => {
    it("should allow accessing .model on configs elements without cast", () => {
      const args: AgentManagerArgs = {
        action: "benchmark",
        configs: [{ model: "gpt-4", prompt: "test" }],
      };
      // This would fail TS if configs were unknown[] — the core violation at line 101
      const firstModel = args.configs?.[0]?.model;
      expect(firstModel).toBe("gpt-4");
    });

    it("should allow accessing .prompt on configs elements without cast", () => {
      const args: AgentManagerArgs = {
        action: "benchmark",
        configs: [{ model: "gpt-4", prompt: "hello" }],
      };
      // This would fail TS if configs were unknown[] — the core violation at line 104
      const firstPrompt = args.configs?.[0]?.prompt;
      expect(firstPrompt).toBe("hello");
    });

    it("should be assignable to BenchmarkConfig[] without cast", () => {
      const args: AgentManagerArgs = {
        action: "benchmark",
        configs: [
          { model: "gpt-4", prompt: "test1" },
          { model: "claude-3.5", prompt: "test2" },
        ],
      };
      // This would fail TS if configs were unknown[] — the core violation at line 125
      const typedConfigs: BenchmarkConfig[] = args.configs ?? [];
      expect(typedConfigs).toHaveLength(2);
      expect(typedConfigs[0].model).toBe("gpt-4");
    });

    it("should reject configs with missing required prompt field", () => {
      // @ts-expect-error - BenchmarkConfig requires prompt: string
      const invalidArgs: AgentManagerArgs = {
        configs: [{ model: "gpt-4" }],
      };
      expect(invalidArgs).toBeDefined();
    });

    it("should reject configs with wrong model type", () => {
      // @ts-expect-error - model must be string, not number
      const invalidArgs: AgentManagerArgs = {
        configs: [{ model: 42, prompt: "test" }],
      };
      expect(invalidArgs).toBeDefined();
    });
  });

  describe("ToolContext interface", () => {
    it("should reject missing signal property", () => {
      // @ts-expect-error - signal is required
      const invalidContext: ToolContext = {};
      expect(invalidContext).toBeDefined();
    });

    it("should reject non-AbortSignal for signal", () => {
      // @ts-expect-error - string should not be assignable to AbortSignal
      const invalidContext: ToolContext = { signal: "not a signal" };
      expect(invalidContext).toBeDefined();
    });

    it("should accept valid context with AbortSignal", () => {
      const controller = new AbortController();
      const validContext: ToolContext = { signal: controller.signal };
      expect(validContext.signal).toBe(controller.signal);
    });
  });

  describe("DRY compliance - types reused, not duplicated", () => {
    it("should reuse AgentManagerDocument type from types.ts", () => {
      type Document = import("../src/types.js").AgentManagerDocument;
      const doc: Document = { agents: { oracle: { model: "gpt-4" } } };
      expect(doc.agents).toBeDefined();
    });

    it("should reuse BenchmarkConfig from model-tester service", () => {
      const config: BenchmarkConfig = {
        model: "llama-3.1-70b",
        prompt: "benchmark test",
      };
      expect(config.model).toBe("llama-3.1-70b");
    });

    it("AgentManagerArgs.configs should be same type as BenchmarkConfig[]", () => {
      const args: AgentManagerArgs = {
        configs: [{ model: "gpt-4", prompt: "test" }],
      };
      const extracted: BenchmarkConfig[] | undefined = args.configs;
      expect(extracted).toHaveLength(1);
    });
  });
});
