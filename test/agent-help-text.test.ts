/// <reference types="bun-types" />
import { describe, it, expect } from "bun:test";
import { AGENT_REGISTRY } from "../src/agent-metadata.js";
import type { AgentMetadata } from "../src/agent-metadata.js";
import { mergeWithDefaults } from "../src/tui-helpers.js";
import type { MergedAgent } from "../src/tui-helpers.js";

describe("agent helpText data completeness", () => {
  const entries = Object.entries(AGENT_REGISTRY) as [string, AgentMetadata][];

  it("every agent has a helpText field", () => {
    for (const [key, agent] of entries) {
      expect(agent.helpText).toBeDefined(`Agent "${key}" is missing helpText`);
      expect(typeof agent.helpText).toBe("string");
      expect(agent.helpText.length).toBeGreaterThan(50);
    }
  });

  it("every agent has a tips array", () => {
    for (const [key, agent] of entries) {
      expect(agent.tips).toBeDefined(`Agent "${key}" is missing tips`);
      expect(Array.isArray(agent.tips)).toBe(true);
      expect(agent.tips.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every tip is a non-empty string", () => {
    for (const [key, agent] of entries) {
      for (let i = 0; i < agent.tips.length; i++) {
        const tip = agent.tips[i];
        expect(typeof tip).toBe("string");
        expect(tip.length).toBeGreaterThan(10, `Agent "${key}" tip[${i}] is too short`);
      }
    }
  });

  it("helpText references the agent's role or key for core agents", () => {
    const coreAgents = ["Sisyphus", "hephaestus", "atlas", "oracle", "librarian", "explore", "Prometheus", "Metis", "Momus"];
    for (const key of coreAgents) {
      const agent = AGENT_REGISTRY[key];
      const helpText = agent.helpText;
      const lowerKey = key.toLowerCase();
      const lowerRole = agent.role.toLowerCase();
      const lowerText = helpText.toLowerCase();
      const nameMentioned = lowerText.includes(lowerKey) || lowerText.includes(lowerRole);
      expect(nameMentioned).toBe(true, `Agent "${key}" helpText should mention its name or role`);
    }
  });

  it("all helpText entries are unique (no copy-paste)", () => {
    const texts = entries.map(([_, a]) => a.helpText);
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it("all tips arrays are unique per agent", () => {
    for (const [key, agent] of entries) {
      const uniqueTips = new Set(agent.tips);
      expect(uniqueTips.size).toBe(agent.tips.length, `Agent "${key}" has duplicate tips`);
    }
  });
});

describe("helpText/tips propagation through mergeWithDefaults", () => {
  it("propagates helpText and tips from AGENT_REGISTRY to MergedAgent", () => {
    const merged = mergeWithDefaults([]);
    const sisyphus = merged["sisyphus"] as MergedAgent;
    expect(sisyphus).toBeDefined();
    expect(sisyphus.helpText).toBeDefined();
    expect(typeof sisyphus.helpText).toBe("string");
    expect(sisyphus.helpText!.length).toBeGreaterThan(50);
    expect(Array.isArray(sisyphus.tips)).toBe(true);
    expect(sisyphus.tips!.length).toBeGreaterThanOrEqual(2);
  });

  it("propagates helpText for every known agent", () => {
    const merged = mergeWithDefaults([]);
    const knownKeys = Object.keys(AGENT_REGISTRY).map(k => k.toLowerCase());
    for (const key of knownKeys) {
      const agent = merged[key];
      expect(agent).toBeDefined(`MergedAgent missing for key "${key}"`);
      expect(agent!.helpText).toBeDefined(`MergedAgent "${key}" missing helpText`);
      expect(agent!.helpText!.length).toBeGreaterThan(50, `MergedAgent "${key}" helpText too short`);
      expect(agent!.tips).toBeDefined(`MergedAgent "${key}" missing tips`);
      expect(agent!.tips!.length).toBeGreaterThanOrEqual(2, `MergedAgent "${key}" needs >=2 tips`);
    }
  });

  it("custom agents without registry entry get generated helpText/tips", () => {
    const merged = mergeWithDefaults([{
      config: { path: "/test/config.json", source: "test" },
      agents: { "my-custom-agent": { model: "gpt-4o" } },
      document: {},
    }]);
    const custom = merged["my-custom-agent"];
    expect(custom).toBeDefined();
    expect(custom!.helpText).toBeDefined();
    expect(typeof custom!.helpText).toBe("string");
    expect(custom!.helpText!.length).toBeGreaterThan(10);
    expect(custom!.tips).toBeDefined();
    expect(Array.isArray(custom!.tips)).toBe(true);
    expect(custom!.tips!.length).toBeGreaterThanOrEqual(1);
  });

  it("category agents without registry entry get category-specific helpText", () => {
    const merged = mergeWithDefaults([{
      config: { path: "/test/config.json", source: "test" },
      agents: { "my-category": { model: "gpt-4o" } },
      document: {},
      isCategories: true,
    }]);
    const cat = merged["my-category"];
    expect(cat).toBeDefined();
    expect(cat!.helpText).toBeDefined();
    expect(cat!.helpText).toContain("Category agent");
    expect(cat!.tips).toBeDefined();
    expect(Array.isArray(cat!.tips)).toBe(true);
  });
});
