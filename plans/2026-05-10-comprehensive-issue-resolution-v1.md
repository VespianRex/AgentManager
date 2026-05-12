# Comprehensive Issue Resolution Plan - Agent Manager

**Objective**: Identify and resolve ALL problems, bugs, test gaps, and code quality issues through strict TDD methodology.

**Analysis Date**: 2026-05-10
**Branch**: fix/plugin-tool-api-node16
**Total Issues Identified**: 23

---

## CRITICAL ISSUES (Must Fix First)

### 1. TUI Architecture Duplication (CRITICAL)

**Problem**: `.opencode/tui/agent-manager.jsx` contains 762 lines duplicating logic from TypeScript sources:
- Lines 100-163: Duplicates `config.ts` discovery/load logic
- Lines 165-202: Duplicates `tui-helpers.ts:67-109` `mergeWithDefaults`
- Lines 204-215: Duplicates `config.ts:62-68` `saveConfig`
- Maintains separate state management without TypeScript

**Impact**: High risk of config drift, maintenance nightmare, bug divergence.

**Root Cause**: TUI cannot import from `src/` directly; relies on compiled `dist/` which lacks helper functions.

**Solution**: Create a dedicated TUI API module (`src/tui-api.ts`) that exports all needed functions with TUI-friendly signatures, compile to `dist/tui-api.js`, and import in JSX.

---

### 2. Failing Tests (CRITICAL)

**Problem**: Two tests fail in CI:
- `test/install.test.ts` - missing `install-plugin` script detection
- `test/entrypoint.test.ts` - expects non-existent files in `~/.config/opencode/`

**Impact**: CI pipeline unreliable, false negatives.

**Solution**: Fix test expectations to match actual deployment patterns or skip environment-specific tests.

---

### 3. Type Safety Gaps (HIGH)

**Problem**: Multiple locations use `as unknown`, `as any`, or insufficient type guards:
- `plugin.ts:103`: `document as unknown` before validation
- `subagent.ts:79,84,140`: Repeated type guard patterns should be extracted
- `plugin.ts:96`: `args: any` should be properly typed

**Impact**: Runtime errors, poor developer experience, bypasses TypeScript safety.

**Solution**: Define proper tool argument types, extract reusable type guards, eliminate type assertions.

---

### 4. Schema Validation Incompleteness (HIGH)

**Problem**:
- Read operations (`readJsoncFile`) don't validate against Zod schema
- Only save operations validate via `validateAgentManagerDocument`
- Malformed configs load successfully but fail on save
- No validation for `categories` structure in `validateAgentConfig`

**Impact**: Invalid configs can be loaded and inspected but not saved, causing user confusion.

**Solution**: Add optional validation flag to `loadConfig`, validate on read with clear error messages.

---

## HIGH PRIORITY ISSUES

### 5. Concurrent Write Race Conditions

**Problem**: `saveConfig` uses naive backup + write without file locking. Tests extensively cover this but implementation lacks proper serialization.

**Current State**: Tests expect "last write wins" but don't enforce ordering.

**Solution**: Implement file-based lock or atomic rename operations (already using atomic rename via temp file).

**Status**: Partially addressed via atomic writes, but no locking → updates may interleave.

---

### 6. Security: Path Traversal Edge Cases

**Problem**:
- `normalizePath` checks `~` paths but doesn't use `realpath` to detect symlink chains
- `validatePathWithRealpath` exists but isn't used in `findConfigFiles` or `readJsoncFile`
- Mixed path separators on Windows/Linux not fully normalized

**Impact**: Potential symlink-based path traversal if attacker controls filesystem.

**Solution**: Use `validatePathWithRealpath` consistently or integrate realpath check into `normalizePath`.

---

### 7. Memory Leak in Circular Reference Detection

**Problem**: `schema.ts:143` deletes from WeakSet after recursion, but this is potentially buggy:
- If `hasCircularReference` throws during recursion, `seen.delete(input)` may not execute
- WeakSet is meant for cycle detection; deleting entries mid-traversal breaks detection

**Code**: `schema.ts:125-146`
```typescript
const hasCircularReference = (input: unknown, seen = new WeakSet<object>(), depth = 0): boolean => {
  if (depth > MAX_RECURSION_DEPTH) return false;
  if (typeof input !== "object" || input === null) return false;
  if (seen.has(input)) return true;
  seen.add(input);
  // ... recurse ...
  seen.delete(input);  // FIXME: Should be in finally block
  return false;
};
```

