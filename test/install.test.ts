/**
 * Integration test: builds and installs plugin
 *
 * ⚠️ REQUIREMENTS:
 * - Deletes and rebuilds dist/ directory
 * - Modifies .opencode/plugins/agent-manager/
 * - Should be run separately from unit tests
 *
 * OPT-IN: Set environment variable RUN_INTEGRATION_TESTS=true to enable
 */
import { describe, it, beforeAll } from 'bun:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

describe('install compiled plugin', () => {
  if (!RUN_INTEGRATION) {
    return; // Skip by default - opt-in via RUN_INTEGRATION_TESTS=true
  }

  beforeAll(() => {
    // Ensure clean environment before running
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist", ".opencode/plugins/agent-manager"]);
    assert.strictEqual(cleanup.exitCode, 0, 'Failed to cleanup before install test');
  });

  it('builds and installs compiled plugin into .opencode/plugins/agent-manager', () => {
    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));
    const install = Bun.spawnSync(["bun", "run", "install-plugin"]);
    assert.strictEqual(install.exitCode, 0, new TextDecoder().decode(install.stderr));

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager.js');
    assert.ok(fs.lstatSync(installedPath).isFile() || fs.lstatSync(installedPath).isSymbolicLink(), 'Expected compiled plugin entry to be a file or symlink');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be installed at .opencode/plugins/agent-manager.js');
  });
});
