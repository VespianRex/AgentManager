# Fix TUI Architecture Duplication

## Objective

Eliminate the 762-line duplication in `.opencode/tui/agent-manager.jsx` by creating a dedicated TUI API module (`src/tui-api.ts`) that exports all needed functions with TUI-friendly signatures. This follows DRY principle and reduces maintenance burden.

## Background

**Problem**: TUI JSX file duplicates logic from:
- `src/config.ts` (config discovery, load, save)
- `src/tui-helpers.ts` (mergeWithDefaults, modelBadge, shortenModel, etc.)
- Maintains separate state management without TypeScript

**Why This Happened**: TUI plugins in OpenCode require JSX compilation separate from server plugin. The dist/ output doesn't include helper modules needed by TUI.

**Solution**: Create `src/tui-api.ts` as a facade that:
1. Re-exports selected functions from existing modules with TUI-appropriate signatures
2. Provides any TUI-specific utility functions needed
3. Compiles to `dist/tui-api.js` for JSX import
4. Maintains single source of truth in original modules

## Implementation Plan

- [ ] **Step 1**: Analyze `.opencode/tui/agent-manager.jsx` to catalog all imported functions and dependencies
  - Read the JSX file completely
  - List all imports from `../../dist/tui-api.js`, `../../dist/config.js`, `../../dist/types.js`
  - Identify which are from existing src modules vs TUI-specific

- [ ] **Step 2**: Create `src/tui-api.ts` with proper exports
  - Import from existing modules: `config.ts`, `tui-helpers.ts`, `types.ts`, `agent-metadata.ts`, `health-registry.ts`
  - Re-export needed functions with same signatures (no adaptation needed if types are compatible)
  - Add TUI-specific helpers currently inline in JSX (e.g., `getHealthRegistry` singleton, `loadPrefs/savePrefs`, `modelHealthBadge`, `buildModelOptions`, `getRoleCode` if used)
  - Ensure all exports are type-safe and have JSDoc

- [ ] **Step 3**: Update imports in `.opencode/tui/agent-manager.jsx`
  - Replace `../../dist/config.js` imports with `../../dist/tui-api.js` where applicable
  - Replace `../../dist/types.js` with `../../dist/tui-api.js`
  - Remove duplicate implementations:
    - Delete `getHealthRegistry` (lines ~53-59)
    - Delete `loadPrefs/savePrefs` (lines ~74-95)
    - Delete `modelHealthBadge` (lines ~101-112) and `getHealthIconFromStatus` (lines ~115-122)
    - Delete `extractModelInfo` and `buildModelOptions` (lines ~124-153)
    - Delete any other helper functions that moved to tui-api

- [ ] **Step 4**: Verify `tui-api.ts` compiles correctly
  - Run `bun run build`
  - Ensure `dist/tui-api.js` is generated
  - Check for TypeScript errors (run `bun run tsc --noEmit`)

- [ ] **Step 5**: Test TUI functionality manually
  - Open OpenCode TUI
  - Run `/agent-manager` command
  - Verify all features work: config inspection, model selection, health display, preferences
  - Check console for errors

- [ ] **Step 6**: Add unit tests for new `tui-api.ts` exports
  - Create `test/tui-api.test.ts` if not existing
  - Test each exported function with edge cases
  - Ensure 100% coverage of new module

- [ ] **Step 7**: Update documentation
  - Update `AGENTS.md` to document TUI API module
  - Note that JSX now imports from tui-api
  - Document TUI-specific utilities in tui-api.ts JSDoc

## Verification Criteria

- [ ] `dist/tui-api.js` exists after build
- [ ] `.opencode/tui/agent-manager.jsx` imports ONLY from `../../dist/tui-api.js` for helper functions (no direct config/types imports)
- [ ] No duplicate function definitions in JSX that exist in tui-api
- [ ] All TypeScript compilation warnings/errors resolved
- [ ] Manual TUI smoke test passes (command executes, displays config, no JS errors)
- [ ] Unit tests for tui-api.ts pass with >90% coverage

## Potential Risks and Mitigations

1. **Risk**: TUI API functions have side effects or dependencies incompatible with SolidJS reactivity.
   **Mitigation**: Ensure functions are pure or clearly document stateful ones (like `getHealthRegistry`). Keep singleton initialization lazy.

2. **Risk**: Type mismatches between JSX (using CommonJS-style dist) and tui-api exports.
   **Mitigation**: Use `export const` named exports (no default). Verify build output uses `exports.NAME =` format.

3. **Risk**: Breaking existing TUI behavior during refactor.
   **Mitigation**: Extensive manual testing; keep old code as fallback if needed; use version control to bisect.

4. **Risk**: HealthRegistry singleton initialization race condition.
   **Mitigation**: Already uses promise-caching pattern; preserve this exactly in tui-api.

## Alternative Approaches

1. **Alternative**: Convert entire TUI to use `@opentui/solid` components and import directly from src using Bun's ESM loader.
   **Trade-offs**: Would require OpenCode to support direct TS loading in TUI (unlikely). More complex, higher risk. Not chosen because dist compilation is required.

2. **Alternative**: Keep duplicated code but extract to shared JS file both JSX and server import.
   **Trade-offs**: Still requires JS file (not TS) for dist compatibility. Loses type safety. Duplication would be reduced but not eliminated. Chosen approach (tui-api.ts) is cleaner.

3. **Alternative**: Move all config logic to `config.ts` and make it both server and TUI compatible via feature flags.
   **Trade-offs**: Would pollute server code with TUI concerns. Violates separation of concerns. Not recommended.
