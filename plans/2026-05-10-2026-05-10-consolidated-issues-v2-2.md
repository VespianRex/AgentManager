# AgentManager: Consolidated Issue List & Resolution Plan v2

## Objective
Comprehensive fix plan for all verified bugs, security vulnerabilities, test failures,
and code quality issues. Each fix follows TDD (test first), KISS (minimal change), DRY (no duplication).

## Verified Issues (Prioritized)

### CRITICAL

#### C1: Path Traversal via Directory Symlinks
- **Location**: `src/config.ts:94-133` (normalizePath), `src/config.ts:285-309` (findConfigFiles)
- **Problem**: `normalizePath` uses `path.resolve` which does NOT follow symlinks.
  `findConfigFiles` checks `lstat(resolved).isSymbolicLink()` on the FINAL file only.
  A symlink in a PARENT directory (e.g., `~/.config/opencode` -> `/etc`) bypasses both
  checks because `lstat` on the config file sees a regular file, not a symlink.
- **Fix**: Use existing `validatePathWithRealpath` (lines 152-177) in `findConfigFiles`
  after existence check, with appropriate base (home for user paths, cwd for project).
  Keep `lstat` symlink rejection for file-level symlinks as defense-in-depth.
- **Impact**: Security — attacker can read/write files outside home directory.

#### C2: Integration Test Failures
- **Locations**:
  - `test/install.test.ts:35`: expects `.opencode/plugins/agent-manager/index.js` (directory)
  - `test/entrypoint.test.ts:14`: `fs.access()` resolves to `undefined` (falsy), so condition
    `if (await fs.access(...).catch(() => false))` is ALWAYS false — assertions never execute
  - `test/entrypoint.test.ts:16`: asserts content includes `'export { server } from "./agent-manager/index.js";'`
    which doesn't match actual `dist/index.js` content (exports from `./plugin.js`)
  - `package.json:9`: `deploy-plugin` deploys to subdirectory (invisible to scanner)
- **Fix**: Fix deploy script, fix test conditions, update assertions to match actual content.

### HIGH

#### H1: Concurrent Write Race Conditions (config)
- **Location**: `src/config.ts:364-371` (saveConfig)
- **Problem**: No locking; concurrent writes cause lost updates or corruption.
- **Fix**: Add file locking using atomic `mkdir` for lock directory, with retry and stale cleanup.

#### H2: Concurrent Write Race Conditions (health-registry)
- **Location**: `src/health-registry.ts:269-300` (save method)
- **Problem**: In-memory mutex only protects same-process; cross-process writes can corrupt.
  Also uses `console.warn` at line 293.
- **Fix**: Add same file-locking mechanism as config. Replace `console.warn` with `safeLogWarning`.

#### H3: `any` Types in Plugin Entry
- **Locations**: `src/plugin.ts:96` (`args: any, context: any`), `src/plugin.ts:242`
  (`input: any, output: any`)
- **Problem**: Bypasses type checking on critical code paths.
- **Fix**: Define proper interfaces for OpenCode tool args, context, TUI command input/output.
  Use type guards for runtime validation of args.

#### H4: Missing Schema Validation on Config Read
- **Location**: `src/config.ts:210` — `parse(raw, undefined, true) as AgentManagerDocument`
- **Problem**: Config parsed as `any` then cast to `AgentManagerDocument` without validation.
  Corrupted config files cause runtime errors downstream.
- **Fix**: Call `validateAgentManagerDocument(document)` after parsing, throw `ValidationError`
  with file path context if invalid.

#### H5: `console.warn`/`console.error` Scattered Across Codebase
- **Locations** (all verified):
  - `src/config.ts:244` — `console.warn('Failed to read existing config file:', ...)`
  - `src/health-registry.ts:293` — `console.warn('Failed to remove temp backup:', ...)`
  - `src/security-logger.ts:211` — `console.error("Failed to write security log: home directory is unavailable.")`
  - `src/security-logger.ts:233` — `console.error(`Failed to write security log to ...`)`
  - `src/services/credentials/opencode-credentials.ts:136` — `console.warn(...)`
  - `src/services/model-api/opencode-client.ts:327,367,375,381` — multiple `console.warn`
- **Note**: `src/error-utils.ts` already provides `safeLogError` and `safeLogWarning` utilities!
  These just aren't used consistently.
- **Fix**: Replace all `console.warn`/`console.error` with `safeLogWarning`/`safeLogError`
  from `error-utils.ts`. No new logger module needed — that's KISS.

#### H6: `as unknown` Casts Bypassing Type Safety
- **Locations**:
  - `src/config.ts:268` — `merge(base, document as unknown)` — merge function accepts `unknown` but this cast hides the actual type
  - `src/plugin.ts:103` — `args.document as unknown` — unnecessary double cast
  - `src/services/model-api/opencode-client.ts:399` — `(this as unknown as { apiKey: string }).apiKey`
- **Fix**: Properly type the merge function parameters. Type the `args.document` directly.
  Use proper type assertion for the API client.

### MEDIUM

#### M1: Circular Reference Detection Algorithm — No Bug, Needs Tests
- **Location**: `src/schema.ts:125-146`
- **Analysis**: The `seen.delete(input)` at line 143 is **correct** — it's a DFS optimization
  that removes nodes after their subtree is fully explored, while ancestors remain in `seen`
  for cycle detection. Early returns on `true` (cycle found) skip delete, which is correct.
- **Action**: Add comprehensive tests to verify correctness. No code change needed.

#### M2: TUI Already Uses Facade — Duplication Claim Needs Verification
- **Location**: `src/tui-api.ts` (24-line facade), `.opencode/tui/agent-manager.jsx`
- **Analysis**: `tui-api.ts` already re-exports from `config.js`, `tui-helpers.js`,
  `health-registry.js`, `agent-metadata.js`. The JSX file may still duplicate some
  inline helpers (like health badge functions) but the core architecture is already DRY.
- **Action**: Verify JSX file imports; if it already uses `dist/tui-api.js`, this issue
  is resolved. Remove any remaining inline helpers.

## Plan Map

| Issue | Plan File | Priority |
|-------|-----------|----------|
| C1 | `2026-05-10-path-traversal-realpath-v2` | Critical |
| C2 | `2026-05-10-fix-integration-tests-v2` | Critical |
| H1+H2 | `2026-05-10-file-locking-v2` | High |
| H3+H6 | `2026-05-10-type-safety-v2` | High |
| H4 | `2026-05-10-schema-validation-on-read-v2` | High |
| H5 | `2026-05-10-error-handling-v2` | High |
| M1 | `2026-05-10-circular-ref-tests-v2` | Medium |
| M2 | `2026-05-10-tui-verify-v2` | Medium |
