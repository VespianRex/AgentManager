/// <reference types="bun-types" />
import { describe, it, expect } from 'bun:test';
import { AgentMetadata, getOhMyOpenCodeAgents, getTaskMasterAgents, getAllFallbackChains, AGENT_REGISTRY } from '../src/agent-metadata.js';
import { MODEL_METADATA_REGISTRY } from '../src/model-metadata.js';

describe('agent-metadata', () => {
  describe('getOhMyOpenCodeAgents', () => {
    it('returns only core Oh My OpenCode agents', () => {
      const agents = getOhMyOpenCodeAgents();
      expect(Object.keys(agents)).toEqual(expect.arrayContaining([
        'Sisyphus', 'oracle', 'librarian', 'explore', 'multimodal-looker',
        'Prometheus', 'Metis', 'Momus'
      ]));
      expect(Object.keys(agents)).not.toContain('visual-engineering');
    });

    it('includes all required model metadata fields', () => {
      const agents = getOhMyOpenCodeAgents();
      Object.values(agents).forEach(agent => {
        expect(agent).toHaveProperty('context_window_size');
        expect(agent).toHaveProperty('recommended_top_k');
        expect(agent).toHaveProperty('recommended_top_p');
        expect(agent).toHaveProperty('prompting_style_guidelines');
        expect(agent).toHaveProperty('unique_model_intricacies');
      });
    });
  });

  describe('getTaskMasterAgents', () => {
    it('returns only category-based Task Master agents', () => {
      const agents = getTaskMasterAgents();
      expect(Object.keys(agents)).toEqual(expect.arrayContaining([
        'visual-engineering', 'deep', 'quick', 'ultrabrain', 'artistry',
        'unspecified-low', 'unspecified-high'
      ]));
      expect(Object.keys(agents)).not.toContain('Sisyphus');
    });
  });

  describe('getAllFallbackChains', () => {
    it('returns fallback chains for all agents', () => {
      const chains = getAllFallbackChains();
      expect(Object.keys(chains)).toEqual(Object.keys(AGENT_REGISTRY));
      Object.values(chains).forEach(chain => {
        expect(Array.isArray(chain)).toBe(true);
        expect(chain.length).toBeGreaterThan(0);
      });
    });
  });

  describe('model metadata resolution', () => {
    it('uses first valid provider in fallback chain', () => {
      const sisyphus = getOhMyOpenCodeAgents().Sisyphus;
      expect(sisyphus.context_window_size).toBe(MODEL_METADATA_REGISTRY['claude-3.5-sonnet'].context_window_size);
    });

    it('uses first valid provider in fallback chain (anthropic → claude-3.5-sonnet)', () => {
      const quick = getTaskMasterAgents().quick;
      expect(quick.context_window_size).toBe(MODEL_METADATA_REGISTRY['claude-3.5-sonnet'].context_window_size);
    });
  });
});