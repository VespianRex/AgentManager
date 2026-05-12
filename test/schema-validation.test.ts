import { describe, test, expect } from 'bun:test';
import {
  validateAgentConfig,
  validateAgentManagerDocument,
} from '../src/schema';
import { validateBenchmarkConfigItem } from '../src/utils';


describe('AgentConfig validation', () => {
  test('accepts empty object (all fields optional)', () => {
    const result = validateAgentConfig({});
    expect(result).toBeDefined();
    expect(result).toEqual({});
  });

  test('accepts valid agent config with model', () => {
    const valid = { model: 'claude-3' };
    const result = validateAgentConfig(valid);
    expect(result).toBeDefined();
    expect(result.model).toBe('claude-3');
  });

  test('rejects non-array fallback (string expected)', () => {
    const invalid = { model: 'claude-3', fallback: ['claude-2'] };
    expect(() => validateAgentConfig(invalid)).toThrow();
  });

  test('accepts fallback as string', () => {
    const valid = { model: 'claude-3', fallback: 'claude-2' };
    const result = validateAgentConfig(valid);
    expect(result.fallback).toBe('claude-2');
  });
});

describe('AgentManagerDocument validation', () => {
  test('accepts valid document', () => {
    const valid = { agents: { test: { model: 'gpt-4' } } };
    const result = validateAgentManagerDocument(valid);
    expect(result.agents?.test?.model).toBe('gpt-4');
  });

  test('accepts document with empty agent (all fields optional)', () => {
    const result = validateAgentManagerDocument({ agents: { test: {} } });
    expect(result.agents?.test).toBeDefined();
  });
});

describe('BenchmarkConfig validation', () => {
  test('rejects missing model field', () => {
    const invalid = { prompt: 'Hello' };
    const result = validateBenchmarkConfigItem(invalid, 0);
    expect(result).toMatch(/model/i);
  });

  test('rejects non-string prompt', () => {
    const invalid = { model: 'claude-3', prompt: 123 };
    const result = validateBenchmarkConfigItem(invalid, 0);
    expect(result).toMatch(/prompt.*string/i);
  });

  test('accepts empty prompt (type check only)', () => {
    const valid = { model: 'claude-3', prompt: '' };
    // validateBenchmarkConfigItem only checks type, not emptiness
    const result = validateBenchmarkConfigItem(valid, 0);
    expect(result).toBeNull();
  });

  test('accepts valid benchmark config', () => {
    const valid = { model: 'claude-3', prompt: 'Hello, how are you?' };
    const result = validateBenchmarkConfigItem(valid, 0);
    expect(result).toBeNull();
  });
});