**Solution**: Move `seen.delete(input)` to a `finally` block or ensure cleanup even on early returns.

---

### 8. Hard-Coded Knowledge: KNOWN_HOOKS

**Problem**: `src/data/known-hooks.json` is static; cannot be updated without code changes.

**Solution**: Externalize to a configurable list or allow plugin extension via registration API.

**Priority**: Medium - low change frequency but violates Open/Closed principle.

---

### 9. Dependency Management: Outdated Packages

**Problem**: `@opencode-ai/plugin` at 1.14.29, four versions behind latest (1.4.7 based on COMPREHENSIVE_REVIEW).

**Action**: Update to latest compatible version, run full test suite.

---

## MEDIUM PRIORITY ISSUES

### 10. Error Handling Inconsistency

**Problem**: Mix of `console.error`, `console.warn`, silent catches, and structured logging.

**Examples**:
- `config.ts:244`: `console.warn` on read failure
- `plugin.ts:123-126`: catches and returns JSON error
- `security-logger.ts:233`: `console.error` on log failure

**Solution**: Use `logSecurityEvent` for security events, structured error returns for operational errors.

---

### 11. Backup Filename Collision Risk

**Problem**: `backupConfig` uses `Date.now()` + random 8 chars. Under high concurrency, same timestamp + same random is possible (though unlikely).

**Solution**: Use `crypto.randomUUID()` exclusively (already attempted but fallback to Math.random exists). Determine if fallback is necessary (Node 20+ has randomUUID).

---

### 12. Cache TTL Not Configurable

**Problem**: `CACHE_DEFAULTS.CONFIG_CACHE_TTL_MS = 30000` fixed. Hot-reload scenarios may need shorter/longer TTL.

**Solution**: Add environment variable override or OpenCode config integration.

---

### 13. Missing Input Sanitization in normalizePath

**Problem**: `normalizePath` sanitizes `\0` but not other control characters or excessive dots (`..../`).

**Solution**: Add comprehensive path sanitization (though `path.resolve` handles most).

---

### 14. TUI Error Recovery Missing

**Problem**: `.opencode/tui/agent-manager.jsx` has global error handlers but UI components don't recover gracefully from API failures.

**Solution**: Add retry logic, fallback states, and user-friendly error messages.

---

## LOW PRIORITY / EDGE CASES

### 15. CLI `main()` Doesn't Handle Empty Selections Properly

**File**: `cli/index.ts:25-32`
**Issue**: Default to index 0 when empty input, but if user enters whitespace, it's also treated as default. This could be confusing.

**Fix**: Make default explicit only on empty string, not whitespace.

---

### 16. `configCache` Not Bounded (Potential Memory Growth)

**Problem**: Simple `Map` with TTL eviction but no size limit. Many unique file paths could cause memory growth.

**Solution**: Add LRU size limit or max entries.

---

### 17. `writeJsoncFile` Preserves Comments But May Corruption on Concurrent Writes

**Problem**: Reads from cache or disk, merges, writes. Concurrent writes could lose comment data.

**Solution**: Document that concurrent writes may lose comments; use lock if preservation critical.

---

### 18. `HealthRegistry` Save Mutex Is Not Reentrant

**Problem**: `acquireSaveLock`/`releaseSaveLock` simple queue. If `save()` called recursively within same tick, could deadlock or corrupt.

**Current**: `save()` is only called from `recordResult` (which acquires lock) and `reset` (also acquires). No recursion → OK.

**Risk**: Low but worth documenting invariant.

---

## TEST GAPS

### 19. Missing Tests for `tui-api.ts` Functions

**Gap**: `tui-helpers.test.ts` covers helpers but `tui-api.ts` (new module needed) will require fresh tests.

---

### 20. No Integration Test for Full TUI Flow

**Gap**: `tui-smoke.test.ts` exists but doesn't cover model selection, config editing, or model testing workflow.

---

### 21. Security Tests Don't Cover All Vectors

**Coverage**: Path traversal, symlinks, large files present.
**Missing**:
- Circuilar reference with prototype pollution attempt
- Race condition between lstat and open (TOCTOU)
- Unicode normalization attacks (NFC/NFD)

---

### 22. `HealthRegistry` Load Corruption Recovery Weak

**Test**: `health-registry.test.ts` covers corrupt JSON recovery but not partial field corruption (e.g., `entries` is object but individual entry missing fields).

