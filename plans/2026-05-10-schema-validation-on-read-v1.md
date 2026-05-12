# Add Schema Validation on Config Read

## Objective

Ensure that all configuration documents loaded from disk are validated against the `AgentManagerDocument` schema, rejecting malformed or invalid configs early to prevent runtime errors and undefined behavior.

## Problem Analysis

### Current Behavior

`src/config.ts:readJsoncFile` (lines 193-219):
```typescript
const document = parse(raw, undefined, true) as AgentManagerDocument;
```
- Parses JSONC with `comment-json`.
- Casts directly to `AgentManagerDocument` without runtime validation.
- Potential issues: missing required fields, wrong types (e.g., `agents` not an object), unexpected values that later code assumes.
- Validation occurs only when saving via `validateAgentManagerDocument` (used in `validatePartialAgentManagerDocument` maybe). But reading raw file bypasses validation.

### Risks

- Corrupted config file (e.g., manual edit error) leads to runtime exceptions when accessing properties (e.g., `document.agents` is string instead of object).
- Inconsistent state across runs.
- Security: Malformed config might bypass security checks.

### Desired Behavior

- Upon reading any config file, validate the parsed document against the schema.
- If validation fails, throw a `ValidationError` with details about which fields are missing or invalid.
- Cache the validated document.

## Implementation Plan

- [ ] **Step 1**: Use the existing `validateAgentManagerDocument` function from `src/schema.ts` (originally for full document validation). This function likely performs comprehensive checks.
- [ ] **Step 2**: In `readJsoncFile`, after `parse`, call `validateAgentManagerDocument(document)`. It may throw `Error` with message. We should catch and re-throw a `ValidationError` with clear context (file path).
- [ ] **Step 3**: Ensure `validateAgentManagerDocument` is strict: it should check required fields (`agents`, `categories` maybe optional? Actually schema: `AgentManagerDocument` may have optional? Need to review. But we'll rely on existing validation logic; if missing, enhance.
- [ ] **Step 4**: Update type of `document` in cache to be the validated type.
- [ ] **Step 5**: Add tests:
  - Test that `readJsoncFile` with a config missing required fields (e.g., no `agents`) throws `ValidationError`.
  - Test with wrong types (e.g., `agents: "not an object"`).
  - Test with valid config passes.
  - Test that after fixing invalid file and rewriting, it loads.
- [ ] **Step 6**: Ensure existing tests still pass; they may rely on partially invalid configs? Likely they use valid configs.

### Additional Consideration: Partial Merges in `writeJsoncFile`

`writeJsoncFile` merges new document into base using `merge` function. It should also validate final merged document before writing? Already `saveConfig` validates document before calling `writeJsoncFile`? Let's check:

`saveConfig`:
```typescript
if (!isPlainObject(document)) throw new Error("Document must be an object");
const backupPath = await backupConfig(config.path);
await writeJsoncFile(config.path, document);
```
It checks document is plain object but not full schema. However, `writeJsoncFile` merges with base then `stringify`. The merger does not validate. The final file may be invalid if `document` missing required fields but base provided them? Actually merge combines, so if base had `agents` and document has other fields, `agents` remains. So final file should be valid if base valid. But if base is missing and document missing, then final file invalid. That's okay; we should probably validate the final merged document before writing to catch errors. But that's a separate bug: we should call `validateAgentManagerDocument` on the `merged` result before writing.

Let's add to plan:

- [ ] **Step 7**: In `writeJsoncFile`, after `const merged = merge(...)`, call `validateAgentManagerDocument(merged)` before writing. This ensures we never write invalid config. If validation fails, throw `ValidationError` and avoid overwriting the file. The backup may already have been taken? Save ordering: `backupConfig` is called in `saveConfig` before `writeJsoncFile`. So backup of previous (valid) file exists. Good.

Thus we'll add validation before write as well.

## Testing

- Write test for `writeJsoncFile`: given base valid config, document with only a partial update, the merged result should be valid.
- Test that writing an invalid document (e.g., missing required fields and base invalid) throws and does not modify file.

## Risks

- Validation may be too strict and reject configs that were previously accepted (e.g., missing optional fields). Ensure schema correctly identifies optional vs required.
- Might increase startup time as validation runs on every read. But configs are small; acceptable.

## Success Criteria

- All config reads produce validated documents.
- Invalid configs are rejected with clear error messages.
- All tests pass.

## References

- `src/schema.ts`: Contains `validateAgentManagerDocument` and `AgentManagerDocument` type.
