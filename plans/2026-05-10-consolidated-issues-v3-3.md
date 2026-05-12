# AgentManager: Consolidated Issue List & Resolution Plan v3 (Final)

## Objective
Complete, verified list of all real issues with corresponding implementation plans.
Each fix follows TDD (test first), KISS (minimal change), DRY (no duplication).

## CRITICAL Issues

### C1: Path Traversal via Directory Symlinks
- **Location**: `src/config.ts:94-133` (normalizePath), `src/config.ts:285-309` (findConfigFiles)
- **Verified**: `validatePathWithRealpath` exists at `src/config.ts:152-177` but is NEVER called
- **Attack vector**: Symlink a parent directory (e.g., `~/.config/opencode` → `/etc`);
  `lstat` on the final file passes; `O_NOFOLLOW` only catches final-component symlinks
- **Plan**: `2026-05-10-path-traversal-realpath-v2-2.md`

### C2: Integration Test Failures
- **Locations**:
  - `test/install.test.ts:35`: expects wrong path (directory vs file)
  - `test/entrypoint.test.ts:14`: `fs.access()` condition always false (resolves to `undefined`)
  - `test/entrypoint.test.ts:16`: wrong content assertion string
  - `package.json:9`: deploy-plugin creates subdirectory (invisible to scanner)
- **Plan**: `2026-05-10-fix-integration-tests-v2-2.md`

## HIGH Issues

### H1: Concurrent Write Race Conditions (config + health-registry)
- **Locations**: `src/config.ts:364-371` (saveConfig), `src/health-registry.ts:269-300` (save)
- **Verified**: No cross-process locking; health-registry has in-memory mutex only
- **Plan**: `2026-05-10-file-locking-v2-2.md`

### H2: TUI Async & Error Handling
- **Locations** (in `.opencode/tui/agent-manager.jsx`):
  - Line 478: `reloadAgents()` — fire-and-forget (no await/catch)
  - Line 468: `showFallbackManager()` — no await/catch
  - Line 449: `editModel()` — not awaited inside try/catch
  - Line 483: `testAgentModel()` — no await/catch
  - Line 493: `loadPrefs().then(...)` — no `.catch()`
  - Lines 12,18,458,1505: `console.error` instead of `safeLogError`
- **Plan**: `2026-05-10-tui-async-error-fixes-2.md`

### H3: `any` Types in Plugin Entry
- **Verified locations**:
  - `src/plugin.ts:96` — `args: any, context: any`
  - `src/plugin.ts:242` — `input: any, output: any`
  - `src/plugin.ts:103` — `args.document as unknown`
  - `src/config.ts:268` — `document as unknown` (unnecessary cast)
  - `src/services/model-api/opencode-client.ts:399` — `(this as unknown as { apiKey: string })`
- **Plan**: `2026-05-10-type-safety-v2-2.md`

### H4: Missing Schema Validation on Config Read
- **Location**: `src/config.ts:210` — `parse(raw, undefined, true) as AgentManagerDocument`
- **Verified**: `validateAgentManagerDocument` exists at `src/schema.ts:161-177` but not called on read
- **Plan**: `2026-05-10-schema-validation-on-read-v2-2.md`

### H5: `console.warn`/`console.error` in src/ (not using safeLogWarning/safeLogError)
- **Verified locations** (9 occurrences to replace):
  - `src/config.ts:244` — `console.warn`
  - `src/health-registry.ts:293` — `console.warn`
  - `src/security-logger.ts:193,211,233` — `console.warn` + 2x `console.error`
  - `src/services/credentials/opencode-credentials.ts:136` — `console.warn`
  - `src/services/model-api/opencode-client.ts:327,367,375,381` — multiple `console.warn`
- **Existing utility**: `src/error-utils.ts` has `safeLogError` and `safeLogWarning` (zero deps)
- **Plan**: `2026-05-10-error-handling-consistency-2.md`

### H6: Dependency Updates
- `@opencode-ai/plugin` at `^1.14.29` — potentially outdated
- Need security audit (`bunx npm audit`)
- **Plan**: `2026-05-10-dependency-updates-audit-2.md`

## MEDIUM Issues

### M1: Circular Reference Detection — Test Coverage Only
- **Location**: `src/schema.ts:125-146`
- **Verified**: Algorithm is CORRECT; `seen.delete(input)` at line 143 is proper DFS
  (removes nodes after subtree explored, ancestors still in `seen` for cycle detection)
- **No code change needed** — add tests only
- **Plan**: `2026-05-10-circular-ref-tests-v2-2.md`

### M2: TUI Architecture Verification
- **Verified**: `.opencode/tui/agent-manager.jsx` already imports from `dist/tui-api.js`
  and `dist/config.js`. TUI-specific helpers (health badge, prefs, dialog guard) are
  unique to TUI, not duplicated from src.
- **Plan**: `2026-05-10-tui-verify-v2-2.md`

## Debunked / Not Issues

The following were claimed in the previous session's report (`2026-05-09-AgentManager-Complete-Issue-Report-v1.0.md`)
but are **NOT actual issues** after verification:

| Claim | Reality |
|-------|---------|
| Hardcoded OAuth credentials | FALSE — `src/services/credentials/opencode-credentials.ts:75-76` uses `process.env` |
| Duplicate `BenchmarkConfig` interface | FALSE — defined once in `types.ts:21`, imported elsewhere |
| Dead code `createResponse` | FALSE — used at `model-tester.ts:420,434,448` |
| Silent catches are bugs | FALSE — all are appropriate fallback patterns (JSON.stringify, randomUUID, cleanup) |
| File size check after allocation | LOW priority — config files are small; not a real-world concern |
| TUI duplicates TypeScript logic | PARTIALLY FALSE — already imports from dist; only TUI-specific helpers remain |

## Plan Index

| Plan File | Issue(s) | Priority |
|-----------|----------|----------|
| `2026-05-10-path-traversal-realpath-v2-2.md` | C1 | Critical |
| `2026-05-10-fix-integration-tests-v2-2.md` | C2 | Critical |
| `2026-05-10-file-locking-v2-2.md` | H1 | High |
| `2026-05-10-tui-async-error-fixes-2.md` | H2 | High |
| `2026-05-10-type-safety-v2-2.md` | H3 | High |
| `2026-05-10-schema-validation-on-read-v2-2.md` | H4 | High |
| `2026-05-10-error-handling-consistency-2.md` | H5 | High |
| `2026-05-10-dependency-updates-audit-2.md` | H6 | High |
| `2026-05-10-circular-ref-tests-v2-2.md` | M1 | Medium |
| `2026-05-10-tui-verify-v2-2.md` | M2 | Medium |
