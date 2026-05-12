# Comprehensive AgentManager Quality Fix Plan

## Executive Summary

This plan addresses **all identified problems** in the AgentManager codebase through strict Test-Driven Development (TDD), KISS, and DRY principles. The plan is organized by priority and dependency order.

**Total Issues Identified**: 60+ across 12 categories
**Scope**: Type safety, security, concurrency, testing, build, TUI, error handling, performance

---

## Phase 1: Critical Security & Stability Fixes (TDD First)

### Priority 1: Fix Race Conditions in ConfigCache

**Rationale**: The global `configCache` is accessed concurrently without synchronization, risking data corruption under load. This is a **production stability issue**.

#### Implementation Tasks

- [ ] Write test demonstrating race condition: spawn 100 concurrent `set()`/`get()` calls, verify no corruption
- [ ] Implement `ConfigCache` mutex using queue-based locking (similar to HealthRegistry pattern)
- [ ] Add `_saveQueue` and `_isSaving` fields to ConfigCache
- [ ] Implement `acquireSaveLock()` and `releaseSaveLock()` methods
- [ ] Wrap all public `set()`, `invalidate()`, `clear()` operations in lock
- [ ] Add reentrancy guard to prevent deadlocks
- [ ] Benchmark to ensure locking doesn't create bottleneck
- [ ] Update `evictStaleCacheEntries()` to use lock
- [ ] Test cache behavior under extreme concurrency (1000 ops)

#### Verification Criteria

- [ ] Race condition test passes deterministically (no data corruption)
- [ ] All existing cache tests still pass
- [ ] Performance degradation < 10% under normal load
- [ ] Deadlock detection test confirms no deadlocks

---

### Priority 2: Secure Path Validation After Resolution

**Rationale**: `openVerifiedFile` checks symlinks pre-open but doesn't validate the resolved path stays within expected boundaries. A symlink could point to an allowed location that itself links outside.

#### Implementation Tasks

- [ ] Write test: create symlink within allowed dir that points to `/etc/passwd`, verify rejection
- [ ] Enhance `openVerifiedFile` to call `fs.realpath()` after opening
- [ ] Compare resolved path against expected base directory
- [ ] Throw error if resolved path escapes base
- [ ] Add test for macOS `/var` -> `/private/var` symlink mapping
- [ ] Update error message to be informative but not leak paths
- [ ] Document security property in JSDoc

#### Verification Criteria

- [ ] Symlink-to-external-path test fails securely (error thrown)
- [ ] Legitimate files within base still work
- [ ] Platform-specific symlink handling works (macOS)
- [ ] Error messages don't reveal filesystem structure

---

### Priority 3: Fix Backup Race Condition

**Rationale**: `backupConfig` uses `lstat` then `copyFile` with no locking between checks, vulnerable to TOCTOU attack.

#### Implementation Tasks

- [ ] Write test: simulate file becoming symlink between lstat and copy, verify failure
- [ ] Refactor `backupConfig` to use atomic `copyFile` with error handling
- [ ] On ELOOP/EMLINK errors (symlink during copy), reject as security violation
- [ ] Remove separate lstat check (redundant with copyFile failure)
- [ ] Ensure error logged via `logSecurityEvent` on symlink detection
- [ ] Test concurrent backup operations

#### Verification Criteria

- [ ] TOCTOU test case passes (symlink attack detected)
- [ ] Backup atomicity guaranteed even under concurrent access
- [ ] All existing backup tests pass

---

## Phase 2: Type Safety & Code Quality

### Priority 4: Eliminate All `as any` and `as unknown` Casts

**Rationale**: Type safety is compromised; these casts hide potential runtime errors.

#### Implementation Tasks

- [ ] Audit all `as any` and `as unknown` uses with `fs_search`
- [ ] For each cast, either:
  - [ ] Define proper TypeScript interface/type
  - [ ] Use type guards (`isPlainObject`, `isString`, etc.)
  - [ ] Narrow with `if` checks before casting
