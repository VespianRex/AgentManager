# Error Handling Consistency — Plan v2

## Objective
Replace all `console.warn`/`console.error` calls with `safeLogWarning`/`safeLogError`
from the existing `src/error-utils.ts` module. KISS — no new logger module needed.

## Problem Analysis (Verified Locations)

### `console.warn`:
- `src/config.ts:244` — `console.warn('Failed to read existing config file:', error)`
- `src/health-registry.ts:293` — `console.warn('Failed to remove temp backup:', error)`
- `src/services/credentials/opencode-credentials.ts:136` — `console.warn(...)`
- `src/services/model-api/opencode-client.ts:327,367,375,381` — multiple `console.warn`

### `console.error`:
- `src/security-logger.ts:211` — `console.error("Failed to write security log: home directory is unavailable.")`
- `src/security-logger.ts:233` — `console.error(`Failed to write security log to ${logFilePath}...`)`

### Existing utility:
`src/error-utils.ts` already provides:
- `safeLogError(message: string, error?: unknown): void` — safe error logging
- `safeLogWarning(message: string, error?: unknown): void` — safe warning logging

These are already used in some places. Just need to replace the remaining `console.*` calls.

## Implementation Plan

- [ ] Write failing test: verify `safeLogWarning` is called (not `console.warn`) when
  config file read fails — mock/spy on `safeLogWarning`
- [ ] Write failing test: verify `safeLogError` is called (not `console.error`) when
  security log write fails — mock/spy on `safeLogError`
- [ ] Replace `src/config.ts:244` `console.warn(...)` with `safeLogWarning('Failed to read existing config file:', error)`
- [ ] Replace `src/health-registry.ts:293` `console.warn(...)` with `safeLogWarning('Failed to remove temp backup:', error)`
- [ ] Replace `src/security-logger.ts:211` `console.error(...)` with `safeLogError("Failed to write security log: home directory is unavailable.")`
- [ ] Replace `src/security-logger.ts:233` `console.error(...)` with `safeLogError(...)`
- [ ] Replace `src/services/credentials/opencode-credentials.ts:136` `console.warn(...)` with `safeLogWarning(...)`
- [ ] Replace `src/services/model-api/opencode-client.ts:327,367,375,381` `console.warn(...)` with `safeLogWarning(...)`
- [ ] Add `import { safeLogWarning, safeLogError } from './error-utils.js'` (or relative path)
  to each modified file
- [ ] Verify no remaining `console.warn` or `console.error` in `src/` (except in error-utils.ts itself)
- [ ] Run `bun test` — all tests pass
- [ ] Run `fs_search` for `console\.(warn|error|log)` in `src/` — zero results

## Verification Criteria
- [ ] Zero `console.warn`/`console.error` calls in `src/` (except `error-utils.ts` internals)
- [ ] All error/warning logging goes through `safeLogError`/`safeLogWarning`
- [ ] Logging is safe (no throw on logging failure)
- [ ] All existing tests pass

## Risks
1. **Minimal risk**: This is a pure replacement — same behavior, just centralized.
2. **Circular import**: If `error-utils.ts` imports from a file that imports it.
   Mitigation: `error-utils.ts` is a leaf module with no project imports.
