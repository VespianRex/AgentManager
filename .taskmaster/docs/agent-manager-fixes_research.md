# Research Findings: AgentManager Fixes & Architecture Options

Generated: 2026-04-25

## Codebase Analysis

**Source**: Comprehensive exploration by code-explorer agent (bg_72f5b531)

### Key Files & Issues

| File | Lines | Issues Found | Pattern |
|------|-------|-------------|---------|
| `src/schema.ts` | 129 | `as any` at L90, `console.error` at L108,126 | Zod validation, sanitizeInput security |
| `src/plugin.ts` | 104 | `as any` at L49,56,70,77 | Async plugin factory, tool definition |
| `src/tui.ts` | 43 | `as any` at L29 (3 params) | SolidJS TUI command registration |
| `src/config.ts` | 137 | No caching, sequential scanning L79-97 | JSONC, path traversal prevention, backups |
| `src/subagent.ts` | 166 | Sequential pipeline L18-30, `as any` L21 | 5-agent validation pipeline |
| `src/agentSystem.ts` | 53 | Deprecated exports (DRY violation) | Backward compat wrappers |
| `src/model-metadata.ts` | 151 | `console.error` L30,41 | Zod schemas, model registry |
| `src/model-tester.ts` | 776 | Empty catch L181-183, 277-line fn L211-488 | Promise.race, cancellation, benchmarking |
| `test/schema.test.ts` | 1224 | Duplicate test code L60-218 | Bun test, extensive edge cases |
| `test/agentSystem.test.ts` | 18 | Failing tests (deprecated API) | Simple validation tests |

### Existing Patterns

- **Error handling**: try/catch with throw, some empty catches, console.error in library code
- **Type safety**: Zod schemas, TypeScript strict mode, BUT `as any` in 8 locations
- **Async**: async/await throughout, no Promise.all, sequential file scanning
- **Security**: path traversal prevention (normalizePath), symlink rejection (lstat), prototype pollution protection
- **Testing**: Bun test framework, describe/it/expect, factory pattern in helpers/, 2.5:1 test-to-source ratio
- **Import patterns**: .js extensions (Node16 module resolution), no circular dependencies

### Utility Functions Available for Reuse

- `normalizePath()` (config.ts) — path validation
- `sanitizeInput()` (schema.ts) — prototype pollution protection
- `backupConfig()` (config.ts) — unique timestamp backup pattern
- `modelBadge()`, `shortenModel()`, `mergeWithDefaults()` (tui-helpers.ts)
- `formatError`, `categorizeError`, `createResponse` (model-tester.ts)

### No Existing Patterns Found

- ❌ No LRU/memoization implementation
- ❌ No centralized error logging utility
- ❌ No configuration caching mechanism
- ❌ No constants file for magic numbers

## Architecture Analysis

**Source**: Oracle architecture review (bg_0dfa30e0)

### Critical Fixes — Approach & Risk

| Fix | Recommendation | Risk | Files |
|-----|---------------|------|-------|
| `as any` in schema.ts:90 | Generic constraint: `<T extends ZodType>` | Low | schema.ts, callers |
| `as any` in plugin.ts:77 | Discriminated union + type guard | Med | plugin.ts, types.ts |
| `as any` in tui.ts:29 | SolidJS Component<> typing | Low | tui.ts |
| Empty catch L181 | Replace with `catch (e) { console.error(...) }` | Low | model-tester.ts |
| Config caching | Inline LRU cache (Map + timestamps) | Med | config.ts, config.test.ts |
| Sequential findConfigFiles | Promise.all wrapper | Low | config.ts |
| Failing agentSystem tests | Update imports to non-deprecated | Low | agentSystem.test.ts |
| Duplicate test code | Delete duplicate `it` blocks | Low | schema.test.ts |

### Architecture Options (6 dimensions)

| Dimension | Recommendation | Rationale |
|-----------|---------------|-----------|
| Config Caching | LRU in config.ts | Simple, 15-line change, no new deps |
| Parallelization | Promise.all wrappers | Idiomatic, minimal change |
| Type Safety | Discriminated union | Eliminates bug class, compile-time safety |
| Validation Pipeline | Keep sequential + observability | Has semantic ordering, don't break |
| Error Handling | Per-module AppError base class | Consistency without coupling |
| Service Architecture | Independent modules | Current pattern works, premature to abstract |

### Dependency Graph

