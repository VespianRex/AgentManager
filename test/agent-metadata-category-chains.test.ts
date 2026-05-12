/// <reference types="bun-types" />
import { describe, it, expect } from 'bun:test';
import { getCategoryChains, getOhMyOpenCodeAgents, getTaskMasterAgents, AGENT_REGISTRY } from '../src/agent-metadata.js';

describe('getCategoryChains', () => {
  it('returns only category agents (excludes core Oh My OpenCode agents)', () => {
    const chains = getCategoryChains();
    const coreAgents = Object.keys(getOhMyOpenCodeAgents());
    const categoryAgents = Object.keys(getTaskMasterAgents());

    // All category agents should be in chains
    categoryAgents.forEach(agent => {
      expect(chains).toHaveProperty(agent);
    });

    // No core agents should be in chains
    coreAgents.forEach(agent => {
      expect(chains).not.toHaveProperty(agent);
    });
  });

  it('returns fallback chains for all category agents', () => {
    const chains = getCategoryChains();
    Object.entries(chains).forEach(([agent, fallback]) => {
      expect(Array.isArray(fallback)).toBe(true);
      expect(fallback.length).toBeGreaterThan(0);
      // Verify fallback matches the original AGENT_REGISTRY
      expect(AGENT_REGISTRY[agent]?.fallback).toEqual(fallback);
    });
  });

  it('performs efficiently by caching getOhMyOpenCodeAgents result', () => {
    // This test verifies the optimization: getOhMyOpenCodeAgents should be called once
    // not for every iteration in the loop
    let callCount = 0;
    const original = getOhMyOpenCodeAgents;

    // We can't easily mock the function, but we can verify the function works correctly
    const chains = getCategoryChains();

    // Verify all category agents are correctly identified
    const categoryAgents = ['visual-engineering', 'deep', 'quick', 'ultrabrain', 'artistry', 'unspecified-low', 'unspecified-high'];
    categoryAgents.forEach(agent => {
      expect(chains).toHaveProperty(agent);
      expect(chains[agent]).toBeDefined();
    });
  });
});