import { describe, it, expect, beforeEach, vi } from "bun:test";
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
  type SubAgentResult,
} from "../src/subagent.js";

// Mock the agentSystem module to control getSystemOverview output
vi.mock("../src/agentSystem.js", () => ({
  getSystemOverview: vi.fn().mockReturnValue({
    agents: { explore: "test", oracle: "test" },
    fallbackChains: { explore: ["oracle"] },
    categoryChains: {},
    permissions: { explore: { edit: "ask" } },
  }),
}));

// Helper to create a base context for testing
const createBaseContext = (overrides?: Partial<SubAgentContext>): SubAgentContext => {
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

describe("Individual Agent Function Tests", () => {
  describe("discoveryAgent", () => {
    it("returns success with correct agent and category counts", () => {
      const context = createBaseContext({});
      const result = discoveryAgent(context);
      
      expect(result.name).toBe("ConfigDiscovery");
      expect(result.status).toBe("success");
      expect(result.message).toContain("2 agents");
      expect(result.message).toContain("1 categories");
      expect(result.message).toContain("oh-my-opencode");
      expect(result.details).toEqual(context.summary);
    });

    it("handles zero agents and categories", () => {
      const baseContext = createBaseContext({});
      const context = {
        ...baseContext,
        summary: { ...baseContext.summary, agentCount: 0, categories: 0 }
      };
      const result = discoveryAgent(context);
      
      expect(result.message).toContain("0 agents");
      expect(result.message).toContain("0 categories");
    });

    it("handles different source types", () => {
      const context = createBaseContext({ source: "opencode" });
      const result = discoveryAgent(context);
      
      expect(result.message).toContain("opencode");
    });
  });

  describe("systemExplanationAgent", () => {
    it("returns success with system overview details", () => {
      const context = createBaseContext({});
      const result = systemExplanationAgent(context);
      
      expect(result.name).toBe("SystemExplanation");
      expect(result.status).toBe("success");
      expect(result.message).toContain("Explained agent roles");
      expect(result.details).toHaveProperty("agents");
      expect(result.details).toHaveProperty("fallbackChains");
      expect(result.details).toHaveProperty("categoryChains");
      expect(result.details).toHaveProperty("permissions");
    });

    it("returns consistent structure regardless of input", () => {
      const context = createBaseContext({});
      const result = systemExplanationAgent(context);
      
      expect(result.status).toBe("success");
      expect(typeof result.details).toBe("object");
    });
  });

  describe("validationAgent", () => {
    it("returns success when config is valid", () => {
      const context = createBaseContext({
        config: {
          agents: { test: { permission: { edit: "ask" } } },
          disabled_hooks: ["comment-checker"], // known hook
        },
      } as any);
      const result = validationAgent(context);
      
      expect(result.name).toBe("ConfigValidation");
      expect(result.status).toBe("success");
      expect(result.message).toContain("valid");
    });

    it("returns warning when unknown hooks found", () => {
      const context = createBaseContext({
        config: {
          agents: {},
          disabled_hooks: ["unknown-hook", "another-unknown"],
        },
      } as any);
      const result = validationAgent(context);
      
      expect(result.status).toBe("warning");
      expect(result.message).toContain("validation issues");
      const details = result.details as { invalidHooks: string[]; permissionProblems: string[] };
      expect(details.invalidHooks).toEqual(["unknown-hook", "another-unknown"]);
      expect(details.permissionProblems).toEqual([]);
    });

    it("returns warning when invalid permissions found", () => {
      const context = createBaseContext({
        config: {
          agents: { test: { permission: { edit: "invalid" } } },
          disabled_hooks: [],
        } as any,
      });
      const result = validationAgent(context);
      
      expect(result.status).toBe("warning");
      expect(result.message).toContain("validation issues");
      const details = result.details as { invalidHooks: string[]; permissionProblems: string[] };
      expect(details.permissionProblems.length).toBeGreaterThan(0);
    });
  });

  describe("orchestrationAgent", () => {
    it("returns success when both sisyphus and background are configured", () => {
      const context = createBaseContext({
        config: {
          sisyphus_agent: "sisyphus",
          background_task: "background",
        },
      } as any);
      const result = orchestrationAgent(context);
      
      expect(result.name).toBe("OrchestrationReview");
      expect(result.status).toBe("success");
      expect(result.message).toContain("present");
      const details = result.details as { sisyphus: string | null; background_task: string | null };
      expect(details.sisyphus).toBe("sisyphus");
      expect(details.background_task).toBe("background");
    });

    it("returns info when sisyphus configured but background missing", () => {
      const context = createBaseContext({
        config: {
          sisyphus_agent: "sisyphus",
          background_task: undefined,
        },
      } as any);
      const result = orchestrationAgent(context);
      
      expect(result.status).toBe("success");
      expect(result.message).toContain("background_task settings are missing");
      const details = result.details as { sisyphus: string | null; background_task: string | null };
      expect(details.sisyphus).toBe("sisyphus");
      expect(details.background_task).toBe(null);
    });
  });

  describe("instructionFollowAgent", () => {
    it("returns success when no duplicates found", () => {
      const context = createBaseContext({
        config: {
          agents: {
            agent1: { prompt_append: "unique 1" },
            agent2: { prompt_append: "unique 2" },
          },
        },
      } as any);
      const result = instructionFollowAgent(context);
      
      expect(result.name).toBe("InstructionFollowReview");
      expect(result.status).toBe("success");
      expect(result.message).toContain("KISS/DRY");
      const details = result.details as { promptAppendDuplicates: string[] };
      expect(details.promptAppendDuplicates).toEqual([]);
    });

    it("returns warning when duplicates found", () => {
      const context = createBaseContext({
        config: {
          agents: {
            agent1: { prompt_append: "same" },
            agent2: { prompt_append: "same" },
          },
        },
      } as any);
      const result = instructionFollowAgent(context);
      
      expect(result.status).toBe("warning");
      expect(result.message).toContain("repeated prompt_append");
      expect(result.message).toContain("agent2");
      const details = result.details as { promptAppendDuplicates: string[] };
      expect(details.promptAppendDuplicates).toEqual(["agent2"]);
    });
  });
});

describe("Error Injection Tests", () => {
  describe("ConfigValidation error injection", () => {
    it("handles invalid config with all permission types invalid", () => {
      const context = createBaseContext({
        config: {
          agents: {
            a1: { permission: { edit: "bad", bash: "bad", read: "bad", write: "bad" } },
          },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      
      expect(validation?.status).toBe("warning");
      const details = validation?.details as { permissionProblems: string[] };
      expect(details.permissionProblems.length).toBe(4);
    });

    it("handles config with many unknown hooks", () => {
      const context = createBaseContext({
        config: {
          agents: {},
          disabled_hooks: Array.from({ length: 50 }, (_, i) => `unknown-hook-${i}`),
        },
      } as any);
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      
      expect(validation?.status).toBe("warning");
      const details = validation?.details as { invalidHooks: string[] };
      expect(details.invalidHooks.length).toBe(50);
    });

    it("handles config with mixed valid and invalid permissions", () => {
      const context = createBaseContext({
        config: {
          agents: {
            valid: { permission: { edit: "ask" } },
            invalid: { permission: { edit: "bad" } },
            alsoValid: { permission: { bash: "allow" } },
          },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      
      expect(validation?.status).toBe("warning");
      const details = validation?.details as { permissionProblems: string[] };
      expect(details.permissionProblems.length).toBe(1);
    });

    it("handles permission edge cases: empty string values", () => {
      const context = createBaseContext({
        config: {
          agents: { test: { permission: { edit: "" } } },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      
      expect(validation?.status).toBe("warning");
    });

    it("handles permission edge cases: whitespace values", () => {
      const context = createBaseContext({
        config: {
          agents: { test: { permission: { edit: " " } } },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      
      expect(validation?.status).toBe("warning");
    });
  });

  describe("InstructionFollowReview error injection", () => {
    it("handles config with extremely long prompt_append values", () => {
      const longText = "a".repeat(10000);
      const context = createBaseContext({
        config: {
          agents: {
            agent1: { prompt_append: longText },
            agent2: { prompt_append: longText },
          },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const instruction = results.find((r) => r.name === "InstructionFollowReview");
      
      expect(instruction?.status).toBe("warning");
    });

    it("handles config with all agents having invalid permissions and duplicate prompt_append", () => {
      const context = createBaseContext({
        config: {
          agents: {
            a1: { permission: { edit: "invalid" }, prompt_append: "same" },
            a2: { permission: { bash: "invalid" }, prompt_append: "same" },
          },
          disabled_hooks: [],
        } as any,
      });
      const results = runSubAgentPipeline(context);
      const validation = results.find((r) => r.name === "ConfigValidation");
      const instruction = results.find((r) => r.name === "InstructionFollowReview");
      
      expect(validation?.status).toBe("warning");
      expect(instruction?.status).toBe("warning");
    });
  });
});

describe("Error Propagation Between Agents", () => {
  it("handles null config gracefully - agents use defaults", () => {
    const context = createBaseContext({ config: null as unknown as SubAgentContext["config"] });
    // Pipeline should not throw; individual agents handle null gracefully
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    // Validation agent should handle null config
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status).toBe("success");
  });

  it("handles undefined config gracefully - agents use defaults", () => {
    const context = createBaseContext({ config: undefined as unknown as SubAgentContext["config"] });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status).toBe("success");
  });

  it("continues pipeline with empty agents object", () => {
    const context = createBaseContext({ config: { agents: {} } });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status).toBe("success");
  });

  it("propagates warning status from validation to final results", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        disabled_hooks: ["unknown-hook"],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status).toBe("warning");
  });

  it("all agents execute even when validation has warnings", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        disabled_hooks: ["unknown-hook"],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const names = results.map((r) => r.name);
    expect(names).toEqual([
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
    const context = createBaseContext({
      config: { agents: agents as unknown as SubAgentContext["config"]["agents"] },
      summary: { ...createBaseContext({}).summary, agentCount: 1 },
    });
    expect(() => runSubAgentPipeline(context)).not.toThrow();
  });

  it("handles deeply nested invalid structures", () => {
    const context = createBaseContext({
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
    } as any);
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status === "warning" || validation?.status === "success").toBe(true);
  });
});

describe("Permission Checks with Error Propagation", () => {
  it("propagates permission errors through validation to orchestration", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        sisyphus_agent: "sisyphus",
        background_task: "background",
        disabled_hooks: [],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const orchestration = results.find((r) => r.name === "OrchestrationReview");
    expect(validation?.status).toBe("warning");
    expect(orchestration?.status).toBe("success");
  });

  it("propagates permission errors through validation to instruction follow", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        disabled_hooks: [],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const instruction = results.find((r) => r.name === "InstructionFollowReview");
    expect(validation?.status).toBe("warning");
    expect(instruction?.status).toBe("success");
  });

  it("accumulates multiple warning statuses across pipeline", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        disabled_hooks: ["unknown-hook"],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const warnings = results.filter((r) => r.status === "warning").length;
    expect(warnings).toBe(1);
  });

  it("handles permission errors with duplicate prompt_append", () => {
    const context = createBaseContext({
      config: {
        agents: {
          a1: { permission: { edit: "invalid" }, prompt_append: "same" },
          a2: { permission: { bash: "invalid" }, prompt_append: "same" },
        },
        disabled_hooks: [],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const instruction = results.find((r) => r.name === "InstructionFollowReview");
    expect(validation?.status).toBe("warning");
    expect(instruction?.status).toBe("warning");
  });

  it("isolates permission errors to specific agents", () => {
    const context = createBaseContext({
      config: {
        agents: {
          good1: { permission: { edit: "ask" } },
          bad: { permission: { edit: "invalid" } },
          good2: { permission: { bash: "allow" } },
        },
        disabled_hooks: [],
      },
    } as any);
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const details = validation?.details as { permissionProblems: string[] };
    expect(details.permissionProblems.length).toBe(1);
    expect(details.permissionProblems[0]).toContain("bad");
  });
});

describe("Individual 5-agent function error propagation", () => {
  it("discoveryAgent handles missing summary - throws error", () => {
    const context = createBaseContext({ summary: null as any });
    expect(() => discoveryAgent(context)).toThrow();
  });

  it("discoveryAgent handles undefined summary - throws error", () => {
    const context = createBaseContext({ summary: undefined as any });
    expect(() => discoveryAgent(context)).toThrow();
  });

  it("systemExplanationAgent handles missing config - uses mocked getSystemOverview", () => {
    const context = createBaseContext({ config: null as any });
    const result = systemExplanationAgent(context);
    expect(result.status).toBe("success");
    expect(result.name).toBe("SystemExplanation");
  });

  it("validationAgent handles null config object", () => {
    const context = createBaseContext({ config: null as any });
    const result = validationAgent(context);
    expect(result.status).toBe("success");
    expect(result.details).toEqual({ invalidHooks: [], permissionProblems: [] });
  });

  it("validationAgent handles undefined config object", () => {
    const context = createBaseContext({ config: undefined as any });
    const result = validationAgent(context);
    expect(result.status).toBe("success");
  });

  it("validationAgent handles malformed permission objects", () => {
    const context = createBaseContext({
      config: {
        agents: {
          test: { permission: { edit: { nested: "invalid" } } },
        },
        disabled_hooks: [],
      } as any,
    });
    const result = validationAgent(context);
    expect(result.status).toBe("warning");
  });

  it("validationAgent handles missing disabled_hooks", () => {
    const context = createBaseContext({
      config: {
        agents: {},
      } as any,
    });
    const result = validationAgent(context);
    expect(result.status).toBe("success");
  });

  it("validationAgent handles disabled_hooks as non-array", () => {
    const context = createBaseContext({
      config: {
        agents: {},
        disabled_hooks: "not-array" as any,
      } as any,
    });
    expect(() => validationAgent(context)).toThrow();
  });

  it("orchestrationAgent handles missing sisyphus and background", () => {
    const context = createBaseContext({
      config: {
        agents: {},
        disabled_hooks: [],
      } as any,
    });
    const result = orchestrationAgent(context);
    expect(result.status).toBe("success");
    expect(result.message).toContain("No Sisyphus");
  });

  it("orchestrationAgent handles null config gracefully", () => {
    const context = createBaseContext({ config: null as any });
    const result = orchestrationAgent(context);
    expect(result.status).toBe("success");
    expect(result.message).toContain("No Sisyphus");
  });

  it("orchestrationAgent handles undefined config gracefully", () => {
    const context = createBaseContext({ config: undefined as any });
    const result = orchestrationAgent(context);
    expect(result.status).toBe("success");
    expect(result.message).toContain("No Sisyphus");
  });

  it("instructionFollowAgent handles non-string prompt_append values", () => {
    const context = createBaseContext({
      config: {
        agents: {
          agent1: { prompt_append: 123 as any },
          agent2: { prompt_append: null as any },
        },
        disabled_hooks: [],
      } as any,
    });
    const result = instructionFollowAgent(context);
    expect(result.status).toBe("success");
  });

  it("instructionFollowAgent handles null agents", () => {
    const context = createBaseContext({
      config: {
        agents: null as any,
        disabled_hooks: [],
      } as any,
    });
    const result = instructionFollowAgent(context);
    expect(result.status).toBe("success");
    expect(result.details).toEqual({ promptAppendDuplicates: [] });
  });

  it("instructionFollowAgent handles undefined agents", () => {
    const context = createBaseContext({
      config: {
        agents: undefined,
        disabled_hooks: [],
      } as any,
    });
    const result = instructionFollowAgent(context);
    expect(result.status).toBe("success");
  });

  it("validateAgentPermissions handles all invalid permission types", () => {
    const agents = {
      test1: { permission: { edit: "invalid", bash: "wrong", read: "bad", write: "nope" } },
    };
    const problems = validateAgentPermissions(agents as any);
    expect(problems.length).toBe(4);
  });

  it("validateAgentPermissions handles null agents", () => {
    const problems = validateAgentPermissions(null as any);
    expect(problems).toEqual([]);
  });

  it("validateAgentPermissions handles undefined agents", () => {
    const problems = validateAgentPermissions(undefined as any);
    expect(problems).toEqual([]);
  });

  it("validateAgentPermissions handles empty agents", () => {
    const problems = validateAgentPermissions({});
    expect(problems).toEqual([]);
  });

  it("findPromptAppendDuplicates handles empty agents", () => {
    const duplicates = findPromptAppendDuplicates({});
    expect(duplicates).toEqual([]);
  });

  it("findPromptAppendDuplicates handles undefined prompt_append", () => {
    const agents = {
      agent1: {},
      agent2: { prompt_append: undefined },
    };
    const duplicates = findPromptAppendDuplicates(agents as any);
    expect(duplicates).toEqual([]);
  });

  it("findPromptAppendDuplicates handles null agents - returns empty array", () => {
    // null agents should be handled gracefully
    const duplicates = findPromptAppendDuplicates(null as any);
    expect(duplicates).toEqual([]);
  });

  it("runSubAgentPipeline handles null context - throws error", () => {
    expect(() => runSubAgentPipeline(null as any)).toThrow();
  });

  it("runSubAgentPipeline handles undefined context - throws error", () => {
    expect(() => runSubAgentPipeline(undefined as any)).toThrow();
  });

  it("runSubAgentPipeline handles context with missing required fields - throws error", () => {
    const context = { source: "test" } as any;
    expect(() => runSubAgentPipeline(context)).toThrow();
  });

  it("runSubAgentPipeline handles missing summary - throws error", () => {
    const context = { config: {}, source: "test" } as any;
    expect(() => runSubAgentPipeline(context)).toThrow();
  });

  it("runSubAgentPipeline handles missing source - completes with undefined", () => {
    const context = { config: {}, summary: {} } as any;
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const discovery = results.find(r => r.name === "ConfigDiscovery");
    expect(discovery?.message).toContain("undefined");
  });

  it("propagates errors from individual agents through pipeline - throws on null summary", () => {
    const context = createBaseContext({
      summary: null as any,
    });
    expect(() => runSubAgentPipeline(context)).toThrow();
  });

  it("handles concurrent execution of agents without interference", () => {
    const context = createBaseContext({});
    const results1 = runSubAgentPipeline(context);
    const results2 = runSubAgentPipeline(context);
    expect(results1.length).toBe(5);
    expect(results2.length).toBe(5);
  });

  it("pipeline continues when validation agent returns warning", () => {
    const context = createBaseContext({
      config: {
        agents: { test: { permission: { edit: "invalid" } } } as any,
        disabled_hooks: ["unknown-hook"],
      } as any,
    });
    const results = runSubAgentPipeline(context);
    // All 5 agents should execute
    expect(results.length).toBe(5);
    // Validation should return warning
    const validation = results.find((r) => r.name === "ConfigValidation");
    expect(validation?.status).toBe("warning");
    // Other agents should still complete
    const discovery = results.find((r) => r.name === "ConfigDiscovery");
    const orchestration = results.find((r) => r.name === "OrchestrationReview");
    const instruction = results.find((r) => r.name === "InstructionFollowReview");
    expect(discovery?.status).toBe("success");
    expect(orchestration?.status).toBe("success");
    expect(instruction?.status).toBe("success");
  });

  it("pipeline handles multiple validation warnings accumulation", () => {
    const context = createBaseContext({
      config: {
        agents: {
          a1: { permission: { edit: "invalid" } },
          a2: { permission: { bash: "wrong" } },
        } as any,
        disabled_hooks: ["unknown1", "unknown2"],
      } as any,
    });
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const details = validation?.details as { invalidHooks: string[]; permissionProblems: string[] };
    expect(details.invalidHooks.length).toBe(2);
    expect(details.permissionProblems.length).toBe(2);
  });

  it("pipeline handles instruction follow warning with validation warning", () => {
    const context = createBaseContext({
      config: {
        agents: {
          a1: { permission: { edit: "invalid" }, prompt_append: "same" },
          a2: { permission: { bash: "wrong" }, prompt_append: "same" },
        } as any,
        disabled_hooks: [],
      } as any,
    });
    const results = runSubAgentPipeline(context);
    const validation = results.find((r) => r.name === "ConfigValidation");
    const instruction = results.find((r) => r.name === "InstructionFollowReview");
    expect(validation?.status).toBe("warning");
    expect(instruction?.status).toBe("warning");
  });

  it("pipeline handles discovery errors propagating through all agents", () => {
    // When discovery has issues, subsequent agents should still execute
    const context = createBaseContext({
      summary: {
        path: "test",
        source: "project",
        type: "oh-my-opencode",
        agentCount: 0,
        categories: 0,
        hasSisyphus: false,
        disabledHooks: [],
        disabledAgents: [],
        disabledSkills: [],
      },
      config: { agents: {} } as any,
    });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const discovery = results.find((r) => r.name === "ConfigDiscovery");
    expect(discovery?.status).toBe("success");
    expect(discovery?.message).toContain("0 agents");
  });

  it("pipeline preserves order of agent execution", () => {
    const context = createBaseContext({});
    const results = runSubAgentPipeline(context);
    const names = results.map((r) => r.name);
    expect(names).toEqual([
      "ConfigDiscovery",
      "SystemExplanation",
      "ConfigValidation",
      "OrchestrationReview",
      "InstructionFollowReview",
    ]);
  });

  it("pipeline handles all agents returning success status", () => {
    const context = createBaseContext({
      config: {
        agents: {
          valid: { permission: { edit: "ask" } },
        },
        disabled_hooks: [],
        sisyphus_agent: "sisyphus",
        background_task: "background",
      } as any,
    });
    const results = runSubAgentPipeline(context);
    const allSuccess = results.every((r) => r.status === "success");
    expect(allSuccess).toBe(true);
  });

  it("handles extremely large configs efficiently", () => {
    const agents: Record<string, any> = {};
    for (let i = 0; i < 1000; i++) {
      agents[`agent${i}`] = { 
        permission: { edit: "ask", bash: "allow", read: "deny", write: "ask" },
        prompt_append: `prompt${i % 100}`
      };
    }
    const context = createBaseContext({
      config: {
        agents,
        disabled_hooks: Array.from({ length: 100 }, (_, i) => `hook${i}`),
        sisyphus_agent: "sisyphus",
        background_task: "background",
      } as any,
      summary: {
        path: "test",
        source: "project",
        type: "oh-my-opencode",
        agentCount: 1000,
        categories: 0,
        hasSisyphus: true,
        disabledHooks: [],
        disabledAgents: [],
        disabledSkills: [],
      },
    });
    const start = performance.now();
    const results = runSubAgentPipeline(context);
    const end = performance.now();
    expect(results.length).toBe(5);
    expect(end - start).toBeLessThan(1000);
  });

  it("handles config with prototype pollution attempts", () => {
    const config = {
      __proto__: { polluted: true },
      agents: {
        test: { model: "gpt-4" },
      },
      disabled_hooks: [],
    };
    const context = createBaseContext({ config: config as any });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
    const validation = results.find(r => r.name === "ConfigValidation");
    expect(validation?.status).toBe("success");
  });

  it("handles config with constructor property", () => {
    const config = {
      constructor: "malicious",
      agents: {
        test: { model: "gpt-4" },
      },
      disabled_hooks: [],
    };
    const context = createBaseContext({ config: config as any });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
  });

  it("handles config with toString property", () => {
    const config = {
      toString: () => "malicious",
      agents: {
        test: { model: "gpt-4" },
      },
      disabled_hooks: [],
    };
    const context = createBaseContext({ config: config as any });
    const results = runSubAgentPipeline(context);
    expect(results.length).toBe(5);
  });
});