- [ ] Focus areas:
  - [ ] `config.ts:74-77` - ConfigCache.set() type coercion
  - [ ] `config.ts:144` - evictStaleCacheEntries `any` cast
  - [ ] `plugin.ts:96,103, etc.` - execute() parameter typing
  - [ ] `subagent.ts:60-62` - context.config casting
  - [ ] Test files with `as any` - fix test fixtures instead
- [ ] Enable `noImplicitAny` in tsconfig (already strict, ensure compliance)
- [ ] Run `tsc --noEmit` to catch all violations

#### Verification Criteria

- [ ] Zero `as any` or `as unknown` in src/ (test files may have limited use with justification)
- [ ] `tsc --noEmit` passes cleanly
- [ ] All type errors resolved without compromising type safety

---

### Priority 5: Standardize Error Handling

**Rationale**: Inconsistent error handling leads to unpredictable failures and poor debugging.

#### Implementation Tasks

- [ ] Define error handling policy document (in code comments or separate doc)
- [ ] Create `createError()` helper: `createError(context, message, cause?)`
- [ ] Replace all direct `new Error()` with contextual errors using `errorWithCause`
- [ ] Standardize error formatting: always use `getErrorMessage()` when extracting messages
- [ ] Remove `console.warn/error` from production code; use `safeLogError`/`safeLogWarning`
- [ ] Add context to all caught errors (where did it originate, what operation)
- [ ] Update tests to verify error messages contain useful context

#### Verification Criteria

- [ ] No direct `console.warn` or `console.error` in src/ (only in tests/cli)
- [ ] All errors include contextual information
- [ ] Error message extraction consistently uses `getErrorMessage()`
- [ ] Security-critical errors logged via `logSecurityEvent`

---

## Phase 3: Test Coverage Expansion

### Priority 6: Security Test Suite

**Rationale**: Security properties must be verified continuously.

#### Implementation Tasks

- [ ] **Path Traversal Tests**:
  - [ ] Test `../../etc/passwd` patterns rejected
  - [ ] Test null byte injection attempts
  - [ ] Test empty path resolves to cwd correctly
  - [ ] Test Windows path separators on POSIX
- [ ] **Symlink Attack Tests**:
  - [ ] Config file symlink to sensitive location
  - [ ] Symlink chain (A→B→C→/etc/passwd)
  - [ ] Symlink race condition (TOCTOU)
  - [ ] Symlink in parent directory
- [ ] **Prototype Pollution Tests**:
  - [ ] `{ "__proto__": { "admin": true } }` rejected
  - [ ] `{ "constructor": { "prototype": { "isAdmin": true } } }` rejected
  - [ ] Circular reference DoS attempt
  - [ ] Deeply nested objects (>256 depth)
- [ ] **Credential Masking Tests**:
  - [ ] API key patterns masked correctly
  - [ ] Environment variable names masked
  - [ ] Nested credential objects handled
  - [ ] Circular refs in masked data handled

#### Verification Criteria

- [ ] All security tests pass (attacks blocked)
- [ ] Test coverage report shows >95% for security-critical modules
- [ ] CI runs security tests on every commit

---

### Priority 7: Concurrency & Race Condition Tests

**Rationale**: Concurrency bugs are intermittent and devastating; need deterministic tests.

#### Implementation Tasks

- [ ] **ConfigCache Concurrency**:
  - [ ] 1000 parallel `set()` calls - verify no corruption
  - [ ] Mixed read/write during heavy write load
  - [ ] TTL eviction under concurrent access
  - [ ] LRU eviction order preserved
- [ ] **HealthRegistry Concurrency** (existing tests may suffice, verify coverage)
- [ ] **File Operations**:
  - [ ] Concurrent `saveConfig()` to same file
  - [ ] Concurrent `backupConfig()` on same file
  - [ ] Concurrent `readJsoncFile()` with TTL expiry
