import type { LoadedConfig, MergedAgent, AgentConfig } from "../../src/tui-helpers.js";

export function makeLoadedConfig(overrides: Partial<LoadedConfig> = {}): LoadedConfig {
  return {
    config: { path: "/test/opencode.json", source: "project" },
    agents: {},
    document: {},
    ...overrides,
  };
}

export function makeAgentConfig(opts: { model?: string; fallback?: string[] } = {}): AgentConfig {
  return {
    ...(opts.model && { model: opts.model }),
    ...(opts.fallback && { fallback_models: opts.fallback }),
  };
}

export function makeMergedAgent(overrides: Partial<MergedAgent> = {}): MergedAgent {
  return {
    key: "test-agent",
    model: null,
    fallback: [],
    role: "test",
    isDefault: true,
    ...overrides,
  };
}
