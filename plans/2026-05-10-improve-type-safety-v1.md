# Improve Type Safety: Eliminate `any` Types and Strengthen Validation

## Objective

Eliminate unsafe `any` types throughout the codebase, replace with proper TypeScript types, and add runtime validation where necessary to ensure type safety at compile-time and runtime. Focus on `schema.ts`, `config.ts`, and other critical files.

## Problem Analysis

### Issues Identified

1. **`schema.ts:116`** `as unknown<...>` cast bypasses type safety
   ```typescript
   if (typeof input !== "object" || input === null) return false;
   // later: input as Record<string, unknown>
   ```
   The cast to `Record<string, unknown>` is safe but using `unknown` more precisely is better.

2. **`config.ts`**: multiple `any` usages:
   - Function parameters typed as `any`
   - Return types `any`
   - Object spreads on untyped data

3. **`agentSystem.ts`**: Likely uses `any` for agent config objects.

4. **`plugin.ts`**: `any` for tool calls or OpenCode API.

### Impact

- **Runtime errors**: `any` bypasses compile-time checks, leading to unexpected property access errors.
- **Maintainability**: Harder to refactor, understand API contracts.
- **Security**: Missing runtime validation on data from file system or user input.

### Root Causes

- JavaScript-first mindset carried over
- Complex dynamic structures (configs) that are hard to type
- Lack of strict TypeScript config (maybe `strict: true` not enabled)

## KISS & DRY Strategy

- **KISS**: Apply types gradually; focus on critical paths first (config loading, validation, plugin tool execution).
- **DRY**: Create reusable type guards and validation functions, not duplicated type assertions.

## Implementation Plan

### Phase 1: Audit & Immediate Fixes

- [ ] Run TypeScript with `--noImplicitAny` to identify all implicit `any`
- [ ] Search for explicit `any` casts (e.g., `as any`) and document locations
- [ ] Check `tsconfig.json` for strict settings; enable `strict: true` if not already (but ensure tests pass first)

### Phase 2: Core Schema Types (`src/schema.ts`)

- [ ] Define precise type for `AgentManagerDocument` and related structures (`Agent`, `Tools`, `Instructions`, etc.) in `src/types.ts` if not already
- [ ] Replace `unknown` casts with proper guard functions:
   ```typescript
   function isPlainObject(value: unknown): value is Record<string, unknown> {
     return typeof value === "object" && value !== null && !Array.isArray(value);
   }
   ```
- [ ] Update `hasCircularReference` to use `isPlainObject` guard instead of `typeof input !== "object"`.
- [ ] Replace `input as Record<string, unknown>` with safe access using guard.
- [ ] Use `Object.getOwnPropertyNames` only on objects (already guarded).

### Phase 3: Config Loading (`src/config.ts`)

- [ ] Define `RawConfig` type (partial, maybe with unknown extras) for parsed JSONC.
- [ ] Define `ValidatedConfig` type that corresponds to schema.
- [ ] Replace `any` parameters in `readConfig`, `writeConfig`, `findConfigFiles` with specific types (`ConfigPathOptions`, etc.).
- [ ] Add runtime validation after `commentJson.parse` using `validateAgentManagerDocument` to ensure parsed config matches schema. If validation fails, throw descriptive error with location info.
- [ ] Ensure `backupConfig` uses typed paths.

### Phase 4: Plugin Tool Handlers (`src/plugin.ts`)

- [ ] Define proper types for tool parameters and return values based on OpenCode API.
- [ ] Replace `any` in tool callbacks with inferred types from `createTool` definition.
- [ ] Ensure `execute` function signature matches expected `ToolCall` type.

### Phase 5: Utilities (`src/utils/*` if any)

- [ ] Audit remaining files for `any` usage
- [ ] Replace with generic types or specific interfaces

### Phase 6: Validation Enhancements

- [ ] Add `zod` or `io-ts`? Keep simple: Use existing schema validation plus additional runtime checks where needed.
- [ ] Add type guard functions for:
   - `isAgent(obj)`
   - `isToolSet(obj)`
   - `isInstructions(obj)`
- [ ] Use these guards in config loading before merging.

## Testing Strategy

- [ ] After each type change, run `bun test` to catch regressions.
- [ ] Add tests that attempt to load invalid config (wrong types) to verify validation catches them.
- [ ] Ensure existing tests still pass.

## Risks & Mitigations

1. **Breaking existing code**: Changing types may reveal existing implicit `any` usages that previously compiled by accident.
   - Mitigation: Enable `strict` gradually; fix errors as they appear; use `// @ts-expect-error` temporarily with TODO.

2. **Overhead of strict typing**: May require writing many type definitions.
   - Mitigation: Leverage existing schema definitions; use TypeScript's `satisfies` operator to infer types from schema.

3. **Third-party types**: Some libraries may have missing types.
   - Mitigation: Use `@types/*` packages; fallback to `any` only as last resort, but flag with `// TODO: replace any`.

## Alternative Approaches

1. **Use Zod for schema + runtime validation**: Could replace manual validation with Zod schemas that produce TypeScript types. This aligns with TDD: define schema, tests, then implementation. However, would add dependency. Probably overkill; current JSON schema approach fine.

2. **Leave `any` as is**: Not acceptable for robustness.

## Success Criteria

- Zero `any` types in codebase (except in test fixtures if absolutely needed)
- All TypeScript strict flags enabled
- All tests pass
- Runtime validation fails fast on invalid config