- [ ] Use `Promise.all()` with controlled concurrency (10-50 workers)
- [ ] Validate final state consistency (counts, sums, etc.)

#### Verification Criteria

- [ ] No data corruption in any concurrency test
- [ ] Mutex prevents overlapping writes
- [ ] Performance degrades gracefully under contention

---

### Priority 8: Missing Unit Tests for Core Functions

**Rationale**: Many functions lack basic test coverage, making refactoring risky.

#### Implementation Tasks

- [ ] **Config Module**:
  - [ ] `normalizePath()` edge cases (empty, null, undefined)
  - [ ] `validatePathWithRealpath()` error handling
  - [ ] `findConfigFiles()` when files don't exist
  - [ ] `summarizeConfig()` with malformed documents
  - [ ] `describeEditableSettings()` with missing fields
- [ ] **Subagent Pipeline**:
  - [ ] Each agent (discovery, validation, orchestration, instructionFollow) with edge cases
  - [ ] `validateAgentPermissions()` with malformed permission objects
  - [ ] `findPromptAppendDuplicates()` with empty/duplicate/null values
- [ ] **Schema Validation**:
  - [ ] Circular reference detection at various depths
  - [ ] Sanitization of prototype pollution attempts
  - [ ] Comment symbol preservation
  - [ ] `validateAgentConfig()` and `validateBenchmarkConfig()` edge cases
- [ ] **Security Logger**:
  - [ ] `maskSensitiveData()` with various data shapes
  - [ ] Log file permission setting (0o600)
  - [ ] `resolveDefaultLogPath()` failure scenarios
- [ ] **Health Registry** (gap analysis from existing tests):
  - [ ] `runningAvg()` with count=0 edge case
  - [ ] `computeStatus()` boundary conditions (exact thresholds)
  - [ ] Atomic write failure recovery
  - [ ] Corrupt JSON recovery (malformed vs. missing fields)

#### Verification Criteria

- [ ] Code coverage report shows >90% line coverage for all src/ modules
- [ ] Each function has at least 2 test cases (happy path + 1 edge)
- [ ] No `it()` blocks marked with `skip` or `todo` in critical modules

---

## Phase 4: TUI Architecture & Build Fixes

### Priority 9: Fix TUI Build Process

**Rationale**: TUI JSX imports from `../../dist/` but build doesn't compile JSX, causing runtime failures.

#### Implementation Tasks

