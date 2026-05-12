# Improve Type Safety and Schema Validation

## Objective

Eliminate `any` types and `as unknown` assertions, add proper runtime validation on config load, and ensure complete type coverage throughout the codebase.

## Current State

**Issues Identified**:
1. `plugin.ts:96`: `execute(args: any, context: any)` - should be strongly typed
2. `plugin.ts:103`: `args.document as unknown` - unnecessary assertion after validation
3. `plugin.ts:109`: `validateAgentManagerDocument(document)` expects `unknown`, but `document` is typed as `any` from args
4. `subagent.ts`: Repeated `as unknown as` casts in tests
5. No validation on `loadConfig` - malformed JSON loads fine but fails on save

**Type Coverage**: `tsconfig.json` has `"strict": true` which is good. But runtime validation is missing.

## Implementation Plan

### Phase 1: Define Tool Argument Types

- [ ] **Step 1.1**: Define `AgentManagerToolArguments` interface in `src/types.ts`
```typescript
export interface AgentManagerToolArguments {
  configPath?: string;
  action?: 'inspect' | 'save' | 'benchmark';
  document?: unknown;  // Will be validated
  configs?: BenchmarkConfig[];
  timeoutMs?: number;
}
```

- [ ] **Step 1.2**: Update `plugin.ts:96` signature
```typescript
async execute(args: AgentManagerToolArguments, context: any) { ... }
```
Note: `context` can remain `any` unless we need OpenCode context typing (out of scope).

- [ ] **Step 1.3**: Remove `as any` casts in `plugin.ts`
  - Line 97: `args.configPath as string | undefined` → use `args.configPath` directly (already string | undefined)
  - Line 103: `args.document as unknown` → remove cast; it's already `unknown`
  - Line 131: `args.configs` - add type check

- [ ] **Step 1.4**: Add runtime type guard for BenchmarkConfig array
  - Use `validateBenchmarkConfigs` already present at line 132
  - Ensure it returns `null` on success or error string

### Phase 2: Config Load Validation

- [ ] **Step 2.1**: Add validation option to `loadConfig`
  - Extend `loadConfig` to call `validateAgentManagerDocument` after parsing
  - Add parameter `validate = false` to maintain backward compatibility
  - But: validation already happens in plugin's `inspect` flow via `summarizeConfig`? Not exactly.

**Current Flow**:
- `inspectTarget` calls `loadConfig(target)` → returns `document`
- Then passes to `runSubAgentPipeline` which expects `AgentManagerDocument`
- `runSubAgentPipeline` internally uses `getConfigRecord(context.config)` which does `isPlainObject(config) ? config : {}`
- So invalid documents are tolerated but may produce weird results.

**Improvement**: Validate on load and throw clear error OR tolerate leniently and validate in subagent.

