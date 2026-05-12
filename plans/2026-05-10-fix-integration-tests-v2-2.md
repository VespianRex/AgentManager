# Fix Integration Tests & Deployment Script — Plan v2

## Objective
Fix the broken integration tests and the incorrect deploy-plugin script so that
CI passes and the plugin is correctly deployed as a single file in `.opencode/plugins/`.

## Problem Analysis

### Deploy Script Bug
- `package.json:9` — `"deploy-plugin": "rm -rf .opencode/plugins/agent-manager && mkdir -p .opencode/plugins/agent-manager && rsync -a dist/ .opencode/plugins/agent-manager/"`
- This deploys to a **subdirectory** which is invisible to OpenCode's non-recursive scanner
  (`src/config.ts:20` — scans `{plugin,plugins}/*.{ts,js}` non-recursively)
- Correct: deploy as a single file (or symlink) at `.opencode/plugins/agent-manager.js`

### install.test.ts Bug
- `test/install.test.ts:35` — `installedPath` expects `.opencode/plugins/agent-manager/index.js`
- Should expect `.opencode/plugins/agent-manager.js`

### entrypoint.test.ts Bugs
- **Line 14**: `if (await fs.access(serverWrapperPath).catch(() => false))` — `fs.access()`
  resolves to `undefined` (falsy), so this condition is **always false**. The assertions
  inside never execute. Must use `try { await fs.access(...); exists = true; } catch {}`
- **Line 16**: Asserts content includes `'export { server } from "./agent-manager/index.js";'`
  but `dist/index.js` actual content is `export { server } from "./plugin.js";` — wrong
  assertion string
- **Line 30**: Same `fs.access` condition bug for home config path
- **Line 49**: Same bug for command file path
- **Line 37**: `process.env.HOME` may be undefined; need to guard

## Implementation Plan

- [ ] Write failing test: verify `.opencode/plugins/agent-manager.js` exists after
  `bun run deploy-plugin` (currently fails because only directory exists)
- [ ] Fix `package.json` deploy-plugin script: change to create symlink
  `ln -sf ../dist/index.js .opencode/plugins/agent-manager.js`
  (symlink is better for dev — changes reflect immediately after rebuild)
- [ ] Also create `.opencode/plugins/` directory if missing: add `mkdir -p .opencode/plugins`
  before the symlink command
- [ ] Fix `test/install.test.ts:35`: change `installedPath` to
  `path.join(cwd, '.opencode', 'plugins', 'agent-manager.js')`
- [ ] Fix `test/install.test.ts:38`: update content assertion to match actual
  `dist/index.js` output: check for `export { server }` (generic, resilient to
  internal import path changes)
- [ ] Fix `test/entrypoint.test.ts:14`: replace broken condition with:
  ```typescript
  let serverWrapperExists = false;
  try { await fs.access(serverWrapperPath); serverWrapperExists = true; } catch {}
  if (serverWrapperExists) { ... }
  ```
- [ ] Fix `test/entrypoint.test.ts:16`: change content assertion from exact string to
  `expect(serverWrapper).toContain('export { server }')` (matches both `./plugin.js` and `./index.js`)
- [ ] Fix `test/entrypoint.test.ts:30,49`: apply same `fs.access` fix pattern
- [ ] Fix `test/entrypoint.test.ts:37`: guard `process.env.HOME` — skip if undefined
- [ ] Run `bun test test/install.test.ts test/entrypoint.test.ts` to verify fixes
- [ ] Run full `bun test` to verify no regressions

## Verification Criteria
- [ ] `bun run deploy-plugin` creates `.opencode/plugins/agent-manager.js` (symlink or file)
- [ ] `install.test.ts` passes with corrected path expectations
- [ ] `entrypoint.test.ts` condition actually executes assertions when file exists
- [ ] `entrypoint.test.ts` gracefully skips when files don't exist
- [ ] Content assertions match actual compiled output
- [ ] Full test suite passes

## Risks
1. **Symlink vs copy**: Symlinks may not work on Windows. Mitigation: project is macOS-only
   (per guidelines), and `deploy-plugin` is for local dev only.
2. **Existing plugin dir**: If `.opencode/plugins/agent-manager/` directory exists from
   old deploys, the `ln -sf` won't remove it. Mitigation: add `rm -rf .opencode/plugins/agent-manager`
   before symlink creation (clean up old directory).
