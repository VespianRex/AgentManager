# TUI Async & Error Handling Fixes — Plan v2

## Objective
Fix unhandled promise rejections, missing `await` calls, and `console.error` usage
in the TUI JSX plugin.

## Problem Analysis (Verified Locations in `.opencode/tui/agent-manager.jsx`)

### Missing `await` / fire-and-forget async:
- **Line 478**: `reloadAgents()` — called without `await`; toast shows before reload completes
- **Line 468**: `showFallbackManager(...)` — async function called without `await`
- **Line 449**: `editModel(...)` — inside try/catch but function is async; not awaited
- **Line 483**: `testAgentModel(...)` — async function called without `await`

### Unhandled promise:
- **Line 493**: `loadPrefs().then(async (prefs) => { ... })` — no `.catch()` handler

### Direct `console.error`:
- **Line 12**: `console.error('Unhandled promise rejection:', ...)` — in process handler
- **Line 18**: `console.error('Uncaught exception:', ...)` — in process handler
- **Line 458**: `console.error("editModel error:", e)` — in catch block
- **Line 1505**: `console.error("showAgentManager error:", e)` — in catch block

### Sequential awaits in loop:
- **Lines 285-286**: Each iteration awaits `getHealthRegistry()` and `modelHealthBadge()`
  sequentially; these are independent and could be parallelized with `Promise.all`

## Implementation Plan

### Phase 1: Fix fire-and-forget async calls

- [ ] Write test: verify `reloadAgents` is called with `await` (or `.catch()`) — no
  unhandled rejection possible
- [ ] Fix line 478: add `await reloadAgents()` or `reloadAgents().catch(e => { ... })`
- [ ] Fix line 468: add `await showFallbackManager(...)` or `.catch()`
- [ ] Fix line 449: add `await editModel(...)` (already in try/catch, just needs await)
- [ ] Fix line 483: add `await testAgentModel(...)` or `.catch()`

### Phase 2: Fix unhandled promise chain

- [ ] Fix line 493: add `.catch(e => { api.ui.toast({ variant: "error", message: ... }) })`
  to the `loadPrefs().then(...)` chain

### Phase 3: Replace `console.error` with safe logging

- [ ] Fix line 12: keep `console.error` (process-level handler — acceptable, but wrap
  in try/catch for safety)
- [ ] Fix line 18: same as line 12
- [ ] Fix line 458: replace `console.error("editModel error:", e)` with
  `safeLogError("editModel error:", e)` — import from `../../dist/error-utils.js`
- [ ] Fix line 1505: same replacement with `safeLogError`

### Phase 4: Parallelize sequential async calls

- [ ] Write test: verify badge loading completes within reasonable time
- [ ] Refactor lines 285-286 to use `Promise.all()` for independent badge lookups
  when iterating over agents

## Verification Criteria
- [ ] No async function called without `await` or `.catch()`
- [ ] No unhandled promise rejections
- [ ] No direct `console.error`/`console.warn` except in process-level handlers
  (where `safeLogError` may not be available)
- [ ] Badge loading uses parallel execution where possible
- [ ] All existing tests pass

## Risks
1. **SolidJS reactivity**: Adding `await` inside SolidJS event handlers may affect
   reactivity. Mitigation: these are user-action handlers, not reactive computations;
   `await` is fine.
2. **TUI import path**: Importing from `../../dist/error-utils.js` requires built dist.
   Mitigation: TUI plugin always requires built dist (already imports from dist).
