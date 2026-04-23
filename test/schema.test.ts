import { describe, it, expect } from "bun:test";
import {
  AgentPermissionSchema,
  AgentConfigSchema,
  CategoryConfigSchema,
  AgentManagerDocumentSchema,
  validateAgentManagerDocument,
  validatePartialAgentManagerDocument,
} from "../src/schema.js";

describe("schema validation", () => {
  describe("AgentPermissionSchema", () => {
    it("accepts valid permission values", () => {
      const valid = {
        edit: "ask" as const,
        bash: "allow" as const,
        read: "deny" as const,
        write: "ask" as const,
      };
      const result = AgentPermissionSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it("accepts partial permissions", () => {
      const partial = { edit: "allow" as const };
      const result = AgentPermissionSchema.parse(partial);
      expect(result).toEqual(partial);
    });

    it("accepts empty object", () => {
      const result = AgentPermissionSchema.parse({});
      expect(result).toEqual({});
    });

    it("rejects invalid permission values", () => {
      const invalid = { edit: "invalid" as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects non-string permission values", () => {
      const invalid = { edit: 123 as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with wrong type", () => {
      const invalid = { edit: true as any, bash: [] as any, read: {} as any, write: null as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with extra nested objects", () => {
      const invalid = { edit: { nested: "value" } as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("rejects permission values with arrays", () => {
      const invalid = { edit: ["ask", "allow"] as any };
      expect(() => AgentPermissionSchema.parse(invalid)).toThrow();
    });

    it("strips additional unknown permissions", () => {
      const withUnknown = {
        edit: "ask",
        unknown: "allow",
      };
      const result = AgentPermissionSchema.parse(withUnknown);
      expect(result).toEqual({ edit: "ask" });
      expect(result).not.toHaveProperty("unknown");
    });
  });

  describe("AgentConfigSchema", () => {
    it("accepts complete agent config", () => {
      const config = {
        model: "gpt-4",
        permission: { edit: "ask" as const, bash: "allow" as const },
        fallback: "oracle" as const,
        fallbacks: ["oracle" as const, "explore" as const],
      };
      const result = AgentConfigSchema.parse(config);
      expect(result).toEqual(config);
    });

    it("accepts minimal agent config", () => {
      const config = {};
      const result = AgentConfigSchema.parse(config);
      expect(result).toEqual({});
    });

    it("accepts agent with only model", () => {
      const config = { model: "claude-3" as const };
      const result = AgentConfigSchema.parse(config);
      expect(result.model).toBe("claude-3");
    });

    it("rejects invalid permission in agent config", () => {
      const config = {
        model: "gpt-4" as const,
        permission: { edit: "invalid" as any },
      };
      expect(() => AgentConfigSchema.parse(config)).toThrow();
    });

    it("rejects non-array fallbacks", () => {
      const config = {
        fallbacks: "oracle" as any,
      };
      expect(() => AgentConfigSchema.parse(config)).toThrow();
    });

    it("rejects non-string fallback", () => {
      const config = {
        fallback: 123 as any,
      };
      expect(() => AgentConfigSchema.parse(config)).toThrow();
    });
  });

  describe("CategoryConfigSchema", () => {
    it("accepts complete category config", () => {
      const config = {
        model: "gpt-4" as const,
        permission: { read: "allow" as const },
        fallback: "quick" as const,
        fallbacks: ["quick" as const, "detailed" as const],
      };
      const result = CategoryConfigSchema.parse(config);
      expect(result).toEqual(config);
    });

    it("accepts empty category config", () => {
      const config = {};
      const result = CategoryConfigSchema.parse(config);
      expect(result).toEqual({});
    });
  });

  describe("AgentManagerDocumentSchema", () => {
    it("accepts complete document", () => {
      const doc = {
        agents: {
          explore: { model: "gpt-4" },
          oracle: { model: "claude-3" },
        },
        categories: {
          quick: { model: "gpt-3.5" },
        },
        disabled_hooks: ["comment-checker"],
        disabled_agents: ["artistry"],
        disabled_skills: ["frontend-ui-ux"],
        sisyphus_agent: "sisyphus",
        background_task: "background",
      };
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(result).toEqual(doc);
    });

    it("accepts empty document", () => {
      const doc = {};
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(result).toEqual({});
    });

    it("accepts document with only agents", () => {
      const doc = {
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(result.agents).toBeDefined();
      expect(result.categories).toBeUndefined();
    });

    it("accepts document with only categories", () => {
      const doc = {
        categories: {
          quick: { model: "gpt-4" },
        },
      };
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(result.categories).toBeDefined();
      expect(result.agents).toBeUndefined();
    });

    it("rejects non-object agents", () => {
      const doc = {
        agents: "invalid",
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-object categories", () => {
      const doc = {
        categories: ["invalid"],
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-array disabled_hooks", () => {
      const doc = {
        disabled_hooks: "hook1",
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-array disabled_agents", () => {
      const doc = {
        disabled_agents: { agent: true },
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-array disabled_skills", () => {
      const doc = {
        disabled_skills: 123,
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-string sisyphus_agent", () => {
      const doc = {
        sisyphus_agent: 123,
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects non-string background_task", () => {
      const doc = {
        background_task: {},
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects invalid agent config within agents", () => {
      const doc = {
        agents: {
          test: { model: 123 },
        },
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("strips invalid permission fields from category config", () => {
      const doc = {
        categories: {
          test: { permission: { invalid: "value" } },
        },
      };
      const result = AgentManagerDocumentSchema.parse(doc);
       expect(result.categories?.test?.permission).toEqual({});
    });

    it("accepts agents with string keys including numbers", () => {
      const doc = {
        agents: {
          "123": { model: "gpt-4" },
          "agent-456": { model: "claude-3" },
        },
      };
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(Object.keys(result.agents ?? {})).toHaveLength(2);
      expect(result.agents?.["123"]?.model).toBe("gpt-4");
    });

    it("accepts categories with string keys including numbers", () => {
      const doc = {
        categories: {
          "789": { model: "gpt-4" },
          "category-101": { model: "claude-3" },
        },
      };
      const result = AgentManagerDocumentSchema.parse(doc);
      expect(Object.keys(result.categories ?? {})).toHaveLength(2);
    });

    it("rejects malformed category config with invalid nested fields", () => {
      const doc = {
        categories: {
          quick: {
            model: 123,
            permission: "invalid",
            fallback: [],
            fallbacks: "not an array",
          },
        },
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects agents with invalid fallback model references", () => {
      const doc = {
        agents: {
          test: {
            fallback: 123,
          },
        },
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });

    it("rejects agents with invalid fallbacks array", () => {
      const doc = {
        agents: {
          test: {
            fallbacks: [123, "valid", null, {}],
          },
        },
      };
      expect(() => AgentManagerDocumentSchema.parse(doc)).toThrow();
    });
  });

  describe("validateAgentManagerDocument", () => {
    it("returns validated document for valid input", () => {
      const doc = {
        agents: { test: { model: "gpt-4" } },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result).toEqual(doc);
    });

    it("throws error for invalid document", () => {
      const doc = {
        agents: "invalid",
      };
      expect(() => validateAgentManagerDocument(doc)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for null input", () => {
      expect(() => validateAgentManagerDocument(null)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for undefined input", () => {
      expect(() => validateAgentManagerDocument(undefined)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for non-object input", () => {
      expect(() => validateAgentManagerDocument("string")).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for array input", () => {
      expect(() => validateAgentManagerDocument(["invalid"])).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for number input", () => {
      expect(() => validateAgentManagerDocument(123)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for boolean input", () => {
      expect(() => validateAgentManagerDocument(true)).toThrow(
        "Invalid configuration document"
      );
    });
  });

  describe("validatePartialAgentManagerDocument", () => {
    it("returns validated partial document", () => {
      const doc = {
        agents: { test: { model: "gpt-4" } },
      };
      const result = validatePartialAgentManagerDocument(doc);
      expect(result).toEqual(doc);
    });

    it("accepts partial document with only some fields", () => {
      const doc = {
        sisyphus_agent: "test",
      };
      const result = validatePartialAgentManagerDocument(doc);
      expect(result.sisyphus_agent).toBe("test");
    });

    it("accepts empty object as partial", () => {
      const result = validatePartialAgentManagerDocument({});
      expect(result).toEqual({});
    });

    it("allows all optional fields to be omitted", () => {
      const partial = {
        agents: {
          test: {
            model: "gpt-4",
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("gpt-4");
      expect(result.categories).toBeUndefined();
      expect(result.disabled_hooks).toBeUndefined();
      expect(result.disabled_agents).toBeUndefined();
      expect(result.disabled_skills).toBeUndefined();
      expect(result.sisyphus_agent).toBeUndefined();
      expect(result.background_task).toBeUndefined();
    });

    it("strips extra top-level fields not in schema", () => {
      const partial = {
        agents: { test: { model: "gpt-4" } },
        extraField: "should be stripped",
        anotherExtra: 123,
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result).not.toHaveProperty("extraField");
      expect(result).not.toHaveProperty("anotherExtra");
    });

    it("strips extra fields within agent config", () => {
      const partial = {
        agents: {
          test: {
            model: "gpt-4",
            extraField: "strip me",
            nested: { deep: "value" },
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("gpt-4");
      expect(result.agents?.test).not.toHaveProperty("extraField");
      expect(result.agents?.test).not.toHaveProperty("nested");
    });

    it("strips extra fields within category config", () => {
      const partial = {
        categories: {
          quick: {
            model: "claude-3",
            invalidField: 456,
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.categories?.quick?.model).toBe("claude-3");
      expect(result.categories?.quick).not.toHaveProperty("invalidField");
    });

    it("rejects partial with invalid agent model type", () => {
      const partial = {
        agents: {
          test: {
            model: 123 as any,
          },
        },
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with invalid permission values", () => {
      const partial = {
        agents: {
          test: {
            permission: { edit: "invalid" as any },
          },
        },
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with non-array fallbacks", () => {
      const partial = {
        agents: {
          test: {
            fallbacks: "not an array" as any,
          },
        },
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with non-string fallback", () => {
      const partial = {
        agents: {
          test: {
            fallback: 123 as any,
          },
        },
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with invalid disabled_hooks type", () => {
      const partial = {
        disabled_hooks: "not an array" as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with invalid disabled_agents type", () => {
      const partial = {
        disabled_agents: "not an array" as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with invalid disabled_skills type", () => {
      const partial = {
        disabled_skills: "not an array" as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with non-string sisyphus_agent", () => {
      const partial = {
        sisyphus_agent: 123 as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("rejects partial with non-string background_task", () => {
      const partial = {
        background_task: 123 as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("handles partial document with null values in optional fields", () => {
      const partial = {
        agents: {
          test: {
            model: null as any,
            permission: null as any,
          },
        },
        sisyphus_agent: null as any,
        background_task: null as any,
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("handles partial document with undefined values in optional fields", () => {
      const partial = {
        agents: {
          test: {
            model: undefined,
          },
        },
        sisyphus_agent: undefined,
        background_task: undefined,
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBeUndefined();
      expect(result.sisyphus_agent).toBeUndefined();
      expect(result.background_task).toBeUndefined();
    });

    it("handles partial document with mixed valid/invalid array values", () => {
      const partial = {
        disabled_hooks: ["valid-hook", 123 as any, "another-valid"],
        disabled_agents: ["valid-agent", {}, "another-valid"],
        disabled_skills: ["valid-skill", [], "another-valid"],
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("handles partial document with arrays containing invalid items", () => {
      const partial = {
        agents: {
          test: {
            fallbacks: ["valid", 123 as any, null as any, {} as any],
          },
        },
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("handles deeply nested partial updates", () => {
      const partial = {
        agents: {
          level1: {
            model: "deep-model",
            permission: {
              edit: "ask",
            },
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.level1?.model).toBe("deep-model");
      expect(result.agents?.level1?.permission?.edit).toBe("ask");
    });

    it("handles partial document with special characters in keys", () => {
      const partial = {
        agents: {
          "agent-with-dashes": { model: "test" },
          "agent_with_underscores": { model: "test" },
          "agent.with.dots": { model: "test" },
        },
        disabled_hooks: ["hook-with-dashes", "hook_with_underscores"],
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(Object.keys(result.agents ?? {})).toHaveLength(3);
      expect(result.disabled_hooks).toEqual([
        "hook-with-dashes",
        "hook_with_underscores",
      ]);
    });

    it("handles partial document with empty string values", () => {
      const partial = {
        agents: {
          test: { model: "" },
        },
        sisyphus_agent: "",
        background_task: "",
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("");
      expect(result.sisyphus_agent).toBe("");
      expect(result.background_task).toBe("");
    });

    it("handles partial document with unicode values", () => {
      const partial = {
        agents: {
          test: { model: "模型-测试" },
        },
        sisyphus_agent: "シシフォス",
        disabled_hooks: ["フック-チェック"],
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("模型-测试");
      expect(result.sisyphus_agent).toBe("シシフォス");
      expect(result.disabled_hooks).toEqual(["フック-チェック"]);
    });

    it("handles partial document with very large number of agents", () => {
      const agents: Record<string, { model: string }> = {};
      for (let i = 0; i < 1000; i++) {
        agents[`agent${i}`] = { model: `model${i}` };
      }
      const partial = { agents };
      const result = validatePartialAgentManagerDocument(partial);
      expect(Object.keys(result.agents ?? {})).toHaveLength(1000);
    });

    it("handles partial document with very long fallbacks array", () => {
      const partial = {
        agents: {
          test: {
            fallbacks: Array.from({ length: 100 }, (_, i) => `fallback${i}`),
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.fallbacks).toHaveLength(100);
    });

    it("handles partial document with circular references safely", () => {
      const agents: Record<string, unknown> = { agent1: {} };
      (agents as any).agent1 = agents;
      const partial = { agents };
      // Should not cause infinite loop or crash; may throw or return
      expect(() => validatePartialAgentManagerDocument(partial)).not.toThrow();
    });

    it("handles partial document with null prototype objects", () => {
      const nullProto = Object.create(null);
      nullProto.model = "test";
      const partial = {
        agents: {
          test: nullProto,
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("test");
    });

    it("handles partial document with symbol keys (should be ignored)", () => {
      const sym = Symbol("test");
      const partial: any = {
        agents: {
          test: { model: "gpt-4" },
        },
      };
      partial[sym] = "should be stripped";
      const result = validatePartialAgentManagerDocument(partial);
      expect(result[sym]).toBeUndefined();
      expect(Object.keys(result)).not.toContain(sym.toString());
    });

    it("throws error for invalid partial document", () => {
      const doc = {
        agents: "invalid",
      };
      expect(() => validatePartialAgentManagerDocument(doc)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for null input", () => {
      expect(() => validatePartialAgentManagerDocument(null)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for undefined input", () => {
      expect(() => validatePartialAgentManagerDocument(undefined)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for non-object partial input", () => {
      expect(() => validatePartialAgentManagerDocument("string")).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for array input", () => {
      expect(() => validatePartialAgentManagerDocument(["invalid"])).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for number input", () => {
      expect(() => validatePartialAgentManagerDocument(123)).toThrow(
        "Invalid configuration document"
      );
    });

    it("throws error for boolean input", () => {
      expect(() => validatePartialAgentManagerDocument(true)).toThrow(
        "Invalid configuration document"
      );
    });
  });

  describe("edge cases", () => {
    it("handles deeply nested agent configs", () => {
      const doc = {
        agents: {
          level1: {
            model: "gpt-4",
            permission: {
              edit: "ask",
              bash: "allow",
              read: "deny",
              write: "ask",
            },
          },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.level1?.permission?.edit).toBe("ask");
    });

    it("handles empty arrays in disabled fields", () => {
      const doc = {
        disabled_hooks: [],
        disabled_agents: [],
        disabled_skills: [],
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.disabled_hooks).toEqual([]);
      expect(result.disabled_agents).toEqual([]);
      expect(result.disabled_skills).toEqual([]);
    });

    it("handles special characters in agent names", () => {
      const doc = {
        agents: {
          "agent-with-dashes": { model: "gpt-4" },
          "agent_with_underscores": { model: "gpt-4" },
          "agent.with.dots": { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(Object.keys(result.agents ?? {})).toHaveLength(3);
    });

    it("handles unicode in string values", () => {
      const doc = {
        agents: {
          test: { model: "模型-测试" },
        },
        sisyphus_agent: "シシフォス",
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.model).toBe("模型-测试");
      expect(result.sisyphus_agent).toBe("シシフォス");
    });

    it("handles very long strings", () => {
      const longString = "a".repeat(10000);
      const doc = {
        agents: {
          test: { model: longString },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.model).toBe(longString);
    });

    it("handles many agents", () => {
      const agents: Record<string, { model: string }> = {};
      for (let i = 0; i < 100; i++) {
        agents[`agent${i}`] = { model: `model${i}` };
      }
      const doc = { agents };
      const result = validateAgentManagerDocument(doc);
      expect(Object.keys(result.agents ?? {})).toHaveLength(100);
    });

    it("handles many fallbacks", () => {
      const doc = {
        agents: {
          test: {
            fallbacks: Array.from({ length: 50 }, (_, i) => `fallback${i}`),
          },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.fallbacks).toHaveLength(50);
    });

    it("handles null values in optional fields gracefully", () => {
      const doc = {
        agents: {
          test: {
            model: null,
            permission: null,
            fallback: null,
            fallbacks: null,
          },
        },
      };
      expect(() => validateAgentManagerDocument(doc)).toThrow();
    });

    it("handles undefined values in optional fields", () => {
      const doc = {
        agents: {
          test: {
            model: undefined,
          },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.model).toBeUndefined();
    });

    it("rejects document with circular references", () => {
      const agents: Record<string, unknown> = { agent1: {} };
      (agents as any).agent1 = agents;
      const doc = { agents };
      expect(() => validateAgentManagerDocument(doc)).toThrow();
    });

    it("rejects document with prototype pollution attempts", () => {
      const doc = {
        __proto__: { polluted: true },
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).polluted).toBeUndefined();
    });

    it("handles document with constructor property", () => {
      const doc = {
        constructor: "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).constructor).toBeUndefined();
    });

    it("handles document with toString property", () => {
      const doc = {
        toString: () => "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(typeof (result as any).toString).toBe("function");
    });

    it("handles document with valueOf property", () => {
      const doc = {
        valueOf: () => "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(typeof (result as any).valueOf).toBe("function");
    });

    it("handles document with hasOwnProperty property", () => {
      const doc = {
        hasOwnProperty: "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).hasOwnProperty).toBeUndefined();
    });

    it("handles document with isPrototypeOf property", () => {
      const doc = {
        isPrototypeOf: "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).isPrototypeOf).toBeUndefined();
    });

    it("handles document with propertyIsEnumerable property", () => {
      const doc = {
        propertyIsEnumerable: "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).propertyIsEnumerable).toBeUndefined();
    });

    it("handles document with toLocaleString property", () => {
      const doc = {
        toLocaleString: "malicious",
        agents: {
          test: { model: "gpt-4" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect((result as any).toLocaleString).toBeUndefined();
    });

    it("handles partial document with only invalid fields", () => {
      const partial = {
        invalidField: "should be stripped",
        anotherInvalid: 123,
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result).toEqual({});
    });

    it("handles partial document with mixed valid/invalid nested fields", () => {
      const partial = {
        agents: {
          test: {
            model: "gpt-4",
            invalidNested: { deep: "value" },
          },
        },
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.agents?.test?.model).toBe("gpt-4");
      expect((result.agents?.test as any).invalidNested).toBeUndefined();
    });

    it("handles partial document with arrays containing null/undefined", () => {
      const partial = {
        disabled_hooks: ["valid", null as any, undefined as any, "another"],
      };
      expect(() => validatePartialAgentManagerDocument(partial)).toThrow();
    });

    it("handles partial document with duplicate array values", () => {
      const partial = {
        disabled_hooks: ["hook1", "hook1", "hook2", "hook2"],
      };
      const result = validatePartialAgentManagerDocument(partial);
      expect(result.disabled_hooks).toEqual(["hook1", "hook1", "hook2", "hook2"]);
    });

    it("rejects permission values with whitespace", () => {
      const doc = {
        agents: {
          test: {
            permission: { edit: " ask " as any },
          },
        },
      };
      expect(() => validateAgentManagerDocument(doc)).toThrow();
    });

    it("handles permission values with mixed case", () => {
      const doc = {
        agents: {
          test: {
            permission: { edit: "ASK" as any },
          },
        },
      };
      expect(() => validateAgentManagerDocument(doc)).toThrow();
    });

    it("handles empty string as model", () => {
      const doc = {
        agents: {
          test: { model: "" },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.model).toBe("");
    });

    it("handles whitespace-only string as model", () => {
      const doc = {
        agents: {
          test: { model: "   " },
        },
      };
      const result = validateAgentManagerDocument(doc);
      expect(result.agents?.test?.model).toBe("   ");
    });

    it("includes error details in thrown error", () => {
      const doc = {
        agents: "invalid",
      };
      expect(() => validateAgentManagerDocument(doc)).toThrow("Invalid configuration document");
    });

    it("handles document with 10,000 agents efficiently", () => {
      const agents: Record<string, { model: string }> = {};
      for (let i = 0; i < 10000; i++) {
        agents[`agent${i}`] = { model: `model${i}` };
      }
      const doc = { agents };
      const start = performance.now();
      const result = validateAgentManagerDocument(doc);
      const end = performance.now();
      expect(Object.keys(result.agents ?? {})).toHaveLength(10000);
      expect(end - start).toBeLessThan(1000);
    });

    it("handles document with 10,000 fallbacks efficiently", () => {
      const doc = {
        agents: {
          test: {
            fallbacks: Array.from({ length: 10000 }, (_, i) => `fallback${i}`),
          },
        },
      };
      const start = performance.now();
      const result = validateAgentManagerDocument(doc);
      const end = performance.now();
      expect(result.agents?.test?.fallbacks).toHaveLength(10000);
      expect(end - start).toBeLessThan(1000);
    });
  });
});
