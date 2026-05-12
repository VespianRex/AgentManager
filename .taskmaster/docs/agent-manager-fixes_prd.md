# AgentManager Fixes & Architecture Improvements PRD

## Executive Summary

Implement 6 critical fixes and 18 recommendations identified by a comprehensive 6-agent code review of the OpenCode Agent Manager plugin. The fixes address type safety violations, error handling gaps, performance bottlenecks, test quality issues, and architectural improvements. Zero new dependencies required — all fixes use existing project patterns or stdlib.

## Current State Analysis

The AgentManager plugin (~3,000 source lines, ~4,500 test lines) was reviewed across 6 dimensions:

**Critical Issues Found:**
- 3 `as any` type violations (schema.ts:90, plugin.ts:77, tui.ts:29)
- 1 empty catch block silently swallowing errors (model-tester.ts:181-183)
- No config caching — repeated disk I/O + JSONC parse on every plugin call
- Sequential file scanning — 10 sequential I/O ops (config.ts:79-97)
- 2 failing tests (agentSystem.test.ts — deprecated export references)
- 9 duplicate test cases (schema.test.ts:60-218)

**Security**: 0 critical, 0 high vulnerabilities. OWASP Top 10 all PASS.

**Architecture Assessment**: Clean separation of concerns (server/TUI plugins), strong security patterns (path traversal, symlink, prototype pollution), but sequential processing throughout and missing centralized error handling.

## Target Architecture

### Type Safety
- Replace all `as any` casts with proper TypeScript generics, type guards, and discriminated unions
- Use `satisfies` operator (TS 4.9+) for config validation with literal type preservation
- Add assertion functions for runtime type validation at plugin boundaries

### Performance
- Add inline LRU cache to config loading (Map + mtime checks, 15-line change)
- Parallelize `findConfigFiles()` with `Promise.all` (independent I/O ops)
- Keep `runSubAgentPipeline()` sequential (agents have semantic ordering dependencies)

### Error Handling
- Define `AppError` base class in `types.ts` with `code`, `statusCode`, `cause`
- Per-module error wrapping (re-throw with context, not swallow)
- Remove `console.error` from library code — let callers handle logging

