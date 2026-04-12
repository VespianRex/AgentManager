import { describe, it } from "node:test";
import assert from "node:assert";
import { getSystemOverview, getOrchestrationDiagram, getFallbackDiagram } from "../src/agentSystem.js";

describe("agent system metadata", () => {
  it("provides a system overview with agents and fallback chains", () => {
    const overview = getSystemOverview();
    assert.ok(overview.agents.Sisyphus);
    assert.ok(Array.isArray(overview.fallbackChains.Sisyphus));
    assert.ok(overview.permissions.includes("edit"));
  });

  it("returns readable diagrams", () => {
    const orchestration = getOrchestrationDiagram();
    assert.ok(orchestration.includes("Prometheus"));
    const fallback = getFallbackDiagram();
    assert.ok(fallback.includes("Model resolution flow"));
  });
});
