import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('deploy compiled plugin', () => {
  it('builds and deploys compiled plugin into .opencode/plugins/agent-manager', () => {
    // Clean previous
    try { execSync('rm -rf dist .opencode/plugins/agent-manager/index.js'); } catch (e) {}

    // Run build and deploy script (deploy-plugin should be implemented)
    execSync('npm run build && npm run deploy-plugin', { stdio: 'inherit' });

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be deployed at .opencode/plugins/agent-manager/index.js');
  });
});
