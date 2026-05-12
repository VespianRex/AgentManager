# Comprehensive Bug Fix & TDD Implementation Plan

**Objective**: Surface and solve ALL problems, errors, bugs, test gaps, and code quality issues following strict TDD, KISS, and DRY principles.

**Analysis Scope**: Full codebase deep dive with semantic search, file analysis, and test coverage assessment.

**Date**: 2025-05-08

---

## EXECUTIVE SUMMARY OF FINDINGS

### Critical Issues (Must Fix Before Release)

1. **TUI Logic Duplication** - 762-line JSX file reimplements config logic instead of using compiled modules
2. **Type Safety Violations** - `as any` casts and `@ts-ignore` in source code
3. **Build Process Destructive** - Manual dist/ edits overwritten without post-build script
4. **Incomplete Schema Validation** - No comprehensive Zod validation for full document structure
5. **Hard-Coded Knowledge** - `KNOWN_HOOKS` array should be externalized
6. **Error Handling Gaps** - Silent failures in write operations, insufficient logging
7. **Test Coverage Gaps** - Missing tests for edge cases, concurrent operations, TUI integration
8. **Dependency Outdated** - `@opencode-ai/plugin` significantly behind
9. **Documentation Deficiencies** - Missing JSDoc, unused code not removed
10. **Security Validation** - Needs verification of symlink/realpath edge cases

---

## PHASE 1: FIX CRITICAL SECURITY & RELIABILITY ISSUES

### Objective
Ensure all security boundaries are intact and file operations are robust against edge cases.

#### Task 1.1: Verify and Harden normalizePath Security
- [ ] **Rationale**: Path traversal prevention is critical; must handle all edge cases including Unicode, null bytes, Windows paths
- [ ] Read and analyze current implementation in `src/config.ts:21-57`
- [ ] Add test for null byte injection: `~/config\x00.json` should be sanitized
- [ ] Add test for Unicode homoglyphs in path components
- [ ] Add test for mixed path separators on Windows-style paths
- [ ] Verify boundary condition: `~/` exactly equals home directory
- [ ] **File**: `test/config-security-traversal.test.ts`
- [ ] **Verification**: All security tests pass; noescape vectors work

#### Task 1.2: Strengthen Symlink Detection in Concurrent Scenarios
- [ ] **Rationale**: Current lstat checks are good but need TOCTOU (time-of-check-to-use) protection
- [ ] Review `openVerifiedFile` in `src/file-security.ts` for race condition resistance
- [ ] Add test: Create symlink between lstat and readFile (should still fail)
- [ ] Add test: Rapidly toggle file between symlink and regular file during read
- [ ] Consider using O_NOFOLLOW flag consistently across all file opens
- [ ] **File**: `src/file-security.ts`, `test/config-security.test.ts`
- [ ] **Verification**: All symlink attack tests pass, including TOCTOU scenarios

#### Task 1.3: Backup Uniqueness Guarantee
- [ ] **Rationale**: Current backup uses `Date.now() + random` but could theoretically collide under extreme concurrency
- [ ] Replace random suffix with `crypto.randomUUID()` (already used but with fallback)
- [ ] Remove Math.random fallback - crypto.randomUUID is available in Node 19+ (our runtime)
- [ ] Add test: Create 10,000 concurrent backups, verify all unique
- [ ] **File**: `src/config.ts:325-344`
- [ ] **Verification**: Concurrent backup creation test passes with 10k ops

#### Task 1.4: Config Cache Invalidation on Write
- [ ] **Rationale**: Cache invalidation must be atomic with write to prevent stale reads
- [ ] Review `writeJsoncFile` deletes cache AFTER write - good
- [ ] Add test: Read config, modify externally, verify cache doesn't serve stale data
- [ ] Add test: Concurrent writes don't cause cache corruption
- [ ] **File**: `src/config.ts:262-266`
- [ ] **Verification**: Cache coherence tests pass

---

## PHASE 2: RESOLVE TYPE SAFETY ISSUES

### Objective
Eliminate all `as any` casts and `@ts-ignore` suppressions in source code (tests may use `as any` for negative testing).

