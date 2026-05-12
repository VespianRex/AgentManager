# Error Handling Consistency — Plan v2 (Corrected)

## Objective
Replace all `console.warn`/`console.error` calls in `src/` with `safeLogWarning`/`safeLogError`
from the existing `src/error-utils.ts` module. KISS — no new logger module needed.

## Problem Analysis (All Verified Locations)

### `console.warn` (6 occurrences):
1. `src/config.ts:244` — `console.warn('Failed to read existing config file:', err ...)`
2. `src/health-registry.ts:293` — `console.warn('Failed to remove temp backup:', err ...)`
3. `src/security-logger.ts:193` — `console.warn('Failed to resolve security log path:', err ...)`
4. `src/services/credentials/opencode-credentials.ts:136` — `console.warn(...)`
5. `src/services/model-api/opencode-client.ts:327` — `console.warn('Failed to create API client, returning null:', err ...)`
6. `src/services/model-api/opencode-client.ts:367,375,381` — multiple `console.warn`

### `console.error` (2 occurrences in src/):
1. `src/security-logger.ts:211` — `console.error("Failed to write security log: home directory is unavailable.")`
2. `src/security-logger.ts:233` — `console.error(\`Failed to write security log to ...\`)`

### Not changed (intentional):
- `src/error-utils.ts:22,35` — these ARE the centralized wrappers; they use `console.*` internally by design

### Existing utility already available:
- `src/error-utils.ts` provides `safeLogError(label, err)` and `safeLogWarning(label, err)`
- Zero imports — no circular dependency risk
- Already used in some places via `createRejectionHandler`

## Implementation Plan

- [ ] Write failing test: spy on `safeLogWarning`, verify it's called (not `console.warn`)
  when config file read fails in `readJsoncFile`
- [ ] Write failing test: spy on `safeLogError`, verify it's called (not `console.error`)
  when security log write fails in `logSecurityEvent`
- [ ] Replace `src/config.ts:244` — `console.warn(...)` with `safeLogWarning('Failed to read existing config file:', err)`
- [ ] Add `import { safeLogWarning } from './error-utils.js'` to `src/config.ts`
- [ ] Replace `src/health-registry.ts:293` — `console.warn(...)` with `safeLogWarning('Failed to remove temp backup:', err)`
- [ ] Add `import { safeLogWarning } from '../error-utils.js'` to `src/health-registry.ts`
- [ ] Replace `src/security-logger.ts:193` — `console.warn(...)` with `safeLogWarning('Failed to resolve security log path:', err)`
- [ ] Replace `src/security-logger.ts:211` — `console.error(...)` with `safeLogError("Failed to write security log: home directory is unavailable.", null)`
- [ ] Replace `src/security-logger.ts:233` — `console.error(...)` with `safeLogError(...)`
- [ ] Add `import { safeLogWarning, safeLogError } from './error-utils.js'` to `src/security-logger.ts`
- [ ] Replace `src/services/credentials/opencode-credentials.ts:136` — `console.warn(...)` with `safeLogWarning(...)`
- [ ] Add import of `safeLogWarning` from `../../error-utils.js` to credentials file
- [ ] Replace `src/services/model-api/opencode-client.ts:327,367,375,381` — all `console.warn(...)` with `safeLogWarning(...)`
- [ ] Add import of `safeLogWarning` from `../../error-utils.js` to client file
- [ ] Verify zero `console.warn`/`console.error` in `src/` (except `error-utils.ts` internals):
  `fs_search` for `console\.(warn|error|log)` in `src/` — only `error-utils.ts` matches
- [ ] Run `bun test` — all tests pass

## Verification Criteria
- [ ] Zero `console.warn`/`console.error` calls in `src/` except inside `error-utils.ts`
- [ ] All error/warning logging goes through `safeLogError`/`safeLogWarning`
- [ ] Logging is safe (never throws)
- [ ] All existing tests pass
- [ ] No circular import dependencies introduced

## Risks
1. **Minimal risk**: This is a direct replacement with same runtime behavior.
2. **Security-logger importing error-utils**: No circular dependency — `error-utils.ts`
   has zero imports.
