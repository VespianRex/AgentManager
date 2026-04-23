import { describe, it } from "node:test";
import assert from "node:assert";
import {
  runSubAgentPipeline,
  discoveryAgent,
  systemExplanationAgent,
  validationAgent,
  orchestrationAgent,
  instructionFollowAgent,
  validateAgentPermissions,
  findPromptAppendDuplicates,
  type SubAgentContext,
} from "../src/subagent.js";

const createSampleContext = (overrides?: Partial<SubAgentContext>): SubAgentContext => {
  const base: SubAgentContext = {
    source: "oh-my-opencode",
    summary: {
      path: "dummy",
      source: "project",
      type: "oh-my-opencode",
      agentCount: 2,
      categories: 1,
      hasSisyphus: true,
      disabledHooks: ["comment-checker"],
      disabledAgents: [],
      disabledSkills: [],
    },
    config: {
      agents: {
        explore: { model: "opencode/gpt-5-nano", permission: { edit: "ask" } },
        oracle: { model: "openai/gpt-5.2", permission: { bash: "allow" } },
      },
      disabled_hooks: ["comment-checker"],
      sisyphus_agent: "sisyphus",
      background_task: "background",
    },
  };
  return { ...base, ...overrides };
};

const sampleContext = createSampleContext();

describe("ConfigDiscovery Agent - Error Injection Tests", () => {
  describe("error injection scenarios", () => {
    it("throws error for null summary", () => {
      const context = createSampleContext({ summary: null as unknown as SubAgentContext["summary"] });
      assert.throws(() => discoveryAgent(context), /null is not an object/);
    });

    it("throws error for undefined summary", () => {
      const context = createSampleContext({ summary: undefined as unknown as SubAgentContext["summary"] });
      assert.throws(() => discoveryAgent(context), /undefined is not an object/);
    });

    it("handles missing agentCount in summary", () => {
      const context = createSampleContext({
        summary: { ...sampleContext.summary, agentCount: undefined as unknown as number },
      });
      const result = discoveryAgent(context);
      assert.strictEqual(result.status, "success");
      assert.ok(result.message.includes("undefined"));
    });

    it("handles negative agentCount", () => {
      const context = createSampleContext({
        summary: { ...sampleContext.summary, agentCount: -5 },
      });
      const result = discoveryAgent(context);
      assert.ok(result.message.includes("-5 agents"));
    });

    it("handles empty source string", () => {
      const context = createSampleContext({ source: "" });
      const result = discoveryAgent(context);
      assert.ok(result.message.includes(" config"));
    });

    it("handles special characters in source", () => {
      const context = createSampleContext({ source: "test<source>&special" });
      const result = discoveryAgent(context);
      assert.ok(result.message.includes("test<source>&special"));
    });

    it("handles very large agent counts", () => {
      const context = createSampleContext({
        summary: { ...sampleContext.summary, agentCount: 999999 },
      });
      const result = discoveryAgent(context);
      assert.ok(result.message.includes("999999 agents"));
    });

    it("handles very large category counts", () => {
      const context = createSampleContext({
        summary: { ...sampleContext.summary, categories: 999999 },
      });
      const result = discoveryAgent(context);
      assert.ok(result.message.includes("999999 categories"));
    });
  });
});

