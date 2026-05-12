import { describe, it } from 'bun:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

describe('deploy compiled plugin', () => {
  it('builds and deploys a clean runtime-loadable plugin tree', async () => {
    const cleanup = Bun.spawnSync(["rm", "-rf", "dist", ".opencode/plugins/agent-manager", ".opencode/plugins/agent-manager.js"]);
    assert.strictEqual(cleanup.exitCode, 0, new TextDecoder().decode(cleanup.stderr));

    const build = Bun.spawnSync(["bun", "run", "build"]);
    assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));
    const deploy = Bun.spawnSync(["bun", "run", "deploy-plugin"]);
    assert.strictEqual(deploy.exitCode, 0, new TextDecoder().decode(deploy.stderr));

    const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
    assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be deployed at .opencode/plugins/agent-manager/index.js');
    assert.ok(fs.existsSync(path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'plugin.js')), 'Expected runtime dependency plugin.js to be deployed');
    assert.ok(fs.existsSync(path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'config.js')), 'Expected runtime dependency config.js to be deployed');
    assert.ok(fs.existsSync(path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'schema.js')), 'Expected runtime dependency schema.js to be deployed');

    const wrapperPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager.js');
    assert.ok(fs.existsSync(wrapperPath), 'Expected top-level OpenCode wrapper to be deployed');

    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-manager-deploy-import-"));
    await fsp.writeFile(path.join(tmp, "opencode.json"), '{ "agents": {} }', "utf8");
    const mod = await import(`${pathToFileURL(wrapperPath).href}?t=${Date.now()}`);
    assert.strictEqual(typeof mod.server, "function", "Expected deployed wrapper to export server");
    const plugin = await mod.server({ directory: tmp });
    assert.ok(plugin.tool.agent_manager, "Expected deployed server to create agent_manager tool");
  });
});