### Testing
- Fix broken tests (update to non-deprecated imports)
- Remove duplicate test cases (delete, don't refactor)
- Add `.js` test files to `.gitignore`

## Technology Stack

- **Runtime**: Bun (already in use)
- **Language**: TypeScript 5.5+ with strict mode
- **Validation**: Zod v4 (already in use)
- **Config parsing**: comment-json v4 (already in use)
- **Testing**: Bun test runner (already in use)
- **New dependencies**: None required. `lru-cache` optional if simple Map LRU insufficient.

## Implementation Tasks

### Phase 1: Fix Failing Tests (Foundation)

#### Task 1.1: Fix agentSystem.test.ts — deprecated export references
**Priority**: High | **Risk**: Low
**File(s)**: `test/agentSystem.test.ts`
**Integration Points**: `src/agentSystem.ts` (deprecated exports), `src/agent-metadata.ts` (canonical source)
**Subtasks**:
1. Identify which deprecated exports the test references (`OH_MY_OPENCODE_AGENTS`, `DEFAULT_FALLBACK_CHAINS`)
2. Update test imports to use `src/agent-metadata.ts` functions directly
3. Verify tests pass: `bun test test/agentSystem.test.ts`
4. Run full suite to confirm no regressions
**Test Strategy**: Existing tests serve as the validation — they should go from red to green

#### Task 1.2: Remove 9 duplicate test cases in schema.test.ts
**Priority**: High | **Risk**: Low
**File(s)**: `test/schema.test.ts` (lines 60-218)
**Subtasks**:
1. Identify the 9 duplicated `it` blocks (copy-paste of permission validation tests)
2. Delete duplicates, keeping original instances
3. Verify no coverage reduction — `bun test test/schema.test.ts`
4. Run full suite to confirm no regressions
**Test Strategy**: Compare test output before/after — all previously passing tests should still pass

### Phase 2: Error Handling Cleanup

#### Task 2.1: Fix empty catch block in model-tester.ts
**Priority**: High | **Risk**: Low
**File(s)**: `src/services/model-tester/model-tester.ts` (lines 181-183)
**Subtasks**:
1. Replace `catch {}` with `catch (e) { console.error("Cancellation callback error:", e) }`
2. Verify no behavioral change — callback errors were previously silently ignored
3. Run model-tester test suite: `bun test test/model-tester*.test.ts`
**Test Strategy**: Existing model-tester tests cover cancellation scenarios — add assertion that errors are logged

#### Task 2.2: Define AppError base class in types.ts
**Priority**: Medium | **Risk**: Low
**File(s)**: `src/types.ts` (add ~30 lines), `src/schema.ts` (use AppError), `src/model-metadata.ts` (use AppError)
**Subtasks**:
1. Create `AppError` class with `code`, `statusCode`, `isOperational`, `cause` fields
2. Add `toJSON()` method for serialization
3. Create domain-specific subclasses: `ConfigValidationError`, `PluginNotFoundError`
4. Update schema.ts and model-metadata.ts to throw AppError subclasses instead of generic Error
**Test Strategy**: Add tests in schema.test.ts for AppError serialization and instanceof checks

#### Task 2.3: Remove console.error from library code (4 instances)
**Priority**: Medium | **Risk**: Low
**File(s)**: `src/schema.ts:108,126`, `src/model-metadata.ts:30,41`
**Subtasks**:
1. Replace `console.error("Invalid...", error)` with re-throwing wrapped error: `throw new AppError("Invalid config", "VALIDATION_ERROR", 400, true, error)`
2. Ensure error context (original ZodError) is preserved via `cause` property
3. Run full test suite — some tests may need updating for new error types
**Test Strategy**: Error propagation tests in schema.test.ts and model-metadata.test.ts

### Phase 3: Type Safety

#### Task 3.1: Fix `as any` in schema.ts (circular reference detection)
**Priority**: High | **Risk**: Low
**File(s)**: `src/schema.ts` (line 90)
**Subtasks**:
1. Replace `(input as any)[key]` with generic constraint on `hasCircularReference`: `function hasCircularReference(obj: Record<string, unknown>, seen: WeakSet<object>): boolean`
2. Update callers to use typed input
3. Run schema test suite
**Test Strategy**: Existing circular reference tests should pass without change — pure refactor

#### Task 3.2: Fix `as any` in tui.ts (3 parameter casts)
**Priority**: High | **Risk**: Low
**File(s)**: `src/tui.ts` (line 29)
**Subtasks**:
1. Import proper types from `@opentui/solid` — `TuiApi`, `TuiOptions`, `TuiMeta`
2. Replace `api: any, options?: any, meta?: any` with typed parameters
3. If types unavailable from @opentui/solid, define minimal interface in `global.d.ts`
**Test Strategy**: TUI tests in `test/tui.test.ts` should pass without change

#### Task 3.3: Fix `as any` in plugin.ts (discriminated union)
**Priority**: High | **Risk**: Medium
**File(s)**: `src/plugin.ts` (lines 49, 56, 70, 77), `src/types.ts` (add PluginExport union)
**Subtasks**:
1. Define discriminated union: `type PluginExport = { kind: 'server'; config: ServerConfig } | { kind: 'tui'; config: TuiConfig }`
2. Add type guard: `function isServerExport(exp: PluginExport): exp is { kind: 'server'; ... }`
3. Replace `as any` casts with type guard narrowing in tool handler
4. Update all callers that access plugin properties
**Test Strategy**: Plugin tests in `test/plugin.test.ts` — verify both server and TUI branches

### Phase 4: Performance

#### Task 4.1: Implement config LRU cache
**Priority**: High | **Risk**: Medium
**File(s)**: `src/config.ts` (add ~30 lines in `readJsoncFile` or `loadConfig`)
**Subtasks**:
1. Define cache: `const configCache = new Map<string, { doc: AgentManagerDocument; mtimeMs: number }>()`
2. Wrap `readJsoncFile` with cache check: verify mtime unchanged, return cached if fresh
3. Invalidate cache on `backupConfig` and `saveConfig` writes
4. Add cache invalidation test in `test/config.test.ts`
5. Set MAX_CACHE_SIZE = 20, DEFAULT_TTL_MS = 2000
**Test Strategy**: New tests: cache hit (same mtime → cached), cache miss (changed mtime → re-read), cache eviction (max size), write invalidation

#### Task 4.2: Parallelize findConfigFiles() with Promise.all
**Priority**: High | **Risk**: Low
**File(s)**: `src/config.ts` (lines 79-97)
**Subtasks**:
1. Replace `for (const location of CONFIG_LOCATIONS)` with `const results = await Promise.all(CONFIG_LOCATIONS.map(loc => tryRead(loc)))`
2. Extract `tryRead` helper function from loop body
3. Run config test suite — verify same results in different order (or sort output)
**Test Strategy**: Existing config discovery tests should pass; add test for parallel execution non-determinism

### Phase 5: Cleanup & Documentation

#### Task 5.1: Add .js test files to .gitignore
**Priority**: Medium | **Risk**: Low
**File(s)**: `.gitignore`
**Subtasks**:
1. Add `test/*.js` pattern to .gitignore
2. Verify no source .js files excluded (only generated test output)
**Test Strategy**: Manual verification — `git status` shows no .js test files

#### Task 5.2: Extract magic numbers to named constants
**Priority**: Low | **Risk**: Low
**File(s)**: `src/services/model-tester/model-tester.ts`
**Subtasks**:
1. Define constants: `MS_PER_SECOND = 1000`, `DEFAULT_TIMEOUT_MS = 60000`, `MAX_CONCURRENT_BENCHMARKS = 5`
2. Replace magic numbers throughout model-tester.ts
**Test Strategy**: All model-tester tests should pass unchanged

#### Task 5.3: Add JSDoc to public APIs
**Priority**: Low | **Risk**: Low
**File(s)**: `src/config.ts`, `src/plugin.ts`, `src/subagent.ts`, `src/tui-helpers.ts`, `src/types.ts`
**Subtasks**:
1. Add JSDoc to all exported functions: `@param`, `@returns`, `@throws`, `@example`
2. Priority: config.ts functions (loadConfig, saveConfig, findConfigFiles)
3. Priority: plugin.ts (AgentManagerPlugin tool handler)
4. Priority: subagent.ts (runSubAgentPipeline, individual agents)
**Test Strategy**: No test changes needed — documentation only

## Success Criteria

1. ✅ All existing tests pass (`bun test` green)
2. ✅ Zero `as any` in src/ (test files may retain for negative tests)
3. ✅ Zero empty catch blocks in src/
4. ✅ Zero `console.error` in library code (src/)
5. ✅ Config loading cached: second call <1ms (vs 5-15ms first call)
6. ✅ Config discovery parallelized: ~5-10x faster
7. ✅ AppError base class available for all error handling
8. ✅ No .js test files tracked by git

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cache staleness | Medium | Medium | Short TTL (2s), explicit invalidation on write, mtime-based verification |
| Promise.all ordering change | Low | Low | Sort results after parallel collection; existing tests verify content, not order |
| Discriminated union breaks callers | Medium | Medium | Type guard provides same narrowing behavior; grep for all `server`/`tui` property access |
| Test regressions from error type changes | Low | Low | Run full suite after each phase; fix any test expecting exact error message |
| Schema validation changes | Low | Low | Pure type-level changes; no runtime behavior modification |