describe("SystemExplanation Agent - Error Propagation Tests", () => {
  describe("error handling and propagation", () => {
    it("returns success even with null config", () => {
      const context = createSampleContext({ config: null as unknown as SubAgentContext["config"] });
      const result = systemExplanationAgent(context);
      assert.strictEqual(result.status, "success");
      assert.ok(result.message.includes("Explained agent roles"));
    });

    it("returns success even with undefined config", () => {
      const context = createSampleContext({ config: undefined as unknown as SubAgentContext["config"] });
      const result = systemExplanationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("returns success with empty config object", () => {
      const context = createSampleContext({ config: {} });
      const result = systemExplanationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("always includes system overview details", () => {
      const result = systemExplanationAgent(sampleContext);
      assert.ok(result.details);
      const details = result.details as Record<string, unknown>;
      assert.ok("agents" in details);
      assert.ok("fallbackChains" in details);
      assert.ok("categoryChains" in details);
      assert.ok("permissions" in details);
    });

    it("handles malformed context gracefully", () => {
      const context = { source: "test" } as SubAgentContext;
      const result = systemExplanationAgent(context);
      assert.strictEqual(result.status, "success");
    });
  });
});

describe("ConfigValidation Agent - Invalid Config Injection Tests", () => {
  describe("invalid config injection", () => {
    it("detects invalid permission values", () => {
      const context = createSampleContext({
        config: {
          agents: {
            test: { permission: { edit: "invalid" as unknown as "ask" } },
          },
        },
      });
      const result = validationAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { permissionProblems: string[] };
      assert.ok(details.permissionProblems.length > 0);
    });

    it("detects multiple invalid permissions", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { permission: { edit: "invalid1" as unknown as "ask" } },
            agent2: { permission: { bash: "invalid2" as unknown as "ask" } },
            agent3: { permission: { read: "ask", write: "invalid3" as unknown as "ask" } },
          },
        },
      });
      const result = validationAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { permissionProblems: string[] };
      assert.strictEqual(details.permissionProblems.length, 3);
    });

    it("detects unknown disabled hooks", () => {
      const context = createSampleContext({
        config: {
          disabled_hooks: ["unknown-hook-1", "unknown-hook-2"],
        },
      });
      const result = validationAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { invalidHooks: string[] };
      assert.deepStrictEqual(details.invalidHooks, ["unknown-hook-1", "unknown-hook-2"]);
    });

    it("handles both invalid hooks and permissions", () => {
      const context = createSampleContext({
        config: {
          agents: {
            test: { permission: { edit: "invalid" as unknown as "ask" } },
          },
          disabled_hooks: ["unknown-hook"],
        },
      });
      const result = validationAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { invalidHooks: string[]; permissionProblems: string[] };
      assert.strictEqual(details.invalidHooks.length, 1);
      assert.strictEqual(details.permissionProblems.length, 1);
    });

    it("returns success with valid config", () => {
      const context = createSampleContext({
        config: {
          agents: {
            test: { permission: { edit: "ask", bash: "allow" } },
          },
          disabled_hooks: [],
        },
      });
      const result = validationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles deeply nested invalid permission structures", () => {
      const context = createSampleContext({
        config: {
          agents: {
            deep: {
              permission: {
                edit: { nested: "invalid" } as unknown as "ask",
                bash: ["array"] as unknown as "ask",
                read: 12345 as unknown as "ask",
                write: null as unknown as "ask",
              },
            },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = validationAgent(context);
      assert.ok(result.status === "warning" || result.status === "success");
    });

    it("handles null agents gracefully", () => {
      const context = createSampleContext({
        config: { agents: null as unknown as SubAgentContext["config"]["agents"] },
      });
      const result = validationAgent(context);
      assert.ok(result.status === "success" || result.status === "warning");
    });

    it("handles undefined agents gracefully", () => {
      const context = createSampleContext({
        config: { agents: undefined },
      });
      const result = validationAgent(context);
      assert.ok(result.status === "success" || result.status === "warning");
    });
  });
});

describe("OrchestrationReview Agent - Edge Case Tests", () => {
  describe("edge cases", () => {
    it("handles missing sisyphus_agent", () => {
      const context = createSampleContext({
        config: { sisyphus_agent: undefined },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
      const details = result.details as { sisyphus: unknown };
      assert.strictEqual(details.sisyphus, null);
    });

    it("handles missing background_task", () => {
      const context = createSampleContext({
        config: { background_task: undefined },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
      const details = result.details as { background_task: unknown };
      assert.strictEqual(details.background_task, null);
    });

    it("handles both missing", () => {
      const context = createSampleContext({
        config: { sisyphus_agent: undefined, background_task: undefined },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
      assert.ok(result.message.includes("No Sisyphus"));
    });

    it("handles null values", () => {
      const context = createSampleContext({
        config: { sisyphus_agent: null as unknown as string, background_task: null as unknown as string },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles empty string values", () => {
      const context = createSampleContext({
        config: { sisyphus_agent: "", background_task: "" },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles complex sisyphus_agent object", () => {
      const context = createSampleContext({
        config: { sisyphus_agent: { enabled: true, mode: "auto" } as unknown as string },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles complex background_task object", () => {
      const context = createSampleContext({
        config: { background_task: { concurrency: 5, timeout: 30000 } as unknown as string },
      });
      const result = orchestrationAgent(context);
      assert.strictEqual(result.status, "success");
    });
  });
});

describe("InstructionFollowReview Agent - Duplicate Detection Tests", () => {
  describe("duplicate detection", () => {
    it("detects single duplicate prompt_append", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "same value" },
            agent2: { prompt_append: "same value" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { promptAppendDuplicates: string[] };
      assert.deepStrictEqual(details.promptAppendDuplicates, ["agent2"]);
    });

    it("detects multiple duplicates", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "value1" },
            agent2: { prompt_append: "value1" },
            agent3: { prompt_append: "value2" },
            agent4: { prompt_append: "value2" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "warning");
      const details = result.details as { promptAppendDuplicates: string[] };
      assert.strictEqual(details.promptAppendDuplicates.length, 2);
    });

    it("detects triple duplicates", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "triple" },
            agent2: { prompt_append: "triple" },
            agent3: { prompt_append: "triple" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      const details = result.details as { promptAppendDuplicates: string[] };
      assert.strictEqual(details.promptAppendDuplicates.length, 2);
    });

    it("ignores agents without prompt_append", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { model: "gpt-4" },
            agent2: { model: "claude-3" },
          },
        },
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("ignores non-string prompt_append values", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: 123 },
            agent2: { prompt_append: 123 },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles empty string prompt_append", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "" },
            agent2: { prompt_append: "" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "warning");
    });

    it("handles very long prompt_append values", () => {
      const longText = "a".repeat(10000);
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: longText },
            agent2: { prompt_append: longText },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "warning");
    });

    it("handles special characters in prompt_append", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "Hello\nWorld\t!" },
            agent2: { prompt_append: "Hello\nWorld\t!" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "warning");
    });

    it("is case-sensitive for prompt_append", () => {
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: "Value" },
            agent2: { prompt_append: "value" },
          },
        } as unknown as SubAgentContext["config"],
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles null agents gracefully", () => {
      const context = createSampleContext({
        config: { agents: null as unknown as SubAgentContext["config"]["agents"] },
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "success");
    });

    it("handles empty agents object", () => {
      const context = createSampleContext({
        config: { agents: {} },
      });
      const result = instructionFollowAgent(context);
      assert.strictEqual(result.status, "success");
    });
  });
});

describe("Permission Check Tests - Various Invalid Values", () => {
  describe("invalid permission values", () => {
    it("rejects boolean permission values", () => {
      const agents = {
        test: { permission: { edit: true as unknown as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects numeric permission values", () => {
      const agents = {
        test: { permission: { edit: 123 as unknown as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects array permission values", () => {
      const agents = {
        test: { permission: { edit: ["ask", "allow"] as unknown as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects object permission values", () => {
      const agents = {
        test: { permission: { edit: { nested: "value" } as unknown as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects empty string permission values", () => {
      const agents = {
        test: { permission: { edit: "" as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects whitespace-only permission values", () => {
      const agents = {
        test: { permission: { edit: "   " as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("rejects mixed case valid values", () => {
      const agents = {
        test: { permission: { edit: "Ask" as "ask" } },
      };
      const issues = validateAgentPermissions(agents);
      assert.strictEqual(issues.length, 1);
    });

    it("accepts all valid permission values", () => {
      const agents = {
        test: {
          permission: {
            edit: "ask",
            bash: "allow",
            read: "deny",
            write: "ask",
          },
        },
      };
      const issues = validateAgentPermissions(agents);
      assert.deepStrictEqual(issues, []);
    });

    it("handles agents with no permission field", () => {
      const agents = {
        test: { model: "gpt-4" },
      };
      const issues = validateAgentPermissions(agents);
      assert.deepStrictEqual(issues, []);
    });

    it("handles null agent objects", () => {
      const agents = {
        test: null,
      };
      const issues = validateAgentPermissions(agents as Record<string, unknown>);
      assert.deepStrictEqual(issues, []);
    });

    it("handles undefined agent objects", () => {
      const agents = {
        test: undefined,
      };
      const issues = validateAgentPermissions(agents as Record<string, unknown>);
      assert.deepStrictEqual(issues, []);
    });

    it("handles string agent values", () => {
      const agents = {
        test: "not an object",
      };
      const issues = validateAgentPermissions(agents);
      assert.deepStrictEqual(issues, []);
    });

    it("handles number agent values", () => {
      const agents = {
        test: 123,
      };
      const issues = validateAgentPermissions(agents);
      assert.deepStrictEqual(issues, []);
    });

    it("handles many agents with mixed permissions efficiently", () => {
      const agents: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        if (i % 3 === 0) {
          agents[`agent${i}`] = { permission: { edit: "ask" } };
        } else if (i % 3 === 1) {
          agents[`agent${i}`] = { permission: { edit: "invalid" as unknown as "ask" } };
        } else {
          agents[`agent${i}`] = { model: "gpt-4" };
        }
      }
      const start = performance.now();
      const issues = validateAgentPermissions(agents);
      const duration = performance.now() - start;
      assert.ok(duration < 1000);
      assert.strictEqual(issues.length, 333);
    });
  });
});

describe("Pipeline Error Propagation Tests", () => {
  describe("error propagation between agents", () => {
    it("throws error when pipeline receives null config", () => {
      const context = createSampleContext({ config: null as unknown as SubAgentContext["config"] });
      assert.throws(() => runSubAgentPipeline(context), /null is not an object/);
    });

    it("throws error when pipeline receives undefined config", () => {
      const context = createSampleContext({ config: undefined as unknown as SubAgentContext["config"] });
      assert.throws(() => runSubAgentPipeline(context), /undefined is not an object/);
    });

    it("continues pipeline with empty agents object", () => {
      const context = createSampleContext({ config: { agents: {} } });
      const results = runSubAgentPipeline(context);
      assert.strictEqual(results.length, 5);
      const validation = results.find((r) => r.name === "ConfigValidation");
      assert.strictEqual(validation?.status, "success");
    });

    it("propagates warning status from validation to final results", () => {
      const context = createSampleContext({
        config: {
          agents: { test: { permission: { edit: "invalid" as unknown as "ask" } } },
          disabled_hooks: ["unknown-hook"],
        },
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      assert.strictEqual(validation?.status, "warning");
    });

    it("all agents execute even when validation has warnings", () => {
      const context = createSampleContext({
        config: {
          agents: { test: { permission: { edit: "invalid" as unknown as "ask" } } },
          disabled_hooks: ["unknown-hook"],
        },
      });
      const results = runSubAgentPipeline(context);
      assert.strictEqual(results.length, 5);
      const names = results.map((r) => r.name);
      assert.deepStrictEqual(names, [
        "ConfigDiscovery",
        "SystemExplanation",
        "ConfigValidation",
        "OrchestrationReview",
        "InstructionFollowReview",
      ]);
    });

    it("handles circular reference in config gracefully", () => {
      const agents: Record<string, unknown> = { agent1: {} };
      (agents as Record<string, unknown>).agent1 = agents;
      const context = createSampleContext({
        config: { agents: agents as unknown as SubAgentContext["config"]["agents"] },
        summary: { ...sampleContext.summary, agentCount: 1 },
      });
      assert.doesNotThrow(() => runSubAgentPipeline(context));
    });

    it("handles deeply nested invalid structures", () => {
      const context = createSampleContext({
        config: {
          agents: {
            deep: {
              permission: {
                edit: { nested: { invalid: "structure" } } as unknown as "ask",
                bash: ["array", "value"] as unknown as "ask",
                read: 12345 as unknown as "ask",
                write: null as unknown as "ask",
              },
            },
          },
        } as unknown as SubAgentContext["config"],
      });
      const results = runSubAgentPipeline(context);
      assert.strictEqual(results.length, 5);
      const validation = results.find((r) => r.name === "ConfigValidation");
      assert.ok(validation?.status === "warning" || validation?.status === "success");
    });

    it("handles malformed agent objects in pipeline", () => {
      const context = createSampleContext({
        config: {
          agents: {
            bad: "not an object" as unknown as { permission?: { edit?: "ask" } },
            alsoBad: 123 as unknown as { permission?: { edit?: "ask" } },
          },
        },
      });
      assert.doesNotThrow(() => runSubAgentPipeline(context));
    });

    it("handles very long prompt_append values in pipeline", () => {
      const longText = "a".repeat(10000);
      const context = createSampleContext({
        config: {
          agents: {
            agent1: { prompt_append: longText },
            agent2: { prompt_append: longText },
          },
        } as unknown as SubAgentContext["config"],
      });
      const results = runSubAgentPipeline(context);
      const instruction = results.find((r) => r.name === "InstructionFollowReview");
      assert.strictEqual(instruction?.status, "warning");
    });

    it("handles many agents without performance issues", () => {
      const agents: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        agents[`agent${i}`] = { model: `model${i}` };
      }
      const context = createSampleContext({
        config: { ...sampleContext.config, agents: agents as SubAgentContext["config"]["agents"] },
        summary: { ...sampleContext.summary, agentCount: 1000 },
      });
      const start = performance.now();
      const results = runSubAgentPipeline(context);
      const duration = performance.now() - start;
      assert.strictEqual(results.length, 5);
      assert.ok(duration < 1000);
    });

    it("handles extremely large config without crashing", () => {
      const agents: Record<string, unknown> = {};
      for (let i = 0; i < 10000; i++) {
        agents[`agent${i}`] = { model: `model${i}` };
      }
      const context = createSampleContext({
        config: { ...sampleContext.config, agents: agents as SubAgentContext["config"]["agents"] },
        summary: { ...sampleContext.summary, agentCount: 10000 },
      });
      const start = performance.now();
      assert.doesNotThrow(() => runSubAgentPipeline(context));
      const duration = performance.now() - start;
      assert.ok(duration < 5000);
    });
  });
});

describe("findPromptAppendDuplicates - Edge Cases", () => {
  describe("edge cases", () => {
    it("returns empty array for empty agents", () => {
      const duplicates = findPromptAppendDuplicates({});
      assert.deepStrictEqual(duplicates, []);
    });

    it("returns empty array when all prompt_append values are unique", () => {
      const agents = {
        agent1: { prompt_append: "unique 1" },
        agent2: { prompt_append: "unique 2" },
        agent3: { prompt_append: "unique 3" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, []);
    });

    it("detects single duplicate", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: { prompt_append: "same" },
        agent3: { prompt_append: "unique" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent2"]);
    });

    it("detects multiple duplicates", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: { prompt_append: "same" },
        agent3: { prompt_append: "another-same" },
        agent4: { prompt_append: "another-same" },
        agent5: { prompt_append: "unique" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates.sort(), ["agent2", "agent4"]);
    });

    it("detects three or more duplicates", () => {
      const agents = {
        agent1: { prompt_append: "triple" },
        agent2: { prompt_append: "triple" },
        agent3: { prompt_append: "triple" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates.sort(), ["agent2", "agent3"]);
    });

    it("ignores agents without prompt_append", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: { model: "gpt-4" },
        agent3: { prompt_append: "same" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent3"]);
    });

    it("ignores agents with non-string prompt_append", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: { prompt_append: 123 },
        agent3: { prompt_append: "same" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent3"]);
    });

    it("handles null prompt_append", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: { prompt_append: null },
        agent3: { prompt_append: "same" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent3"]);
    });

    it("handles undefined prompt_append", () => {
      const agents = {
        agent1: { prompt_append: "same" },
        agent2: {},
        agent3: { prompt_append: "same" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent3"]);
    });

    it("handles empty string prompt_append", () => {
      const agents = {
        agent1: { prompt_append: "" },
        agent2: { prompt_append: "" },
        agent3: { prompt_append: "unique" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, ["agent2"]);
    });

    it("is case-sensitive", () => {
      const agents = {
        agent1: { prompt_append: "Same" },
        agent2: { prompt_append: "same" },
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, []);
    });

    it("handles many agents efficiently", () => {
      const agents: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        agents[`agent${i}`] = { prompt_append: i < 100 ? "common" : `unique${i}` };
      }
      const start = performance.now();
      const duplicates = findPromptAppendDuplicates(agents);
      const duration = performance.now() - start;
      assert.ok(duration < 1000);
      assert.strictEqual(duplicates.length, 99);
    });

    it("handles malformed agent objects", () => {
      const agents = {
        bad1: "not an object",
        bad2: 123,
        bad3: null,
        bad4: undefined,
      };
      const duplicates = findPromptAppendDuplicates(agents);
      assert.deepStrictEqual(duplicates, []);
    });
  });
});
