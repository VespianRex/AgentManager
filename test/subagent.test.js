import { describe, it } from "node:test";
import assert from "node:assert";
import { runSubAgentPipeline } from "../src/subagent.js";
const sampleContext = {
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
            explore: { model: "opencode/gpt-5-nano", permission: { edit: "ask" }, prompt_append: "Use quick mode." },
            oracle: { model: "openai/gpt-5.2", permission: { bash: "allow" } },
        },
        disabled_hooks: ["comment-checker"],
        sisyphus_agent: { disabled: false },
        background_task: { defaultConcurrency: 3 },
    },
};
describe("subagent pipeline", () => {
    it("returns a series of subagent audit results", () => {
        const results = runSubAgentPipeline(sampleContext);
        assert.strictEqual(results.length, 5);
        const names = results.map((item) => item.name);
        assert.deepStrictEqual(names, [
            "ConfigDiscovery",
            "SystemExplanation",
            "ConfigValidation",
            "OrchestrationReview",
            "InstructionFollowReview",
        ]);
        assert.ok(results.some((item) => item.status === "success"));
    });
});