- [ ] Research: Verify if OpenCode TUI plugins use `.jsx` directly or need precompilation
- [ ] Option A: Add JSX compilation to build (using Bun's JSX transform)
  - [ ] Configure `tsconfig.json` for JSX: `"jsx": "react-jsx"`, `"jsxImportSource": "@opentui/solid"`
  - [ ] Add JSX files to `include` array or separate `tui/` folder
  - [ ] Update build script to compile JSX to JS in dist/
- [ ] Option B: Move TUI to TypeScript with JSX (`.tsx`) and compile
  - [ ] Rename `.opencode/tui/agent-manager.jsx` to `.tsx` in source
  - [ ] Update imports from dist to relative imports within source
  - [ ] Configure dist output for TUI
- [ ] Verify `@opentui/solid/runtime-plugin-support` is loaded in OpenCode
- [ ] Add prebuild check: ensure TUI built before deploy
- [ ] Update `deploy-plugin` to also copy TUI file if needed

#### Verification Criteria

- [ ] TUI loads without JSX runtime errors
- [ ] `bun run build` produces working TUI artifact
- [ ] Deploy script copies TUI to correct location
- [ ] Manual TUI smoke test passes

---

### Priority 10: Decouple TUI from dist/ Imports

**Rationale**: Tight coupling to dist/ means TUI breaks if build out of sync. Should import from source with proper bundling.

#### Implementation Tasks

- [ ] Create `src/tui/tui-helpers.ts` that re-exports from TUI API
- [ ] Update `.opencode/tui/agent-manager.jsx` to import from project source (`../src/...`) in dev
- [ ] Use import.meta.env or config to switch between src/ and dist/ based on build mode
- [ ] Document that TUI must be built/transpiled for distribution
- [ ] Add build step for TUI: `bun build src/tui/*.tsx --outdir .opencode/tui/`
- [ ] Update package.json scripts: `build:tui`, `build:all`
- [ ] Ensure dist/ is the single source of truth for plugin server code

#### Verification Criteria

- [ ] TUI imports resolve correctly in both dev and deployed modes
- [ ] Build produces consistent artifacts
- [ ] No relative path `../../dist/` in final deployed TUI

---

## Phase 5: Error Handling & Logging Consistency

### Priority 11: Remove Console Logs from Production

**Rationale**: Production code should use structured logging, not ad-hoc console logs.

#### Implementation Tasks

- [ ] Replace `console.warn` in `config.ts:339` with `safeLogWarning('writeJsoncFile', err)`
- [ ] Replace `console.warn` in `security-logger.ts:193` with `safeLogWarning('resolveLogPath', err)`
- [ ] Replace `console.error` in `security-logger.ts:211,233` with `safeLogError` (but these are already in catch; keep but use safeLog)
- [ ] Replace `console.error` in TUI JSX lines 458, 1505 with proper error handling
  - [ ] Use `safeLogError` for logging
  - [ ] Show user-friendly toast, not stack trace
- [ ] Add lint rule to detect console.* in src/ (eslint or similar)
- [ ] Update all `logError()` helper uses to include context

#### Verification Criteria

- [ ] Zero `console.warn` or `console.error` in src/ (tests and CLI exempt)
- [ ] All logs go through safeLogError/safeLogWarning
- [ ] User-facing errors are friendly, not raw stack traces

---

### Priority 12: Centralize Error Formatting

**Rationale**: Multiple error formatting methods cause inconsistency.

#### Implementation Tasks

- [ ] Choose `getErrorMessage()` as canonical error message extractor (already exists)
- [ ] Replace all `error instanceof Error ? error.message : String(error)` with `getErrorMessage(error)`
- [ ] In `plugin.ts` execute catch blocks (lines 123, 226, 235), use `getErrorMessage`
- [ ] In TUI JSX error handlers, use `getErrorMessage`
- [ ] Deprecate direct `String(error)` conversions
- [ ] Add test for `getErrorMessage()` covering all input types

#### Verification Criteria

- [ ] All error messages extracted via `getErrorMessage()` only
- [ ] `formatError()` is either removed or aliased to `getErrorMessage`
- [ ] Consistent error output across codebase

---

## Phase 6: Performance & Memory Optimization

### Priority 13: Fix ConfigCache LRU Eviction Bug

**Rationale**: `evictStale()` iterates over Map while potentially mutating it in `get()`.

#### Implementation Tasks

- [ ] Write test: fill cache to maxEntries, access oldest, verify correct eviction
- [ ] Fix `evictStale()`: collect keys to delete first, then delete (avoid mutation during iteration)
- [ ] Ensure `get()` moves key to end without race condition (use lock from Priority 1)
- [ ] Consider using `Map` iteration order guarantees properly
- [ ] Add test for TTL + LRU interaction

#### Verification Criteria

- [ ] LRU order preserved after mixed access patterns
- [ ] No "map changed during iteration" errors
- [ ] Max entries enforced correctly

---

### Priority 14: Optimize Cache Memory Usage

**Rationale**: Default cache is unbounded (Infinity), risking memory growth.

#### Implementation Tasks

- [ ] Set sensible default `maxEntries` for `ConfigCache` (e.g., 100)
- [ ] Add configurable limit via environment variable or constructor option
- [ ] Document cache size recommendations
- [ ] Add metric: `cache.size` exposed via health check or debug endpoint
- [ ] Consider size-based eviction (bytes, not just entries) for large configs
- [ ] Benchmark memory usage with realistic workloads

#### Verification Criteria

- [ ] Cache respects maxEntries limit by default
- [ ] Memory footprint bounded in long-running processes
- [ ] Eviction doesn't remove frequently used entries prematurely

---

## Phase 7: Code Quality & Maintainability

### Priority 15: Refactor Complex Functions

**Rationale**: Long functions are hard to test and maintain.

#### Implementation Tasks

- [ ] Identify functions >50 lines via static analysis
- [ ] Refactor `writeJsoncFile` (config.ts:327-368) - extract merge logic
- [ ] Refactor `showAgentList` (TUI JSX:270-338) - break into smaller helpers
- [ ] Refactor `saveAgentConfig` (TUI JSX:1283-1368) - separate validation, save, UI update
- [ ] Ensure each extracted function has its own tests
- [ ] Add JSDoc to all public functions

#### Verification Criteria

- [ ] Max function length <50 lines
- [ ] Each function has single Responsibility
- [ ] Cyclomatic complexity <10 for each function

---

### Priority 16: Remove Dead Code & Duplication

**Rationale**: Dead code增加维护负担; duplication violates DRY.

#### Implementation Tasks

- [ ] Run `ts-unused-exports` or similar to find unused exports
- [ ] Remove truly unused functions/variables
- [ ] Consolidate error formatting (`formatError` vs `getErrorMessage`)
- [ ] Extract duplicate path normalization logic into single helper
- [ ] Remove deprecated `getSystemOverview` if unused (agentSystem.ts)
- [ ] Document intentional retention of backward compatibility exports

#### Verification Criteria

- [ ] Zero unused exports in src/
- [ ] No duplicated logic across modules
- [ ] Deprecated code clearly marked with @deprecated JSDoc

---

## Phase 8: Dependency & Build Hygiene

### Priority 17: Update Dependencies & Audit

**Rationale**: Outdated dependencies may have security vulnerabilities.

#### Implementation Tasks

- [ ] Run `bunx npm audit` and fix all high/critical issues
- [ ] Update `@opencode-ai/plugin` to latest compatible version
- [ ] Update `comment-json` if newer version available and compatible
- [ ] Update `@opentui/solid` to latest stable
- [ ] Consider updating TypeScript to 5.6+ if compatible
- [ ] Pin Bun version in README or .bun-version
- [ ] Add `bun.lockb` to git (ensure reproducible builds)
- [ ] Document minimum required Node/Bun versions

#### Verification Criteria

- [ ] `npm audit` returns no high/critical vulnerabilities
- [ ] bun.lockb committed and used by CI
- [ ] All dependencies at versions compatible with project

---

### Priority 18: Improve Build Reliability

**Rationale**: Build script deletes dist/ without checking; no verification.

#### Implementation Tasks

- [ ] Add `--noEmit` lint check before build: `bun run lint && bun run build`
- [ ] Add post-build verification: run `bun run validate-deploy`
- [ ] Fail build on any TypeScript error (already should)
- [ ] Add `preinstall` script to check Bun version
- [ ] Add build cache invalidation if needed
- [ ] Document build prerequisites
- [ ] Consider adding `bunx tsc --noEmit` as separate pre-commit hook

#### Verification Criteria

- [ ] Build fails on type errors
- [ ] `bun run build` creates valid dist/ with expected files
- [ ] `bun run ci` passes (build + deploy + smoke)
- [ ] Pre-commit hooks catch issues early

---

## Phase 9: Documentation & Developer Experience

### Priority 19: Enhance JSDoc & Inline Documentation

**Rationale**: Complex systems need clear documentation.

#### Implementation Tasks

- [ ] Audit all exported functions/classes for JSDoc completeness
- [ ] Add `@example` sections to key functions (config, validation, health)
- [ ] Document security properties (what guarantees each function provides)
- [ ] Document concurrency behavior (is function thread-safe?)
- [ ] Add `@throws` documentation for all error conditions
- [ ] Create `docs/TESTING_GUIDE.md` explaining how to run tests, what coverage means

#### Verification Criteria

- [ ] All public APIs have complete JSDoc
- [ ] Generated TypeDoc (if used) is informative
- [ ] New contributors can understand codebase from docs

---

### Priority 20: Create Contributing Guide

**Rationale**: Onboarding new contributors requires clear guidelines.

#### Implementation Tasks

- [ ] Write `CONTRIBUTING.md` with:
  - [ ] Development setup steps
  - [ ] How to run tests and coverage
  - [ ] TDD workflow expectations
  - [ ] Code style guidelines
  - [ ] PR requirements (tests, docs, etc.)
  - [ ] Troubleshooting common issues
- [ ] Add issue templates (bug report, feature request)
- [ ] Add PR template with checklist

#### Verification Criteria

- [ ] CONTRIBUTING.md exists and is comprehensive
- [ ] New contributors can follow setup without help

---

## Implementation Strategy

### TDD Workflow (Mandatory for Each Priority)

For every fix:
1. **RED**: Write failing test that captures the bug or requirement
2. **GREEN**: Implement minimal fix to make test pass
3. **REFACTOR**: Improve code quality while keeping tests green
4. **VERIFY**: Run all related tests to ensure no regressions

### KISS Principles

- One fix per commit (logical separation)
- Minimal changes to achieve test pass
- Avoid over-engineering
- Prefer simple solutions over clever ones

### DRY Enforcement

- Extract common test helpers into `test/helpers/`
- Reuse validation logic via functions, not copy-paste
- Share constants between modules via `types.ts` or `hooks.ts`
- Use factory functions for test data generation

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking changes in public API | High | Medium | Maintain backward compatibility; use deprecation cycle |
| Test flakiness from concurrency | Medium | High | Use deterministic concurrency tests with controlled workers |
| Performance regression from locking | Medium | Medium | Benchmark before/after; optimize lock granularity |
| TUI build complexity | High | Medium | Document extensively; provide fallback to CLI |
| Incomplete test coverage | High | Low | Enforce coverage thresholds in CI |

---

## Success Metrics

- **Test Coverage**: >90% line, >85% branch across all src/
- **Type Safety**: Zero `any` casts in production code
- **Security**: All security tests passing; no audit findings
- **Performance**: <10% latency increase from locking; memory bounded
- **Build**: `bun run ci` passes reliably on clean environment
- **Documentation**: All public APIs documented; CONTRIBUTING.md complete

---

## Timeline & Rollout

This plan should be implemented **gradually**, one priority at a time, with CI integration ensuring each priority doesn't break existing functionality.

**Recommended order**:
1. Phase 1 (P1-P3) - Security & Stability
2. Phase 2 (P4-P5) - Type & Error Handling
3. Phase 3 (P6-P8) - Test Coverage
4. Phase 4 (P9-P10) - TUI & Build
5. Phase 5 (P11-P12) - Error & Logging
6. Phase 6 (P13-P14) - Performance
7. Phase 7 (P15-P16) - Code Quality
8. Phase 8 (P17-P18) - Build & Dependencies
9. Phase 9 (P19-P20) - Documentation

Each priority can be a separate PR with its own test suite. Do not combine unrelated priorities in single PRs.

---

## Handoff Notes for Implementation Agent

- **Start with Priority 1** (ConfigCache mutex) - most critical stability issue
- Write tests first for every change
- Maintain backward compatibility where possible
- Update existing tests if they rely on old (buggy) behavior
- Run `bun run test` and `bun run lint` before each commit
- Check coverage with `bunx istanbul` or similar (if configured)
- Document all assumptions and design decisions in code comments
- If a fix is too large, break it into smaller, reviewable steps

All tasks must use the checkbox format for tracking progress. Implement one priority completely before moving to the next.