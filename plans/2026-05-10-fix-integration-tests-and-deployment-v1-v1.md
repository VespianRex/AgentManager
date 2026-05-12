# Fix Integration Tests and Deployment Script

## Objective

Resolve failing integration tests (`install.test.ts`, `entrypoint.test.ts`) by correcting the deployment process and fixing test logic bugs, ensuring the plugin is installed correctly and tests accurately verify the installation state.

## Problem Analysis

### 1. Deployment Script (`package.json` `deploy-plugin`)

Current script:
```json
"deploy-plugin": "rm -rf .opencode/plugins/agent-manager && mkdir -p .opencode/plugins/agent-manager && rsync -a dist/ .opencode/plugins/agent-manager/"
```

**Issues**:
- Creates a subdirectory `.opencode/plugins/agent-manager/` and copies files inside.
- OpenCode's plugin scanner (non-recursive) expects `.js`/`.ts` files directly in `.opencode/plugins/` or `plugins/`. A subdirectory is ignored unless explicitly listed in `config.json`.
- The intended layout per project knowledge is a **symlink or file** named `.opencode/plugins/agent-manager.js` pointing to the compiled plugin.

**Fix**: Deploy the plugin as a single file (or symlink) directly in the plugins directory.

### 2. `install.test.ts`

Current assertion:
```typescript
const installedPath = path.join(process.cwd(), '.opencode', 'plugins', 'agent-manager', 'index.js');
assert.ok(fs.existsSync(installedPath));
```

**Issue**: Assumes plugin is a directory with `index.js`. After fixing deployment, plugin will be at `.opencode/plugins/agent-manager.js`.

**Fix**: Update to check for `.opencode/plugins/agent-manager.js` and that it contains the server export.

### 3. `entrypoint.test.ts`

Current code:
```typescript
if (await fs.access(serverWrapperPath).catch(() => false)) {
  const serverWrapper = await fs.readFile(serverWrapperPath, "utf8");
  assert.ok(serverWrapper.includes('export { server } from "./agent-manager/index.js";'));
}
```

**Issues**:
- `fs.access` resolves to `undefined` on success, which is falsy, so the condition always skips assertions. Need explicit boolean.
- The expected string `'export { server } from "./agent-manager/index.js";'` may not match the actual content (actual re-export likely `from "./plugin.js"`).
- No check for `HOME` being set before constructing home paths; could fail if `HOME` undefined.

**Fix**: Use proper existence check:
```typescript
let exists = false;
try { await fs.access(serverWrapperPath); exists = true; } catch {}
if (exists) {
  const content = await fs.readFile(serverWrapperPath, 'utf8');
  assert.ok(content.includes('export { server }'), 'server export missing');
}
```
Similarly for home config and command file paths. Also guard for `HOME` being defined; if not, skip those checks with a descriptive message.

## Implementation Plan

- [ ] **Step 1**: Update `package.json` `deploy-plugin` script:
  ```json
  "deploy-plugin": "rm -f .opencode/plugins/agent-manager.js && ln -sf ../dist/index.js .opencode/plugins/agent-manager.js"
  ```
  Alternatively, copy instead of symlink:
  ```json
  "cp dist/index.js .opencode/plugins/agent-manager.js"
  ```
  Choose symlink for dev convenience. Ensure `mkdir -p .opencode/plugins` first. Might need to create the `plugins` dir if missing. Use: `mkdir -p .opencode/plugins && rm -f .opencode/plugins/agent-manager.js && ln -sf ../dist/index.js .opencode/plugins/agent-manager.js`.

- [ ] **Step 2**: Modify `install.test.ts`:
  - Change `installedPath` to `.opencode/plugins/agent-manager.js`.
  - Check file exists and is readable.
  - Read content and assert it contains `export { server }` (or more specific re-export pattern).
  - Add diagnostics: if file missing, list `.opencode/plugins` directory contents.

- [ ] **Step 3**: Fix `entrypoint.test.ts`:
  - Replace `if (await fs.access(...).catch(() => false))` with proper try/catch existence check.
  - For `serverWrapperPath`, assert content includes `export { server }`.
  - For `homeConfigPath`: check if `HOME` is set; if not, skip with `it.skip` or `console.log`. Given this is an `it` block, we can conditionally skip inside the test by returning early if `!process.env.HOME`.
  - For `commandFilePath`: similar.
  - Add helpful error messages on failure.

- [ ] **Step 4**: Verify that `entrypoint.test.ts` does not falsely pass; after fix, it should only assert when files exist.

- [ ] **Step 5**: Run integration tests manually:
  ```bash
  RUN_INTEGRATION_TESTS=true bun test test/install.test.ts
  RUN_INTEGRATION_TESTS=true bun test test/entrypoint.test.ts
  ```
  Ensure they pass when plugin is deployed.

- [ ] **Step 6**: Document in `README` that `bun run install-plugin` deploys the plugin as a symlink and that integration tests require it to be run first.

## Verification Criteria

- [ ] `bun run install-plugin` creates `.opencode/plugins/agent-manager.js` (symlink or file) pointing to `dist/index.js`.
- [ ] `install.test.ts` passes when run with `RUN_INTEGRATION_TESTS=true`.
- [ ] `entrypoint.test.ts` passes when plugin is installed; gracefully skips if files missing.
- [ ] No false positives from broken condition.

## Potential Risks and Mitigations

- **Risk**: Symlink creation on Windows may fail (requires permissions). The script uses `ln -sf`, which works on macOS/Linux. Since we are on macOS, fine. For cross-platform, could use `cp` instead. We'll keep symlink for dev; could add platform detection. But given project is macOS-centric (knowledge says macOS), symlink okay.
- **Risk**: Changes to test expectations might break if plugin structure changes again. Keep assertions generic enough.

## References

- OpenCode plugin load rules: non-recursive scan of `plugins/*.{js,ts}`.
- `package.json` scripts.