#### Task 2.1: Fix plugin.ts Type Assertion at Line 120
- [ ] **Rationale**: `validated as any` bypasses TypeScript safety after zod validation
- [ ] Current code: `await saveConfig(target, validated as any);`
- [ ] Fix: Strengthen `saveConfig` signature to accept `AgentManagerDocument &Partial<...>`
- [ ] Or: Use `validated satisfies AgentManagerDocument` in Zod schema
- [ ] **File**: `src/plugin.ts:120`
- [ ] **Verification**: TypeScript compiles with `strict: true` without errors

#### Task 2.2: Remove @ts-ignore at Line 168
- [ ] **Rationale**: Suppression indicates deeper type mismatch
- [ ] Current: `// @ts-ignore - ModelTester accepts apiClient option`
- [ ] Fix: Strengthen ModelTester class definition to accept apiClient in constructor
- [ ] Inspect `src/services/model-tester/model-tester.ts` constructor signature
- [ ] Add `apiClient?: ModelApiClient` parameter if missing
- [ ] Remove suppression and ensure type checker passes
- [ ] **File**: `src/plugin.ts:168`, `src/services/model-tester/model-tester.ts`
- [ ] **Verification**: No `@ts-ignore` comments remain in src/

#### Task 2.3: Audit for Any Casts in Source
- [ ] **Rationale**: Ensure no unchecked any escapes
- [ ] Search: `grep -r " as any" src/` (done: found only line 120)
- [ ] Search: `grep -r "as unknown" src/` - review each usage
- [ ] Replace with proper type guards or generics
- [ ] **Files**: All src/*.ts
- [ ] **Verification**: `bun run lint` passes with zero any casts

---

## PHASE 3: ELIMINATE CODE DUPLICATION (DRY)

### Objective
Remove duplicated logic in TUI JSX file and ensure it imports from compiled dist modules.

#### Task 3.1: Refactor TUI JSX to Use Compiled APIs
- [ ] **Rationale**: `.opencode/tui/agent-manager.jsx` (762 lines) duplicates config discovery, merge, save logic
- [ ] **Current duplication**:
  - Lines 100-163: Config discovery/load (duplicates `config.ts`)
  - Lines 165-202: `mergeWithDefaults` (duplicates `tui-helpers.ts:67-109`)
  - Lines 204-215: `saveConfig` (duplicates `config.ts:62-68`)
- [ ] **Fix**: Replace all custom implementations with imports from `../../dist/`:
  - `import { findConfigFiles, loadConfig, saveConfig } from "../../dist/config.js";`
  - `import { mergeWithDefaults, DEFAULT_AGENTS } from "../../dist/tui-api.js";`
- [ ] Remove duplicated functions entirely
- [ ] Ensure TUI imports use the same compiled modules as the server plugin
- [ ] **File**: `.opencode/tui/agent-manager.jsx`
- [ ] **Verification**: TUI functions correctly after refactor; all TUI tests pass

#### Task 3.2: Remove Unused Stub File
- [ ] **Rationale**: `src/tui.ts` is a 5-line stub that's not used; server loads from `index.ts`
- [ ] Delete `src/tui.ts`
- [ ] Update any references (should be none)
- [ ] **File**: `src/tui.ts` (delete)
- [ ] **Verification**: Build and tests still pass without tui.ts

---

## PHASE 4: IMPROVE ERROR HANDLING & OBSERVABILITY

### Objective
Replace silent failures with proper logging and user feedback.

#### Task 4.1: Add Error Logging to writeJsoncFile
- [ ] **Rationale**: Silent fallback to empty base object masks permission errors
- [ ] Current (`src/config.ts:232-239`): Catches errors, warns, continues with `base = {};`
- [ ] Fix: Log error with full context (file path, error details)
- [ ] Consider: Should this be a warning or throw? For TUI, continue is OK but log clearly.
- [ ] Add structured log: `console.error('[writeJsoncFile] Failed to read existing config:', { filePath, error: err.message })`
- [ ] **File**: `src/config.ts:235-237`
- [ ] **Verification**: Error appears in logs when base file unreadable

#### Task 4.2: Add Logging to findConfigFiles Silent Skips
- [ ] **Rationale**: Missing files are silently ignored (OK), but symlink/perm errors should be logged at debug level
- [ ] Add debug log in catch block when `err.code !== 'ENOENT'` to help diagnose permission/symlink issues
- [ ] Use `console.debug` to avoid noise in production
- [ ] Include resolved path and error code
- [ ] **File**: `src/config.ts:289-293`
- [ ] **Verification**: Debug logs appear for non-ENOENT errors

#### Task 4.3: Replace console.warn with Structured Logging in Services
- [ ] **Rationale**: Many services use raw console.warn; should use a logger abstraction
- [ ] Identify all `console.warn` in `src/services/` (from search: 5 instances)
- [ ] Quick fix: Standardize on `console.warn('[ServiceName]', message)` format
- [ ] Better: Create simple `logger` utility with levels (debug, info, warn, error)
- [ ] **Files**: `src/services/credentials/opencode-credentials.ts`, `src/services/model-api/opencode-client.ts`
- [ ] **Verification**: Consistent log format across services

---

## PHASE 5: COMPLETE SCHEMA VALIDATION

### Objective
Implement comprehensive Zod schema for AgentManagerDocument and enforce validation at boundaries.

#### Task 5.1: Audit and Enhance Schema in src/schema.ts
- [ ] **Rationale**: Current schema may not cover all fields comprehensively
- [ ] Review `src/schema.ts` (not yet read) for coverage of:
  - agents: model, fallback, fallback_models, permission, prompt_append, etc.
  - categories: name, agents array
  - disabled_hooks, disabled_agents, disabled_skills
  - sisyphus_agent, background_task (typed correctly)
- [ ] Add missing field validators (e.g., fallback_models must be string array)
- [ ] Add nested object schemas for permission objects
- [ ] Export `validateAgentManagerDocument` and `validatePartialAgentManagerDocument`
- [ ] **File**: `src/schema.ts`
- [ ] **Verification**: Schema rejects invalid structures not caught by subagent

#### Task 5.2: Enforce Validation at Plugin Save Entry Point
- [ ] **Rationale**: Already calls `validatePartialAgentManagerDocument` - ensure it uses updated schema
- [ ] Plugin save action (`src/plugin.ts:101-125`) validates each agent with `validateAgentConfig`
- [ ] Ensure `validateAgentConfig` uses the enhanced schema
- [ ] Add test: Attempt to save config with invalid field types; expect rejection
- [ ] **Files**: `src/plugin.ts`, `src/schema.ts`
- [ ] **Verification**: Invalid save attempts return clear error messages

#### Task 5.3: Validate Config Document After Load
- [ ] **Rationale**: Currently `loadConfig` returns raw parsed JSONC without validation
- [ ] Option: Add optional validation flag to `loadConfig` for strict mode
- [ ] Better: Always validate but be lenient - warn for missing/unexpected fields
- [ ] Inject subagent validation into load pipeline? (May be overkill)
- [ ] **Decision**: Keep load lenient, validate on write. Document this clearly.
- [ ] **File**: `src/config.ts`
- [ ] **Verification**: Load accepts any JSONC; write rejects invalid structures

---

## PHASE 6: UPDATE DEPENDENCIES & BUILD PROCESS

### Objective
Modernize dependencies and fix build process to prevent manual edit loss.

#### Task 6.1: Update @opencode-ai/plugin to Latest Compatible
- [ ] **Rationale**: Currently ^1.14.29; docs suggest 1.4.7 (check actual latest)
- [ ] Run: `bun update @opencode-ai/plugin` to get latest 1.x
- [ ] Verify plugin API unchanged (tool definition, tui.command.execute)
- [ ] Run all tests to ensure compatibility
- [ ] **File**: `package.json`
- [ ] **Verification**: Tests pass with updated dependency

#### Task 6.2: Add Post-Build Script for Manual Fixes
- [ ] **Rationale**: Manual dist/ edits are lost on rebuild (known issue)
- [ ] If any manual fixes remain (should be none after refactoring), create `scripts/postbuild.ts`
- [ ] Postbuild runs after `bun run build` to apply patches to dist/
- [ ] Better: Eliminate need for manual fixes by ensuring source is single source of truth
- [ ] **Check**: After Phase 3 (TUI refactor), verify no manual dist edits needed
- [ ] If still needed: Add `"postbuild": "bun run scripts/postbuild.ts"` to package.json
- [ ] **File**: `package.json`, optional `scripts/postbuild.ts`
- [ ] **Verification**: Rebuild doesn't require manual intervention

#### Task 6.3: Add TypeScript Build Strictness
- [ ] **Rationale**: Ensure strict type checking in CI
- [ ] Already have `"strict": true` in tsconfig - good
- [ ] Add `"noImplicitAny": true`, `"strictNullChecks": true` (may be included)
- [ ] Verify `bun run lint` catches all type errors
- [ ] **File**: `tsconfig.json`
- [ ] **Verification**: Lint passes with zero errors

---

## PHASE 7: FILL TEST COVERAGE GAPS

### Objective
Achieve >90% branch coverage and add missing edge case tests.

#### Task 7.1: Add Missing Tests for TUI Helpers
- [ ] **Rationale**: `tui-helpers.test.ts` exists but may miss edge cases
- [ ] Add test for `modelBadge` with unknown model (should return default)
- [ ] Add test for `shortenModel` with extremely long model names (>100 chars)
- [ ] Add test for `determineSectionKey` with special characters in agent name
- [ ] Add test for `buildAgentUpdate` merging fallback_models arrays correctly
- [ ] **File**: `test/tui-helpers.test.ts`
- [ ] **Verification**: Coverage report shows 100% for tui-helpers.ts

#### Task 7.2: Add Tests for Config Paths Module
- [ ] **Rationale**: `src/config-paths.ts` has no dedicated test file
- [ ] Create `test/config-paths.test.ts`
- [ ] Test: `PROJECT_CONFIG_PATHS` order is correct
- [ ] Test: `getUserConfigDir()` returns correct path on different OS
- [ ] Test: Constants are frozen (Object.isFrozen)
- [ ] **File**: `test/config-paths.test.ts` (new)
- [ ] **Verification**: New test file added and passing

#### Task 7.3: Add Tests for Hooks Module
- [ ] **Rationale**: `src/hooks.ts` exports constants; ensure they're correct
- [ ] Create `test/hooks.test.ts`
- [ ] Test: `KNOWN_HOOKS` contains expected hooks (sample check)
- [ ] Test: `PERMISSION_VALUES` is `['ask', 'allow', 'deny']`
- [ ] Test: `AGENT_PERMISSION_FIELDS` includes all known fields
- [ ] Test: Arrays are frozen
- [ ] **File**: `test/hooks.test.ts` (new)
- [ ] **Verification**: New test file added and passing

#### Task 7.4: Expand Subagent Pipeline Tests
- [ ] **Rationale**: Add tests for edge cases in each agent
- [ ] Test `discoveryAgent` with empty config (agentCount = 0)
- [ ] Test `systemExplanationAgent` with null config (should still return success)
- [ ] Test `validationAgent` with malformed permission objects
- [ ] Test `orchestrationAgent` with sisyphus_agent as non-string (should handle gracefully)
- [ ] Test `instructionFollowAgent` with 1000 agents (performance)
- [ ] **File**: `test/subagent.test.ts` (extend)
- [ ] **Verification**: All edge cases covered

#### Task 7.5: Add E2E Test for Full Workflow
- [ ] **Rationale**: Existing e2e test may not cover complete user journey
- [ ] Create/additional `test/e2e-full-workflow.test.ts`
- [ ] Steps:
  1. Create temp project with sample config
  2. Call `agent_manager` tool with inspect action
  3. Parse response, verify summary fields
  4. Call `agent_manager` tool with save action (modify agent)
  5. Verify file updated, backup created
  6. Call `agent_manager` tool with benchmark action (mocked)
  7. Verify health registry updated
- [ ] Mock OpenCode context; use tool.execute directly
- [ ] **File**: `test/e2e-full-workflow.test.ts` (new)
- [ ] **Verification**: Full integration test passes

#### Task 7.6: Add Tests for Comment Preservation Edge Cases
- [ ] **Rationale**: Ensure round-trip preservation works with complex comment placements
- [ ] Test: Comments between array items
- [ ] Test: Block comments inside nested objects
- [ ] Test: Multiple consecutive comments
- [ ] Test: Comment before closing brace
- [ ] Test: Trailing commas with comments (JSONC allows)
- [ ] **File**: `test/config-comments.test.ts` (extend existing or new)
- [ ] **Verification**: All comment patterns preserved after save

---

## PHASE 8: DOCUMENTATION & CODE QUALITY

### Objective
Address documentation gaps and clean up codebase.

#### Task 8.1: Add JSDoc to config-paths.ts
- [ ] **Rationale**: Module exports lack documentation
- [ ] Add JSDoc for:
  - `PROJECT_CONFIG_PATHS` - what they are, precedence order
  - `USER_CONFIG_PATHS`
  - `getUserConfigDir()` - purpose, return value, examples
- [ ] **File**: `src/config-paths.ts`
- [ ] **Verification**: TypeScript language server shows docs on hover

#### Task 8.2: Add JSDoc to tui-helpers.ts
- [ ] **Rationale**: Functions used by TUI need clear docs
- [ ] Document: `modelBadge`, `shortenModel`, `mergeWithDefaults`, `determineSectionKey`, `buildAgentUpdate`
- [ ] Include parameter types, return types, examples
- [ ] **File**: `src/tui-helpers.ts`
- [ ] **Verification**: Hover docs available

#### Task 8.3: Add JSDoc to subagent.ts Functions
- [ ] **Rationale**: Complex validation logic needs documentation
- [ ] Document: `validateAgentPermissions`, `findPromptAppendDuplicates`
- [ ] Document internal helpers: `readStringArrayField`, `readObjectField`
- [ ] **File**: `src/subagent.ts`
- [ ] **Verification**: Hover docs available

#### Task 8.4: Externalize KNOWN_HOOKS to JSON
- [ ] **Rationale**: Hard-coded array requires code changes for updates
- [ ] Create `src/data/known-hooks.json` with array of strings
- [ ] Load at runtime in `hooks.ts`: `import hooksData from './data/known-hooks.json' assert { type: 'json' };`
- [ ] Export `KNOWN_HOOKS = hooksData.default || hooksData;`
- [ ] Add test: Load and verify array not empty
- [ ] **Files**: `src/data/known-hooks.json` (new), `src/hooks.ts` (modify)
- [ ] **Verification**: Hooks can be updated by editing JSON only

#### Task 8.5: Remove Deprecated Re-exports from agentSystem.ts
- [ ] **Rationale**: AGENTS.md mentions "deprecated re-exports" - need to locate and remove
- [ ] Search `src/agentSystem.ts` for unused exports
- [ ] Remove any `export * from './something'` that's not needed
- [ ] Ensure public API remains stable (check imports in other files)
- [ ] **File**: `src/agentSystem.ts`
- [ ] **Verification**: Build passes after cleanup

#### Task 8.6: Update AGENTS.md Documentation
- [ ] **Rationale**: Documentation may be stale relative to code
- [ ] Review `src/AGENTS.md` for accuracy
- [ ] Update if module dependency graph changed
- [ ] Update WHERE TO LOOK table if file locations changed
- [ ] Add note about TUI now using dist/ imports (after Phase 3 fix)
- [ ] **File**: `src/AGENTS.md`
- [ ] **Verification**: Docs match current code structure

---

## PHASE 9: VERIFICATION & CI INTEGRATION

### Objective
Ensure all fixes are verified and CI catches regressions.

#### Task 9.1: Run Full Test Suite After Each Phase
- [ ] **Rationale**: Continuous integration of fixes
- [ ] Command: `bun test test/*.test.ts`
- [ ] Target: 0 failures
- [ ] Generate coverage: `bun test --coverage`
- [ ] Target: >90% line coverage, >85% branch coverage
- [ ] **Verification**: All tests green

#### Task 9.2: Add Pre-commit Hook for Type Checking
- [ ] **Rationale**: Prevent type errors from being committed
- [ ] Create `.husky/pre-commit` or `scripts/precommit.ts`
- [ ] Run: `bun run lint` before allowing commit
- [ ] **File**: `scripts/precommit.ts` or husky config
- [ ] **Verification**: Type errors block commit

#### Task 9.3: Add CI Workflow (GitHub Actions)
- [ ] **Rationale**: Automated testing on push/PR
- [ ] Create `.github/workflows/ci.yml`
- [ ] Steps: setup bun, install deps, run lint, run test with coverage, upload coverage
- [ ] **File**: `.github/workflows/ci.yml` (new)
- [ ] **Verification**: CI passes on all branches

---

## ALTERNATIVE APPROACHES & TRADE-OFFS

### Schema Validation Strategy
- **Option A**: Strict validation on both load and write (safer but may break existing configs)
- **Option B**: Lenient load, strict write (chosen) - preserves backwards compatibility
- **Trade-off**: Option B allows invalid configs to exist but prevents new invalid writes

### TUI Refactoring Approach
- **Option A**: Keep some duplication for TUI-specific needs (anti-pattern)
- **Option B**: Factor TUI-specific logic into separate helpers, use shared core (chosen)
- **Trade-off**: Option B requires care to keep TUI abstraction clean

### Logging Strategy
- **Option A**: Structured logger with levels ( Winston/Pino ) - heavier
- **Option B**: Simple console with prefixes (chosen) - KISS
- **Trade-off**: Option B sufficient for plugin, may need upgrade later

---

## SUCCESS METRICS

1. **Zero TypeScript errors** with `strict: true`
2. **Zero any casts** in source files (tests exempt)
3. **Zero @ts-ignore** comments in source
4. **Test coverage**: >90% line, >85% branch
5. **All security tests** passing (path traversal, symlink, backup uniqueness)
6. **No duplicate logic** between TUI JSX and TypeScript modules
7. **Build reproducibility**: `bun run build` produces working dist without manual edits
8. **All existing tests** pass without modification
9. **Documentation**: JSDoc on all public functions
10. **CI green** on all branches

---

## RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TUI refactor breaks existing UI | Medium | High | Thoroughly test after each function refactor; keep changes incremental |
| Type strictness reveals hidden bugs | High | Medium | Fix bugs as they appear; don't suppress |
| Externalizing KNOWN_HOOKS breaks imports | Low | Low | Use JSON5 or JSON with proper type assertion |
| Concurrent backup test flakes | Medium | Low | Use deterministic UUIDs in test instead of crypto |
| Dependency update introduces breaking changes | Low | Medium | Pin to minor version, test thoroughly |
| Coverage target unrealistic | Low | Low | Aim for >90% but accept >85% if certain code inherently untestable (e.g., process.on handlers) |

---

## TDD WORKFLOW ADHERENCE

**For each task**:
1. **RED**: Write failing test first (or identify existing failing test)
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Clean up, eliminate duplication, improve names
4. **COMMIT**: Small, focused commit with clear message

**Commit message format**: `TDD: [PHASE] - [Task description]`

**Example**:
```
TDD: PHASE1 - Add test for null byte path traversal
- test(config-security-traversal.test.ts): Add test for \x00 injection
- Status: RED (test fails, normalizePath vulnerable)
- Fix: Sanitize \0 in normalizePath
```

---

## HANDOFF TO IMPLEMENTATION AGENT

This plan provides:
- Clear numbered tasks with checkboxes
- Rationale for each change
- File locations and line references
- Verification criteria
- Alternative approaches evaluated
- Risks with mitigations

**Next Step**: Implementation agent should execute tasks in order, following TDD for each. Do not skip tasks. Track progress by checking boxes. Report any blockers or discovered issues not in this plan.

---

**Plan Version**: v1.0
**Total Estimated Tasks**: 40+
**Estimated Complexity**: High (requires deep TypeScript, Node.js, TDD expertise)
**Estimated Time**: 2-3 days full-time