**Status**: `sanitizeEntry` handles this → test coverage adequate.

---

### 23. `ModelTester` Cancellation Edge Cases

**Coverage**: Extensive cancellation tests.
**Missing**:
- Cancellation during `processApiResponse` processing (unlikely but possible race)
- Multiple simultaneous timeouts and cancellations on same tester

**Status**: Already well-covered.

---

## CODE QUALITY & ARCHITECTURE

### 24. Deprecated Re-exports in `agentSystem.ts`

**Issue**: Re-exports from `agent-metadata.ts` but kept for backward compatibility. Should mark as deprecated and remove in next major.

**Action**: Add JSDoc `@deprecated` to each export (already partially done), create migration guide.

---

### 25. Unused Stub File `src/tui.ts`

**File**: `src/tui.ts` - only contains type guard stub.
**Action**: Remove if unused; verify no imports.

---

## DEPLOYMENT & BUILD

### 26. Build Script Overwrites Manual dist/ Edits

**Issue**: `package.json:8` rebuilds entire dist, losing any manual fixes.

**Solution**: Source is truth; never edit dist/ manually. Document this clearly in CONTRIBUTING.

**Status**: Already documented in AGENTS.md but worth reinforcing.

---

### 27. Plugin Symlink vs. Real Directory Confusion

**History**: Previously caused crashes when `~/.config/opencode/plugins/agent-manager/` was a real directory instead of symlink.

**Current**: `deploy-plugin` script deletes and recreates as directory (not symlink to project). This is correct.

**Gap**: Documentation unclear about symlink requirement. Actually, OpenCode plugin dir expects actual files (copies), not symlinks. The symlink is from global plugins dir to project? Need clarification.

**Verification**: `AGENTS.md:107` says "Plugin symlink: `~/.config/opencode/plugins/agent-manager.js` → project file." But `deploy-plugin` copies, not symlinks.

**Action**: Clarify deployment strategy in docs. Either:
- Use symlinks (faster, easier dev), OR
- Use copies (safer, isolates deployed code)

Current behavior: copies (rsync). This is fine. Just update docs to match.

---

## DEPENDENCIES

### 28. `bunfig.toml` Missing?

**Check**: No `bunfig.toml` found. Bun uses `bunfig.toml` for configuration (like `.npmrc`).

**Action**: Add if needed for registry, caching, or test settings.

---

## SUMMARY: Proposed Fix Order (TDD)

### Phase 1: Critical Fixes (Sprint 1)
1. Create `src/tui-api.ts` to eliminate TUI duplication
2. Update `.opencode/tui/agent-manager.jsx` to use TUI API
3. Fix failing tests: `install.test.ts`, `entrypoint.test.ts`
4. Add proper type safety in `plugin.ts` (define `ToolArguments` type)
5. Fix circular reference WeakSet memory leak

### Phase 2: High Priority (Sprint 2)
6. Add schema validation on config load (optional flag)
7. Integrate `validatePathWithRealpath` into file operations
8. Implement file locking or document "last write wins" for concurrent writes
9. Update dependencies to latest
10. Improve error handling consistency

### Phase 3: Medium Priority (Sprint 3)
11. Externalize KNOWN_HOOKS to data file with extension point
12. Make backup filenames use UUID exclusively (remove fallback)
13. Add cache size limit
14. Add TUI integration tests
15. Deprecate `agentSystem.ts` re-exports

### Phase 4: Documentation & Polish (Sprint 4)
16. Clarify deployment strategy in README
17. Add missing JSDoc
18. Create migration guide from deprecated APIs
19. Add bunfig.toml if needed
20. Archive old TUI tests with migration notes

---

## Action Plan Format

Each fix will follow this structure:

```markdown
# [Issue Title]

## Objective

[Clear statement]

## Implementation Plan

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Verification Criteria

- [Criterion]
- [Criterion]

## Potential Risks and Mitigations

1. [Risk] → Mitigation
2. [Risk] → Mitigation

## Alternative Approaches

1. [Approach] - Trade-offs
2. [Approach] - Trade-offs
```

---

## TDD Commitment

**All code changes will follow**:
1. Write failing test first (RED)
2. Implement minimal fix (GREEN)
3. Refactor (REFACTOR)
4. Ensure all existing tests still pass
5. Add edge case tests if needed

**No implementation without tests** (except for trivial refactors with existing coverage).
