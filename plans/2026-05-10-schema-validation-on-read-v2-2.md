# Schema Validation on Config Read — Plan v2

## Objective
Validate parsed config documents against the `AgentManagerDocument` schema on read,
not just on write, to catch corrupted configs early.

## Problem Analysis
- `src/config.ts:210` — `parse(raw, undefined, true) as AgentManagerDocument` — no validation
- `src/config.ts:232-273` — `writeJsoncFile` calls `validateAndFixDocument` but this is only
  on write path
- Corrupted configs (missing required fields, wrong types) pass through silently and cause
  runtime errors in agent discovery, TUI rendering, etc.
- `src/schema.ts` already has `validateAgentManagerDocument()` — just not called on read

## Implementation Plan

- [ ] Write failing test: load a config file with invalid structure (e.g., missing
  `agents` field, wrong type for `version`); verify `loadConfig` throws `ValidationError`
  with file path context
- [ ] Write failing test: load a config file with valid structure; verify it returns
  successfully
- [ ] Write failing test: load a config file with extra unknown fields; verify behavior
  (should pass if schema allows unknown fields, or warn)
- [ ] Modify `loadConfig` in `src/config.ts`: after `parse(raw, undefined, true)`, call
  `validateAgentManagerDocument(document)` before returning
- [ ] If validation fails, throw a `ValidationError` (from `src/error-utils.ts`) with:
  - The file path
  - The validation error details from Zod
  - A suggestion to run `agent_manager` tool with `fix` action
- [ ] Add `ValidationError` to `src/error-utils.ts` if not already present (check first)
- [ ] Modify `readJsoncFile` in `src/config.ts`: add optional `validate` parameter (default
  `true`); when `true`, call `validateAgentManagerDocument` after parsing
- [ ] Update callers of `readJsoncFile` that need raw access (e.g., backup reading) to pass
  `validate: false`
- [ ] Run existing `test/config.test.ts` — verify passes
- [ ] Run new validation tests — verify passes

## Verification Criteria
- [ ] Invalid config files are rejected with descriptive `ValidationError` on read
- [ ] Valid config files load successfully
- [ ] Error message includes file path and validation details
- [ ] Existing `loadConfig` and `readJsoncFile` callers still work
- [ ] `test/schema-validation.test.ts` passes (already exists — verify coverage)

## Risks
1. **Breaking change**: Existing corrupted configs that previously loaded (with runtime
   errors later) will now fail on load. Mitigation: this is correct behavior — fail fast
   with clear error message.
2. **Performance**: Validation adds overhead. Mitigation: schema validation is fast
   (Zod is optimized); config reads are infrequent.
3. **Partial validation**: Some fields may be optional. Mitigation: `validateAgentManagerDocument`
   already handles optional fields per the schema definition.
