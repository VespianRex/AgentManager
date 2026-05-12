import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { AgentManagerDocumentSchema } from "../src/schema.js";

// Define the expected schema for type-safe args (mirrors what should be in plugin.ts)
const AgentManagerArgsSchema = z.object({
  configPath: z.string().optional(),
  action: z.string().optional(),
  document: AgentManagerDocumentSchema.optional(),
  configs: z.array(z.unknown()).optional(),
  timeoutMs: z.number().optional(),
});

type AgentManagerArgs = z.infer<typeof AgentManagerArgsSchema>;

describe("plugin type safety (C1)", () => {
  describe("AgentManagerArgsSchema validation", () => {
    it("declares benchmark args in the host-facing tool schema", async () => {
      const pluginSource = await Bun.file("src/plugin.ts").text();
      expect(pluginSource).toMatch(/args:\s*{[\s\S]*configs:\s*tool\.schema\.array/);
      expect(pluginSource).toMatch(/args:\s*{[\s\S]*timeoutMs:\s*tool\.schema\.number/);
    });

    it("should accept valid inspect args", () => {
      const args = { configPath: "opencode.json" };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(true);
    });

    it("should accept valid save args with document", () => {
      const args = {
        action: "save",
        document: {
          agents: { oracle: { model: "gpt-4" } },
        },
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(true);
    });

    it("should accept valid benchmark args", () => {
      const args = {
        action: "benchmark",
        configs: [{ model: "gpt-4", prompt: "test" }],
        timeoutMs: 30000,
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(true);
    });

    it("should reject wrong type for configPath (number instead of string)", () => {
      const args = { configPath: 123 };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(false);
    });

    it("should reject wrong type for action (boolean instead of string)", () => {
      const args = { action: true };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(false);
    });

    it("should reject wrong type for configs (object instead of array)", () => {
      const args = {
        action: "benchmark",
        configs: { model: "gpt-4" }, // should be array
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(false);
    });

    it("should reject wrong type for timeoutMs (string instead of number)", () => {
      const args = {
        action: "benchmark",
        timeoutMs: "30000", // should be number
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(false);
    });

    it("should reject invalid document structure", () => {
      const args = {
        action: "save",
        document: "not an object", // should be object
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(false);
    });

    it("should allow empty args object", () => {
      const result = AgentManagerArgsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should allow null/undefined optional fields", () => {
      const args = {
        configPath: undefined,
        action: undefined,
        document: undefined,
        configs: undefined,
        timeoutMs: undefined,
      };
      const result = AgentManagerArgsSchema.safeParse(args);
      expect(result.success).toBe(true);
    });
  });

  describe("type inference", () => {
    it("should infer correct types from schema", () => {
      const validArgs: AgentManagerArgs = {
        configPath: "test.json",
        action: "save",
        document: { agents: {} },
        configs: [{ model: "gpt-4" }],
        timeoutMs: 5000,
      };
      // Type check at compile time - if this compiles, types are correct
      expect(validArgs.configPath).toBe("test.json");
      expect(validArgs.action).toBe("save");
      expect(validArgs.timeoutMs).toBe(5000);
    });

    it("should allow partial args", () => {
      const partialArgs: AgentManagerArgs = {
        configPath: "test.json",
        // other fields omitted
      };
      expect(partialArgs.configPath).toBe("test.json");
      expect(partialArgs.action).toBeUndefined();
    });
  });
});