Better approach: Keep `loadConfig` lenient (doesn't throw), but add an optional `validate` flag that plugin can set. Since plugin is the main consumer, have it validate after loading.

- [ ] **Step 2.2**: Add validation in plugin's `inspectTarget`
```typescript
const { config, document } = await loadConfig(target);
const validatedDocument = validateAgentManagerDocument(document); // throws if invalid
const summary = summarizeConfig(config, validatedDocument);
```
But wait: `loadConfig` returns `{ config, document }`. The `config` is the location. The `document` is the parsed content. So:

```typescript
const { document } = await loadConfig(target);
const validatedDocument = validateAgentManagerDocument(document);
const summary = summarizeConfig(target, validatedDocument); // note: summary uses config (location) + document
```

Actually `summarizeConfig` signature: `(config: ConfigLocation, document: AgentManagerDocument)`. So we pass `target` and `validatedDocument`.

- [ ] **Step 2.3**: Update error handling in plugin
  - Catch validation errors and return user-friendly message
  - Include error details with `errorWithCause` already used in schema

- [ ] **Step 2.4**: Add tests for validation on load
  - Create test with malformed agent config
  - Verify `loadConfig` with validation throws Zod error
  - Verify plugin's `agent_manager` tool returns error message

### Phase 3: Complete Type Guard Extraction

- [ ] **Step 3.1**: Create `src/type-guards.ts` with reusable guards:
```typescript
export function isStringArray(value: unknown): value is string[] { ... }
export function isNonEmptyString(value: unknown): value is string { ... }
export function isRecord(value: unknown): value is Record<string, unknown> { ... }
```

- [ ] **Step 3.2**: Refactor `subagent.ts` to use these guards
  - Replace `readStringArrayField` with `isStringArray` + length checks
  - Actually `readStringArrayField` does both type check and filter - keep as helper but use new guards internally
  - Extract `isPlainObject` already exists in types.ts; use it consistently

- [ ] **Step 3.3**: Add tests for type guards in `test/type-guards.test.ts`

### Phase 4: Validate AgentConfig Completely

- [ ] **Step 4.1**: Extend `validateAgentConfig` to check `fallback`, `fallback_models`, `fallbacks` types
  - Currently only checks `model` is non-empty string and `fallback` is array
  - Should also validate:
    - `fallback` (if present) is string (singular fallback agent name)
    - `fallback_models` (if present) is array of strings
    - `fallbacks` (if present) is array of strings
  - Update schema in `schema.ts` if needed (AgentConfigSchema already has these)

Actually `AgentConfigSchema` already defines these as optional with correct types. The `validateAgentConfig` function is used separately? Let's check usage.

`validateAgentConfig` is used in `plugin.ts:114` for each agent in the document during save. It also uses `AgentConfigSchema.parse` internally? No, it's a separate simple validator that returns `{valid, error, path}`. It's used for inline validation before save. We should either:

- Use Zod validation exclusively (call `AgentConfigSchema.parse`) and catch errors, OR
- Enhance `validateAgentConfig` to be consistent with Zod schema.

Better: Since we already have `AgentConfigSchema`, just use that. But `validateAgentConfig` returns a result object, not throwing.

Option: Replace `validateAgentConfig` with a wrapper around `AgentConfigSchema.safeParse`. That would be DRY.

- [ ] **Step 4.2**: Refactor `validateAgentConfig` to use Zod safeParse
```typescript
export function validateAgentConfig(
  config: unknown,
  agentKey = 'unknown'
): ValidationResult {
  const result = AgentConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true };
  } else {
    const error = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { valid: false, error, path: result.error.issues[0]?.path?.[0]?.toString() };
  }
}
```

But careful: `AgentConfigSchema` allows unknown keys via `.passthrough()`. That's fine. It validates known fields.

- [ ] **Step 4.3**: Remove old validation logic (hand-rolled checks) if replaced

### Phase 5: Add Tests for New Validation

- [ ] **Step 5.1**: Test `validateAgentConfig` with invalid types
- [ ] **Step 5.2**: Test plugin save action with invalid document returns proper error
- [ ] **Step 5.3**: Test that loadConfig with validation (when implemented) throws on invalid data
- [ ] **Step 5.4**: Ensure all type guard tests pass

## Verification Criteria

- [ ] No `any` types in source files (`src/*.ts`) except in test files where `vi.fn()` etc require it
- [ ] No `as unknown` assertions in production code
- [ ] `plugin.ts` compiles with `--noEmit` without warnings
- [ ] All type guard tests pass
- [ ] `bun test` includes new validation tests and they pass
- [ ] Plugin's `agent_manager` tool returns clear error when given invalid config

## Potential Risks and Mitigations

1. **Risk**: Strict validation on load breaks backward compatibility with existing configs that have extra fields not in schema.
   **Mitigation**: Use `.passthrough()` in schemas (already done) to allow unknown keys. Validation only checks known fields.

2. **Risk**: Changing `validateAgentConfig` to use Zod might produce different error messages.
   **Mitigation**: Keep error format consistent or update tests accordingly. Focus on correctness over message preservation.

3. **Risk**: Adding validation to `loadConfig` might cause regressions if some callers expect lenient loading.
   **Mitigation**: Make validation opt-in (parameter) and only enable in plugin where needed.

## Alternative Approaches

1. **Alternative**: Keep hand-rolled `validateAgentConfig` but extend it to cover all fields.
   **Trade-offs**: Duplicates Zod schema logic → worse maintenance. We favor using Zod as single source of truth.

2. **Alternative**: Use TypeScript's `satisfies` operator to infer types without explicit `as`.
   **Trade-offs**: Not always possible when input is `unknown`. Still need runtime validation. Secondary.
