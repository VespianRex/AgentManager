# Type Safety Improvements — Plan v2

## Objective
Eliminate `any` types and unsafe `as unknown` casts from the codebase, adding proper
interfaces and runtime validation.

## Problem Analysis (Verified Locations)

### `any` types:
- `src/plugin.ts:96` — `args: any, context: any` in tool handler
- `src/plugin.ts:242` — `input: any, output: any` in TUI command handler
- `src/config.ts:210` — `parse(raw, undefined, true) as AgentManagerDocument` — unchecked cast
- `src/config.ts:268` — `merge(base, document as unknown)` — unnecessary cast
- `src/services/model-api/opencode-client.ts:399` — `(this as unknown as { apiKey: string }).apiKey`

### `as unknown` casts:
- `src/plugin.ts:103` — `args.document as unknown` — used with Zod parse, but type can be narrowed
- `src/config.ts:268` — see above

### Root cause: OpenCode plugin types not fully defined in `@opencode-ai/plugin`
The `any` in tool handlers comes from the OpenCode framework type `Tool<...>`. The actual
args/context shape is known from the tool's input schema.

## Implementation Plan

### Phase 1: Define Missing Interfaces

- [ ] Write test: verify `AgentManagerToolArgs` interface rejects invalid input at runtime
- [ ] Create `src/types/plugin-types.ts` with:
  - `AgentManagerToolArgs` — the actual shape of args the tool receives
  - `AgentManagerToolContext` — the context object shape (with `cwd`, `homeDir`, etc.)
  - `TUICommandInput` / `TUICommandOutput` — for TUI command handler
- [ ] Export from `src/types.ts`
- [ ] Use these types in `src/plugin.ts` tool handler and TUI command handler

### Phase 2: Remove `any` from Plugin.ts

- [ ] Write test: tool handler properly types args — invalid shape fails at compile time
- [ ] Change `src/plugin.ts:96` from `args: any, context: any` to typed versions
- [ ] Change `src/plugin.ts:103` from `args.document as unknown` to direct type assertion
  or use the Zod parse result type
- [ ] Change `src/plugin.ts:242` from `input: any, output: any` to typed versions
- [ ] If OpenCode framework types are too loose, use type assertion from `unknown` (not `any`)
  with a runtime validation function: `validateToolArgs(args): AgentManagerToolArgs`
- [ ] Run `bun run build` — must compile with no errors

### Phase 3: Fix Config Type Casts

- [ ] Write test: `loadConfig` returns properly typed document (or throws `ValidationError`)
- [ ] Fix `src/config.ts:210`: remove `as AgentManagerDocument` cast; after parsing,
  call `validateAgentManagerDocument(document)` (see schema-validation plan) and return
  the validated type
- [ ] Fix `src/config.ts:268`: change `merge(base, document as unknown)` to
  `merge(base, document)` — if `merge` accepts `AgentManagerDocument`, no cast needed.
  If `merge` requires `unknown`, pass `document: AgentManagerDocument` which is already
  a subtype of `unknown`

### Phase 4: Fix API Client Cast

- [ ] Fix `src/services/model-api/opencode-client.ts:399`:
  `(this as unknown as { apiKey: string }).apiKey` — the `apiKey` field is declared
  `private` in the class. Use a proper getter method instead of bypassing with cast.
  Add `getApiKey(): string` method or make `apiKey` accessible via a protected accessor.
- [ ] Write test: verify the getter works and the cast is removed

## Verification Criteria
- [ ] Zero `any` types in `src/plugin.ts`, `src/config.ts` (excluding external lib types)
- [ ] Zero `as unknown` casts that bypass type checking
- [ ] `bun run build` succeeds with `strict: true`
- [ ] Runtime validation catches invalid tool args with descriptive errors
- [ ] All existing tests pass

## Risks
1. **OpenCode framework type changes**: If OpenCode updates its plugin types, our
   interfaces may need updating. Mitigation: keep interfaces minimal and aligned with
   actual usage.
2. **Zod parse returns `any`**: If `z.object(...).parse()` returns `any`, use
   `z.infer<typeof schema>` for the result type.
