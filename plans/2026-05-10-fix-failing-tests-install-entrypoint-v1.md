# Fix Failing Tests: install.test.ts and entrypoint.test.ts

## Objective

Fix two environment-specific tests that fail in CI because they expect files to exist in `~/.config/opencode/` which aren't present in all test environments. Make tests robust by checking environment conditions or skipping gracefully.

## Problem Analysis

### install.test.ts (lines 29-37)

```typescript
it('builds and installs compiled plugin into .opencode/plugins/agent-manager', () => {
  const build = Bun.spawnSync(["bun", "run", "build"]);
  assert.strictEqual(build.exitCode, 0, new TextDecoder().decode(build.stderr));
  const install = Bun.spawnSync(["bun", "run", "install-plugin"]);
  assert.strictEqual(install.exitCode, 0, new TextDecoder().decode(install.stderr));

  const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
  assert.ok(fs.existsSync(installedPath), 'Expected compiled plugin entry to be installed at .opencode/plugins/agent-manager/index.js');
});
```

**Issue**: Test runs only when `RUN_INTEGRATION_TESTS=true` (opt-in). However, it checks for `index.js` but `deploy-plugin` copies all dist files; the entry might be `agent-manager.js` or `index.js` depending on plugin structure.

**Current Plugin Structure**:
- `dist/index.js` → deployed to `.opencode/plugins/agent-manager/index.js`
- Also should have `package.json`? Check deploy script.

`package.json:9`: `rsync -a dist/ .opencode/plugins/agent-manager/` copies all dist contents.

So `index.js` should exist. But integration tests may fail if `.opencode/plugins/agent-manager/` isn't writable or the filesystem is readonly.

### entrypoint.test.ts (lines 7-32)

```typescript
it("expose the server plugin and global command config", async () => {
  const repoRoot = process.cwd();
  const serverWrapperPath = path.join(repoRoot, ".opencode", "plugins", "agent-manager.js");
  const homeConfigPath = path.join(process.env.HOME ?? "", ".config", "opencode", "opencode.json");
  const commandFilePath = path.join(process.env.HOME ?? "", ".config", "opencode", "command", "agent-manager.md");

  // Check if server wrapper exists (may not in all environments)
  if (await fs.access(serverWrapperPath).catch(() => false)) {
    const serverWrapper = await fs.readFile(serverWrapperPath, "utf8");
    assert.ok(serverWrapper.includes('export { server } from "./agent-manager/index.js";'));
  }

  // Check if home config exists (may not in all environments)
  if (await fs.access(homeConfigPath).catch(() => false)) {
    const homeConfig = await fs.readFile(homeConfigPath, "utf8");
    assert.ok(homeConfig.includes('"agent-manager"'));
    assert.ok(homeConfig.includes('Run the `agent_manager` tool with `action=inspect`'));
  }

  // Check if command file exists (may not in all environments)
  if (await fs.access(commandFilePath).catch(() => false)) {
    const commandFile = await fs.readFile(commandFilePath, "utf8");
    assert.ok(commandFile.includes("description: Agent Manager"));
    assert.ok(commandFile.includes("# /agent-manager"));
  }
});
```

**Issue**: The test wraps each check in `if (await fs.access(...).catch(() => false))` so should skip missing files. BUT: it may fail if `process.env.HOME` is unset on some CI systems. Also, assertions inside the `if` might fail if files exist but don't contain expected strings.

**Failure Mode**: When `RUN_INTEGRATION_TESTS=true` is set, the tests expect these files to be present, but they may not be if plugin isn't installed globally.

## Implementation Plan

- [ ] **Step 1**: Investigate actual deployment structure
  - Check what files `deploy-plugin` actually copies
  - Verify if `.opencode/plugins/agent-manager.js` exists or if it's a directory
  - Document expected deployment layout

- [ ] **Step 2**: Fix `install.test.ts`
  - Change assertion to check for either `index.js` OR `agent-manager.js` (handle both)
  - Alternatively, check the actual entry based on plugin structure
  - Add clearer error message showing directory contents on failure
  - Ensure test is truly opt-in (it already is) but also gracefully handles permission errors

- [ ] **Step 3**: Fix `entrypoint.test.ts`
  - Add check for `process.env.HOME` being set; if not, skip test with `console.log` instead of asserting
  - More explicitly check for OpenCode plugin wrapper file: should be `~/.config/opencode/plugins/agent-manager.js` that re-exports from project
  - Clarify what "global command config" means - is it the command file or config? Adjust assertions to match actual installation
  - Consider making test skip if `RUN_INTEGRATION_TESTS` not set, since it checks global state

- [ ] **Step 4**: Improve test diagnostics
  - On failure, log which files were found/not found
  - Print directory listings to help debugging
  - Use descriptive assertion messages

- [ ] **Step 5**: Verify locally
  - Run with `RUN_INTEGRATION_TESTS=true bun test` after installing plugin
  - Confirm tests pass when files exist and fail gracefully when not

- [ ] **Step 6**: Update CI configuration if needed
  - Ensure integration tests are only run on appropriate runners
  - Document prerequisites in `README.md`

## Verification Criteria

- [ ] `bun test test/install.test.ts` with `RUN_INTEGRATION_TESTS=true` passes on clean repo after `bun run install-plugin`
- [ ] `bun test test/entrypoint.test.ts` passes when plugin is installed; skips gracefully when files missing
- [ ] No false failures due to missing `HOME` env var
- [ ] Test output includes helpful diagnostics on failure

## Potential Risks and Mitigations

1. **Risk**: Changing test expectations might mask real deployment issues.
   **Mitigation**: Keep assertions meaningful; only skip based on environment, not on convenience.

2. **Risk**: Making tests too permissive reduces their value.
   **Mitigation**: Maintain strict checks for files that SHOULD exist after install; only skip if preconditions (like install has been run) aren't met.

## Alternative Approaches

1. **Alternative**: Remove these integration tests entirely and rely on smoke test.
   **Trade-offs**: Loses verification of actual deployment. Not recommended since install is critical user journey.

2. **Alternative**: Use test fixtures to mock installed state rather than checking real filesystem.
   **Trade-offs**: Would require more complex setup. But would be more reliable. Could consider for future refactor.

3. **Alternative**: Convert to E2E test that runs OpenCode itself.
   **Trade-offs**: Heavy, slow, requires OpenCode binary. Already have `e2e.test.ts` for that.
