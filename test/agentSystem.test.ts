import { describe, it, expect } from "bun:test";
import { getSystemOverview, getOrchestrationDiagram, getFallbackDiagram } from "../src/agentSystem.js";

describe("agent system metadata", () => {
  it("provides a system overview with agents and fallback chains", () => {
    const overview = getSystemOverview();
    expect(overview.agents.Sisyphus).toBeTruthy();
    expect(Array.isArray(overview.fallbackChains.Sisyphus)).toBeTruthy();
    expect(overview.permissions.includes("edit")).toBeTruthy();
  });

  it("returns readable diagrams", () => {
    const orchestration = getOrchestrationDiagram();
    expect(orchestration).toInclude("Prometheus");
    const fallback = getFallbackDiagram();
    expect(fallback).toInclude("Model resolution flow");
  });
});
