# AgentManager Comprehensive Quality Fix Plan

## Executive Summary

This plan addresses all identified issues in the AgentManager codebase including security vulnerabilities, race conditions, resource leaks, test gaps, and code quality problems. The plan follows strict TDD principles: tests are written BEFORE implementation changes, with a red-green-refactor cycle for each issue.

**Priority Ranking:**
1. **CRITICAL** - Security vulnerabilities (path traversal, symlink attacks)
2. **HIGH** - Data corruption risks (race conditions, cache bugs)
3. **MEDIUM** - Reliability issues (resource leaks, error handling)
4. **LOW** - Code quality and test coverage improvements

---

## Phase 1: Critical Security Fixes

### 1.1 Path Traversal Vulnerability Fix

**Problem**: `normalizePath` in `src/config.ts:24-61` uses simple `startsWith()` check that can be bypassed with symlinks or case sensitivity on some filesystems.

**Current Code**: `src/config.ts:46-49`
```typescript
const homeNormalized = home.endsWith(path.sep) ? home : home + path.sep;
if (!resolved.startsWith(homeNormalized) && resolved !== home) {
  throw new Error("Path traversal detected: path resolves outside home directory");
}
```

**Solution**: Use `validatePathWithRealpath` consistently and add it to `normalizePath` for `~` paths.

#### Implementation Tasks

