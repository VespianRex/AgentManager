import { describe, it } from 'bun:test';
import assert from 'bun:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('install compiled plugin', () => {
  it('builds and installs compiled plugin into .opencode/plugins/agent-manager', () => {
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist", ".opencode/plugins/agent-manager"]);
    assert.strictEqual(cleanup.exitCode, 0, new TextDecoder().decode(cleanup.stderr));

    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));
    const install = Bun.spawnSync(["bun", "run", "install-plugin"]);
    assert.strictEqual(install.exitCode, 0, new TextDecoder().decode(install.stderr));

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be installed at .opencode/plugins/agent-manager/index.js');
  });
});