```
Independent:  Fix empty catch, Fix tests, Fix dup test code
Fix cache → Fix parallel scan (cache first, then parallel reads benefit)
Fix schema/tui types → independent
Fix plugin.ts type → depends on discriminated union
```

### Recommended Implementation Order

1. Fix failing tests (green safety net)
2. Remove duplicate test code (clean base)
3. Fix empty catch (zero risk, immediate gain)
4. Fix schema.ts + tui.ts types
5. Implement config LRU cache
6. Parallelize findConfigFiles
7. Fix plugin.ts type (last, requires union type)

## Best Practices Research

**Source**: Librarian web search + GitHub code search + Context7 docs (bg_7992eb6d)

### 1. Type Safety — `as any` Alternatives

- **Recommended**: Assertion functions (`asserts val is Type`), type guards (`val is Type`), `satisfies` operator
- **References**: TypeScript 4.9+ `satisfies`, Angular deprecation patterns, VS Code custom error factory
- **Anti-patterns**: Double assertions without validation, trusting external data without guards

### 2. LRU Caching

- **Recommended**: `lru-cache` v11+ (npm) with TypeScript generics, TTL + size limits
- **Or**: Simple Map-based LRU for hot paths if avoiding dependencies
- **References**: isaacs/node-lru-cache, openclaw config caching
- **Anti-patterns**: Unbounded Maps, no TTL, not cleaning up on eviction

### 3. Promise.all Parallelization

- **Recommended**: `p-limit` for concurrency control, `Promise.allSettled` for partial success
- **Patterns**: Retry with exponential backoff, adaptive concurrency
- **References**: sindresorhus/p-limit, botpress parallel processing
- **Anti-patterns**: No concurrency limits, errors in allSettled unhandled

### 4. Error Handling

- **Recommended**: Custom error classes extending base AppError, centralized handler, error factory
- **Patterns**: `error.cause` for chaining, `toJSON()` for serialization, `Error.captureStackTrace`
- **References**: praha-inc/error-factory, misskey ClipService, KindaTechnical blog
- **Anti-patterns**: Generic `Error` throws, string error codes, swallowing without logging

### 5. Test Organization

- **Recommended**: Typed test factories, Vitest/Bun test fixtures, shared utilities
- **Patterns**: `createXFactory(defaults)` → `factory(overrides)`, data builders
- **References**: stayradiated/test-fixture-factory, vitest test.extend
- **Anti-patterns**: Inline test data duplication, `as any` in mocks, not cleaning up in afterEach

### 6. Deprecation Patterns

- **Recommended**: `@deprecated` JSDoc with `@see` alternatives, migration guides, runtime warnings
- **Patterns**: Single-warning-per-session tracking, type-level deprecation
- **References**: TypeScript JSDoc docs, Angular deprecation examples, n8n license.ts
- **Anti-patterns**: Deprecating without alternative, no migration path, sudden removal

### 7. Zod Validation

- **Recommended**: Custom error messages on schemas, `ZodError` wrapping with context preservation
- **Patterns**: `.refine()` for custom rules, `.safeParse()` for non-throwing, schema composition
- **References**: colinhacks/zod official, porto capabilities test, Custom Error Messages docs
- **Anti-patterns**: No custom messages, not handling ZodError specifically, validation without parsing

### 8. Bun Performance

- **Recommended**: `Bun.file()` for optimized I/O, `bun test` native runner, WAL mode for SQLite
- **Patterns**: Lazy-loaded file handles, concurrent test execution, native TypeScript (no transpile)
- **References**: oven-sh/bun official, Bun test runner docs, Bun file I/O docs
- **Anti-patterns**: Node fs when Bun.file available, sequential tests when parallel-safe

## Key Insights

1. **Low-hanging fruit first**: Fix tests + empty catch are 30-min fixes with zero production risk
2. **Cache before parallel**: Adding LRU cache enables safe Promise.all in findConfigFiles
3. **Discriminated union is the RIGHT fix for plugin.ts**: Not a workaround — eliminates documented bug class
4. **Keep validation sequential**: The 5-agent pipeline has semantic ordering, don't parallelize
5. **Use existing patterns**: The codebase already has strong security patterns (normalizePath, sanitizeInput) — extend rather than replace
6. **No new dependencies needed**: All fixes implementable with stdlib + existing deps (lru-cache optional)
7. **`satisfies` operator**: TypeScript 4.9+ feature that preserves literal types while validating — ideal for plugin config types