- [ ] Write test `test/config-security-realpath.test.ts` that creates actual symlinks to test bypass scenarios
- [ ] Modify `normalizePath` to call `validatePathWithRealpath` for `~` prefixed paths
- [ ] Add comprehensive test cases:
  - [ ] Symlink chain from `~/test` -> `/etc` should be rejected
  - [ ] Case sensitivity variations (if applicable)
  - [ ] Mixed path separators (`\` on Unix)
- [ ] Verify all code paths that resolve user-supplied paths use realpath verification
- [ ] Run full test suite to ensure no regressions

### 1.2 Symlink Detection Enhancement

**Problem**: `file-security.ts` uses O_NOFOLLOW which isn't available on Windows/macOS in all Node versions. Fallback lstat check is good but should be verified.

#### Implementation Tasks

- [ ] Write platform-specific tests for symlink rejection on Windows/macOS
- [ ] Add additional test: `test/file-security-windows-compat.test.ts`
- [ ] Enhance `openVerifiedFile` to always perform lstat check as defense-in-depth
- [ ] Test that symlink chains are properly detected
- [ ] Document platform limitations in code comments

---

## Phase 2: Race Conditions and Data Corruption

### 2.1 Config Cache Invalidation Bug

**Problem**: `config-cache.test.ts:121` documents: "BUG: Cache should be invalidated after writeJsoncFile"

**Location**: `src/config.ts:169-173` - `writeJsoncFile` invalidates cache but callers like `saveConfig` may not be using it properly.

#### Implementation Tasks

- [ ] Write test `test/config-cache-invalidation.test.ts` that:
  - [ ] Reads config → modifies via saveConfig → reads again → expects fresh data
  - [ ] Tests concurrent read/write scenarios
- [ ] Verify `saveConfig` uses `writeJsoncFile` which calls `configCache.invalidate(filePath)`
- [ ] Add `invalidateAll()` call after any operation that could affect multiple config files
- [ ] Fix any identified cache invalidation gaps

### 2.2 HealthRegistry Concurrent Write Safety

**Problem**: `HealthRegistry` uses synchronous file operations without locking. Concurrent writes from multiple benchmark runs could corrupt data.

**Location**: `src/health-registry.ts:215-228`

#### Implementation Tasks

- [ ] Write test `test/health-registry-concurrency.test.ts` that:
  - [ ] Simulates 10 concurrent `recordResult` calls
  - [ ] Verifies no data loss or corruption
  - [ ] Checks file integrity after concurrent writes
- [ ] Implement file-based locking mechanism using `flock` or advisory locks
- [ ] Alternatively: use atomic write pattern (write to temp file, then rename)
- [ ] Add retry logic with exponential backoff for lock contention
- [ ] Test lock implementation on different platforms

### 2.3 ModelTester Cancellation Race Conditions

**Problem**: `model-tester.ts:275-468` has complex race between timeout, cancellation, and API response. Could result in:
- Double resolution
- Memory leaks from uncleared timeouts
- State corruption from concurrent modifications

**Specific Issues**:
- Line 305: `abortController.signal.addEventListener('abort', handleCancel);` - no cleanup on exit path before finally
- Line 351: Another listener added, both need cleanup
- Multiple `setTimeout` calls that might not be cleared if error occurs early

#### Implementation Tasks

- [ ] Write comprehensive cancellation race test `test/model-tester-cancellation-advanced.test.ts`:
  - [ ] Cancel during API response
  - [ ] Timeout during cancellation
  - [ ] Multiple simultaneous cancellations
  - [ ] Verify exactly one resolution
  - [ ] Verify all timeouts cleared
- [ ] Refactor `sendTestPrompt` to use `AbortSignal` patterns correctly:
  - [ ] Ensure every `addEventListener` has corresponding `removeEventListener` in `finally`
  - [ ] Use `{ once: true }` where appropriate to avoid manual cleanup
  - [ ] Track all timeouts in array and clear all in finally block
- [ ] Add invariant checks: throw if `response` would be set twice
- [ ] Test memory usage doesn't grow with repeated cancellations

---

## Phase 3: Resource Leaks and Error Handling

### 3.1 File Handle Leaks in Error Paths

**Problem**: `config.ts:142-159` uses `openVerifiedFile` with try/finally, but if `stat()` throws, handle might not be closed.

**Also in**: `config.ts:213-229` (backupConfig) and potentially other places.

#### Implementation Tasks

- [ ] Write test `test/file-handle-leaks.test.ts` that:
  - [ ] Simulates errors during `stat()` after file open
  - [ ] Verifies file descriptors are closed (using process.resourceUsage?)
  - [ ] Tests repeated failures don't accumulate handles
- [ ] Fix all `openVerifiedFile` usage patterns to ensure handle is closed even if `stat()` throws:
  ```typescript
  const handle = await openVerifiedFile(...);
  try {
    const { size } = await handle.stat(); // if this throws...
    // ... rest of logic
  } finally {
    await handle.close(); // ...this still runs
  }
  ```
- [ ] Consider wrapping pattern in helper to enforce correctly

### 3.2 Event Listener Leaks in TUI

**Problem**: `agent-manager.jsx` uses `setTimeout` with `api.ui.dialog.clear()` pattern extensively. If component unmounts before setTimeout fires, could attempt to update unmounted UI.

**Locations**: Multiple throughout `.opencode/tui/agent-manager.jsx`

#### Implementation Tasks

- [ ] Write test `test/tui-resource-cleanup.test.ts`:
  - [ ] Verify all setTimeout callbacks check component mounted state
  - [ ] Test rapid navigation doesn't leave pending callbacks
  - [ ] Simulate dialog disposal while timeouts pending
- [ ] Add mounted flag pattern to TUI plugin:
  ```typescript
  let isMounted = true;
  api.lifecycle.onDispose(() => { isMounted = false; });
  // In all setTimeout callbacks: if (!isMounted) return;
  ```
- [ ] Alternatively: use `setTimeout` with AbortSignal pattern (if supported)
- [ ] Clean up all `setTimeout` instances to check mounted state

### 3.3 Inconsistent Error Handling

**Problem**: Some functions use `formatError`, others use direct string conversion, others throw raw errors.

**Examples**:
- `plugin.ts:104` uses `formatError`
- `plugin.ts:358` uses `formatError`
- `plugin.ts:338` uses `formatError` in catch
- But `config.ts:127` throws `new Error(\`Failed to parse JSONC${ctx}: ${getErrorMessage(error)}\`)` - uses `getErrorMessage` which is same as `formatError`
- Actually this is mostly consistent - check for deviations

#### Implementation Tasks

- [ ] Audit all error throw/catch sites for consistency
- [ ] Standardize on `formatError` or `errorWithCause` everywhere
- [ ] Add tests that verify error messages are user-friendly and don't leak internals
- [ ] Ensure all user-facing errors go through security logger where appropriate

---

## Phase 4: Test Coverage Gaps

### 4.1 TUI Callback Pattern Enforcement

**Problem**: `test/tui-callback-validation.test.ts` documents that ALL DialogSelect components MUST have component-level `onSelect`, but this isn't enforced in production code.

**Test says**: "BUG THIS TESTS CATCH:" and "ALL Select components MUST have component-level onSelect (DOCUMENTS BUG)"

**Reality**: The JSX code DOES have component-level onSelect everywhere. But the test is checking if certain patterns are missing. Need to verify test is actually testing the right thing.

#### Implementation Tasks

- [ ] Read `test/tui-callback-validation.test.ts` fully to understand what it's checking
- [ ] Verify all DialogSelect instances in JSX have proper `onSelect` at component level (not just parent)
- [ ] If test is outdated, update or remove
- [ ] If production code missing onSelect, add it
- [ ] Consider adding linter rule to enforce pattern

### 4.2 Edge Case Tests for normalizePath

**Missing Tests**:
- Null byte injection (`\0`)
- Extremely long paths (MAX_PATH on Windows)
- Unicode normalization issues
- Symbolic link loops (already partially tested)
- Realpath symlink resolution bypasses

#### Implementation Tasks

- [ ] Write `test/normalizePath-edge-cases.test.ts`:
  - [ ] `filePath` containing `\0` is sanitized
  - [ ] Very long paths (> 4096 chars) handled gracefully
  - [ ] Unicode equivalent paths (NFC vs NFD)
  - [ ] Symlink loops detected and rejected
- [ ] Add property-based testing using `fast-check` if available

### 4.3 Integration Tests for Concurrent Operations

**Missing**: Tests that simulate multiple OpenCode instances or TUI + CLI simultaneous access.

#### Implementation Tasks

- [ ] Write `test/concurrent-access.test.ts`:
  - [ ] Two processes reading/writing same config
  - [ ] TUI and CLI operating on same files
  - [ ] HealthRegistry concurrent access
- [ ] Use actual file system with temporary directories
- [ ] Verify no corruption, appropriate error messages

### 4.4 Performance/Load Tests

**Missing**: Benchmark for operations with large configs (1000+ agents, deep nesting).

#### Implementation Tasks

- [ ] Write `test/performance.test.ts`:
  - [ ] Config parsing with 10MB file
  - [ ] HealthRegistry with 1000 model entries
  - [ ] Agent metadata lookup performance
- [ ] Establish performance budgets and failing thresholds

---

## Phase 5: Code Quality Improvements

### 5.1 Remove Dead Code and Duplication

**Problem**: `agentSystem.ts` is largely deprecated but kept for backward compatibility. This violates DRY.

**Current**: `src/agentSystem.ts` re-exports from `agent-metadata.ts` but has its own `getSystemOverview` that's "no longer called by production code".

#### Implementation Tasks

- [ ] Search codebase for imports from `agentSystem.ts`
- [ ] Replace all with direct imports from `agent-metadata.ts`
- [ ] Mark `agentSystem.ts` as deprecated with `@deprecated` and migration guide
- [ ] Remove in next breaking version after deprecation period
- [ ] Update tests that use deprecated exports

### 5.2 Extract Magic Numbers

**Problem**: Hardcoded values scattered throughout:
- `model-tester.ts:317` `effectiveTimeout === 0` special case
- `health-registry.ts:315` threshold value appears inline
- Various timeout durations

#### Implementation Tasks

- [ ] Create `src/constants.ts` or expand `types.ts` with:
  - [ ] `TIMEOUT_EFFECTIVE_ZERO = 0`
  - [ ] HEALTH_STATUS_TRANSITIONS = { UNTESTED → DEGRADED threshold }
  - [ ] All magic numbers documented with rationale
- [ ] Replace hardcoded values with constants
- [ ] Add tests that verify constants have sensible values

### 5.3 Type Safety: Reduce `any` Usage

**Problem**: Excessive `any` in test files is acceptable for mocks, but production code should avoid.

**Check**:
- `tui-api.ts` might use `unknown` - verify appropriate
- `plugin.ts:83-86` - context parameter is `unknown` but then checked - this is fine
- Look for `as any` casts in source (not tests)

#### Implementation Tasks

- [ ] Audit source files for `any` and `as any`
- [ ] Replace with more specific types or type guards
- [ ] Use `unknown` instead of `any` for external data
- [ ] Add type tests to verify type safety

### 5.4 Comment Density and Documentation

**Problem**: Some complex functions lack JSDoc. TUI code is dense and hard to navigate.

**Examples**:
- `subagent.ts:178-215` - `findPromptAppendDuplicates` and `instructionFollowAgent` have no JSDoc
- `config.ts:63-81` - `validatePathWithRealpath` lacks documentation

#### Implementation Tasks

- [ ] Add JSDoc to all exported functions and classes
- [ ] Document security assumptions and invariants
- [ ] Add examples for complex algorithms
- [ ] Consider extracting function-level comments to separate design document if too verbose

---

## Phase 6: Build and Deployment

### 6.1 Build Script Platform Compatibility

**Problem**: `package.json:9` uses `rm -rf` and `rsync` which aren't available on Windows.

#### Implementation Tasks

- [ ] Replace `rm -rf` with `fs.rmSync` in build script or use cross-platform tool
- [ ] Replace `rsync` with `cp -r` or `bun run copy` script using Node `fs`
- [ ] Test build on Windows (or document Windows unsupported)
- [ ] Add `.npmrc` or `bunfig.toml` for platform-specific scripts if needed

### 6.2 Post-Build Verification

**Problem**: No verification that built files actually work. `bun run build` could succeed but output be broken.

#### Implementation Tasks

- [ ] Add `test/build.test.ts` that:
  - [ ] Verifies all dist/*.js files exist after build
  - [ ] Imports each dist module and checks exports exist
  - [ ] Runs `tsc --noEmit` as separate lint step
- [ ] Add pre-deploy script that runs smoke tests against built plugin
- [ ] Consider adding `bun run verify-build` script

### 6.3 Symlink Deployment Validation

**Problem**: Deploy script creates `.opencode/plugins/agent-manager/` as directory, should be symlink to dist.

**From guidelines**: "Global plugins dir uses symlinks to project files."

**Issue**: Line 9: `rm -rf .opencode/plugins/agent-manager && mkdir -p .opencode/plugins/agent-manager` - creates REAL directory, not symlink!

#### Implementation Tasks

- [ ] Fix `deploy-plugin` script to create symlink instead of directory+rsync
  - [ ] Remove `rm -rf` + `mkdir -p`
  - [ ] Use `ln -sf` or create symlink to dist/
- [ ] Add test `test/deploy-symlink.test.ts` that verifies deployment creates symlink
- [ ] Document deployment structure in README

---

## Phase 7: TUI-Specific Issues

### 7.1 DialogSelect onSelect Pattern Validation

**Problem**: Test file says "BUG: DialogSelect components MUST have onSelect at component level." Need to verify if production code violates this.

**From JSX**: All Select components appear to have `onSelect` at component level. But test may be checking something else.

#### Implementation Tasks

- [ ] Examine `test/tui-callback-validation.test.ts:512-537` to understand what it's actually testing
- [ ] Determine if test is:
  - [ ] Outdated (checking for bugs already fixed)
  - [ ] Validating a subtle pattern we're still violating
  - [ ] Documentation of desired behavior that needs separate enforcement
- [ ] If test catches real issue, fix JSX code
- [ ] If test is outdated, update to reflect current correct patterns
- [ ] Consider adding linter rule to enforce pattern

### 7.2 HealthRegistry Async Initialization

**Problem**: JSX uses lazy singleton pattern for HealthRegistry. Could have race if multiple components initialize simultaneously.

**Location**: `.opencode/tui/agent-manager.jsx:26-32`

```javascript
let _healthRegistry = null;
async function getHealthRegistry() {
  if (!_healthRegistry) {
    _healthRegistry = await HealthRegistry.create();
  }
  return _healthRegistry;
}
```

**Issue**: Two concurrent calls before `_healthRegistry` is set could cause double initialization.

#### Implementation Tasks

- [ ] Write test for concurrent `getHealthRegistry` calls
- [ ] Fix with initialization promise pattern:
  ```typescript
  let _healthRegistry: HealthRegistry | null = null;
  let _healthRegistryPromise: Promise<HealthRegistry> | null = null;
  async function getHealthRegistry() {
    if (!_healthRegistryPromise) {
      _healthRegistryPromise = HealthRegistry.create().then(reg => {
        _healthRegistry = reg;
      return reg;
    });
    return _healthRegistryPromise;
  }
  ```
- [ ] Verify only one `create()` call happens with concurrent access
- [ ] Test that all callers get same instance

### 7.3 TUI Error Recovery

**Problem**: `tui-error-recovery.test.ts` exists but may not cover all failure modes.

**Coverage gaps**:
- Network failures during model test
- Config file deleted while TUI is open
- HealthRegistry write failures

#### Implementation Tasks

- [ ] Expand `tui-error-recovery.test.ts`:
  - [ ] Simulate fs errors during save
  - [ ] Simulate network timeouts in benchmark
  - [ ] Test recovery from corrupted health.json
- [ ] Add graceful degradation: if health registry fails, show error but keep UI functional
- [ ] Add retry logic with backoff for transient errors

---

## Phase 8: Security Hardening

### 8.1 Prototype Pollution Defense-in-Depth

**Problem**: `schema.ts:64-78` has `sanitizeInput` but relies heavily on Zod. Double-check it's comprehensive.

**Check**:
- Does `sanitizeInput` handle nested prototype pollution? Yes, recurses.
- Does it handle Symbol-keyed properties? Yes, iterates Object.entries only - might miss symbols!

**Actually**: Line 27 in `schema.ts` iterates `Object.entries` which doesn't include symbol properties. But line 90-97 in `hasCircularReference` does check symbols. Need consistency.

#### Implementation Tasks

- [ ] Verify `sanitizeInput` also checks Symbol-keyed properties (use `Object.getOwnPropertySymbols`)
- [ ] Add test for prototype pollution via symbol keys: `Object.defineProperty(obj, Symbol.for('__proto__'), ...)`
- [ ] Document that Zod's `.strip()` is primary defense, `sanitizeInput` is backup
- [ ] Consider removing `sanitizeInput` if Zod sufficient (KISS)

### 8.2 Security Logging for All Validation Failures

**Problem**: `security-logger.ts` exists but is only used in limited places. All security-relevant events should be logged.

**Events to log**:
- Path traversal attempts (already in normalizePath throws, but should log before throw)
- Symlink detection
- Config save operations (who saved what)
- Credential exposure attempts
- API key validation failures

#### Implementation Tasks

- [ ] Add `logSecurityEvent` calls to:
  - [ ] `normalizePath` on traversal detection
  - [ ] `openVerifiedFile` on symlink detection
  - [ ] `saveConfig` on every write (with masked sensitive data)
  - [ ] `validateAgentManagerDocument` on circular reference or prototype pollution attempts
- [ ] Write tests `test/security-logging.test.ts` that verify events are logged
- [ ] Ensure log file has proper permissions (0o600) - already done
- [ ] Add log rotation/staleness detection

### 8.3 Credential Exposure Prevention

**Problem**: `plugin.ts:351` checks `document.api_key` against env vars, but only in inspect action. What about save action?

Also: `services/credentials/` needs review for proper env var handling.

#### Implementation Tasks

- [ ] Review `services/credentials/index.ts` for:
  - [ ] Proper masking of API keys in logs
  - [ ] No leakage via error messages
  - [ ] Secure storage (only memory, no disk)
- [ ] Add test that verifies API keys never appear in plaintext in logs or error output
- [ ] Ensure `benchmark` action also validates credentials aren't saved to disk inadvertently
- [ ] Consider adding credential rotation support

---

## Phase 9: Documentation and Comments

### 9.1 Update Project Guidelines

**Problem**: Project guidelines document many anti-patterns but may be out of date.

#### Implementation Tasks

- [ ] Review `PROJECT_GUIDELINES` against current code
- [ ] Update any outdated information (e.g., plugin loading rules might have changed)
- [ ] Add section on security assumptions and threat model
- [ ] Document TDD workflow and commit message format requirement
- [ ] Add troubleshooting section for common deployment issues

### 9.2 README Updates

**Missing**:
- Clear explanation of when to use server vs TUI plugin
- How to debug plugin loading issues
- Platform support matrix

#### Implementation Tasks

- [ ] Update `README.md` with:
  - [ ] Quick start for both server and TUI
  - [ ] Troubleshooting section with error message meanings
  - [ ] Performance characteristics
  - [ ] Security model explanation
- [ ] Add architecture diagram (ASCII art OK) showing plugin loading flow
- [ ] Document test workflow: how to run tests, add new tests, TDD rules

---

## Phase 10: Comprehensive Integration Testing

### 10.1 End-to-End Workflow Tests

**Problem**: Existing `e2e.test.ts` may not cover full user workflows.

#### Implementation Tasks

- [ ] Expand `e2e.test.ts` to cover:
  - [ ] Complete setup: build → deploy → test server tool invocation
  - [ ] TUI command → UI interaction → config modification → save
  - [ ] Benchmark workflow from start to health registry update
  - [ ] Error recovery: invalid config → recover → fix
  - [ ] Multi-config scenario (project + user config merging)
- [ ] Use real temporary directories, not mocks, for file operations
- [ ] Clean up all artifacts after tests
- [ ] Add performance assertions (each step < X seconds)

### 10.2 Plugin Loading Integration Tests

**Problem**: Need to verify plugin actually loads in OpenCode environment.

**Current**: Tests mock OpenCode API, but don't test actual plugin loading.

#### Implementation Tasks

- [ ] Create `test/plugin-loading.integration.test.ts` that:
  - [ ] Creates fake OpenCode plugin directory structure
  - [ ] Copies built plugin files
  - [ ] Uses OpenCode's plugin loader (if available as library) or simulates
  - [ ] Verifies server export has proper shape
  - [ ] Verifies TUI export has proper shape
  - [ ] Tests that plugin doesn't crash on invalid input
- [ ] Add test for plugin discovery ordering (alphabetical issue mentioned in guidelines)

---

## Implementation Schedule (TDD Cycle)

For each task above, follow this cycle:

1. **RED**: Write failing test that captures the issue
2. **GREEN**: Make minimal implementation change to pass test
3. **REFACTOR**: Clean up code, add comments, ensure compliance with DRY/KISS
4. **VERIFY**: Run full test suite, check no regressions

**Order of Execution** (by priority):

### Week 1: Security Critical
- Task 1.1 (Path traversal)
- Task 1.2 (Symlink detection)
- Task 8.1 (Prototype pollution check)
- Task 8.2 (Security logging)

### Week 2: Data Integrity
- Task 2.1 (Cache invalidation)
- Task 2.2 (HealthRegistry concurrency)
- Task 2.3 (ModelTester races)

### Week 3: Resource Management
- Task 3.1 (File handle leaks)
- Task 3.2 (TUI event listener leaks)
- Task 3.3 (Error handling consistency)

### Week 4: Code Quality
- Task 4.1 (TUI callback validation)
- Task 5.1 (Dead code removal)
- Task 5.2 (Magic numbers)
- Task 5.3 (Type safety)

### Week 5: Build & Deployment
- Task 6.1 (Platform compatibility)
- Task 6.2 (Build verification)
- Task 6.3 (Symlink deployment)

### Week 6: TUI Polish
- Task 7.1 (DialogSelect pattern)
- Task 7.2 (HealthRegistry singleton)
- Task 7.3 (Error recovery)

### Week 7: Documentation
- Task 9.1 (Project guidelines)
- Task 9.2 (README)

### Week 8: Integration
- Task 10.1 (E2E workflows)
- Task 10.2 (Plugin loading)
- Final comprehensive test run and bug bash

---

## Verification Criteria

Each task must include:
- [ ] At least one new test case that fails before fix, passes after
- [ ] Existing test suite still passes (no regressions)
- [ ] Code review checklist item addressed
- [ ] Security implications documented
- [ ] Performance impact measured (if any)

**Overall Success Metrics**:
- [ ] 100% of new code covered by tests
- [ ] Zero critical security vulnerabilities (per audit)
- [ ] Zero memory leaks (verified via heap snapshots)
- [ ] Build succeeds on Linux, macOS, Windows (where applicable)
- [ ] AllTypeScript strict mode violations fixed
- [ ] No `any` types in source files (tests exempt)
- [ ] All TODOs/FIXMEs resolved or documented with ticket

---

## Risk Assessment and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes in production | Low | High | Use feature flags, gradual rollout, maintain backward compatibility |
| Test flakiness from concurrency fixes | Medium | Medium | Add retry logic to tests, use deterministic seeds |
| Performance regression from locking | Low | Medium | Benchmark before/after, use spinlock for short operations |
| Platform differences (Windows/macOS/Linux) | High | Medium | CI on all platforms, conditional code with tests |
| Incomplete test coverage after effort | Medium | Low | Use coverage tools, set minimum thresholds |

---

## Alternative Approaches Considered

### 1. **Rewrite vs Refactor**
- **Rewrite**: Discard existing code and start fresh. Higher initial cost but could eliminate technical debt.
- **Decision**: Refactor incrementally. Existing code is solid foundation, just needs hardening.

### 2. **External Dependencies for Security**
- **Option**: Use `safe-path` or similar library for path traversal.
- **Decision**: KISS - keep dependencies minimal. Our own implementation with realpath is sufficient.

### 3. **Database vs File Storage for HealthRegistry**
- **Option**: Use SQLite for concurrent access.
- **Decision**: Overkill for single-user plugin. File locking + atomic writes is simpler (KISS).

### 4. **TypeScript Strictness Level**
- **Option**: Enable `noImplicitAny`, `strictNullChecks` more aggressively.
- **Decision**: Already using `strict: true`. Could add `noUncheckedIndexedAccess` but would be large change - defer to separate effort.

---

## Conclusion

This plan addresses all identified vulnerabilities, bugs, and quality gaps through systematic TDD. Each task is independent where possible, allowing parallel execution. The 8-week timeline is aggressive but achievable with focused effort.

**Key Principles**:
- Security first: fix vulnerabilities before feature work
- TDD mandatory: no code without failing test first
- KISS/DRY: keep fixes minimal, avoid over-engineering
- Documentation: update docs as we change code
- Testing: every fix includes test, no regressions

By following this plan, the AgentManager will achieve production-ready quality with robust security, reliability, and maintainability.