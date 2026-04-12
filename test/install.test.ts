import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('install compiled plugin', () => {
  it('builds and installs compiled plugin into .opencode/plugins/agent-manager-built', () => {
    // Ensure clean state
    try { execSync('rm -rf dist .opencode/plugins/agent-manager-built'); } catch (e) {}

    // Run build and installation script (install-plugin should be implemented)
    execSync('bun run build && bun run install-plugin', { stdio: 'inherit' });

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager-built', 'index.js');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be installed at .opencode/plugins/agent-manager-built/index.js');
  });
});
