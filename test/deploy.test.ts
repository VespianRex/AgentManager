import { describe, it } from 'bun:test';
import assert from 'bun:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('deploy compiled plugin', () => {
  it('builds and deploys compiled plugin into .opencode/plugins/agent-manager', () => {
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist", ".opencode/plugins/agent-manager/index.js"]);
    assert.strictEqual(cleanup.exitCode, 0, new TextDecoder().decode(cleanup.stderr));

    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));
    const deploy = Bun.spawnSync(["bun", "run", "deploy-plugin"]);
    assert.strictEqual(deploy.exitCode, 0, new TextDecoder().decode(deploy.stderr));

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be deployed at .opencode/plugins/agent-manager/index.js');
  });
});
