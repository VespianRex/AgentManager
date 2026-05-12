/// <reference types="bun-types" />
/// <reference types="node" />
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tuiPath = join(process.cwd(), '.opencode/tui/agent-manager.jsx');
const configPath = join(process.cwd(), 'src/config.ts');

// Read-only test: no file creation, no temp dirs needed
// This test only validates that TUI imports config helpers instead of duplicating them

// Red phase test: fail if TDD duplicates config logic
test('TUI does not duplicate config logic from src/config.ts', () => {
  const tuiContent = readFileSync(tuiPath, 'utf8');
  const configContent = readFileSync(configPath, 'utf8');

  // Check for duplicate method definitions
  expect(tuiContent).not.toContain('function findConfigFiles');
  expect(tuiContent).not.toContain('async function loadConfig');
  expect(tuiContent).not.toContain('async function saveConfig');

  // Check for imports from src/config.ts
  expect(tuiContent).toContain('import { findConfigFiles, loadConfig, saveConfig } from');
});