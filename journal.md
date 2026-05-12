# Agent Manager Journal

**Extracted from Qwen CLI sessions** — `fix/plugin-tool-api-node16` branch

---

## Session: ses_26a96 (April 16, 2026)

### Fix: Model Selection Not Saving

**Bug**: Selecting a model in the picker appeared to work (toast showed success) but the model reverted to its previous value after navigation.

**Root Cause**: Models were saved with just the model name (e.g., `"claude-opus-4-5"`) instead of the full `{provider}/{model}` format (e.g., `"anthropic/claude-opus-4-5"`) that OpenCode config expects.

**Evidence**: Config examples show model format as `"provider/model-id"`:
```json
"model": "anthropic/claude-opus-4-5"
"model": "nvidia/stepfun-ai/step-3.5-flash"
```

**Code Flow (broken)**:
```javascript
// showModelsForProvider - line 373
value: { model: modelName, provider: pid }  // stores both but...

// showAllModels - onSelect
saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, model: item.value.model }, returnIndex);
// item.value.model is just "claude-opus-4-5", NOT "anthropic/claude-opus-4-5"
```

**Fix Applied**:
```javascript
// showModelsForProvider and showAllModels onSelect callbacks
const fullModelId = `${item.value.provider}/${item.value.model}`;
saveAgentConfig(api, loadedConfigs, agentKey, { ...agent, model: fullModelId }, returnIndex);
```

**Files Modified**:
- `.opencode/tui/agent-manager.jsx` — `reloadAgents()` now calls `api.client.instance.dispose({})`
- `test/tui-dialog-transitions.test.ts` — Fixed inverted assertions (check for ABSENCE of `dialog.clear()`)

**Tests**: 57 pass, 3 pre-existing failures (install/entrypoint infrastructure tests)

---

### Refactor: DRY Model Option Building + Full ID Fix

**Issue**: Multiple functions (`showModelsForProvider`, `showAllModels`, `showAddFallback`, `showEditFallback`) duplicated provider/model iteration and incorrectly saved model IDs.

**Unified Solution**:

1. Added `extractModelInfo(model)` — returns `{ id, displayName }` from model object, preferring `model.id` for API ID and `model.name` for human display.

2. Added `buildModelOptions(providers, currentFullModelId?)` — centralizes option creation:
   - `title`: displayName (human-readable)
   - `value`: `{ model: id, provider: pid }` (saves correct API ID)
   - `footer`: "current" when `fullModelId = pid/id` matches `currentFullModelId`

3. Updated all model pickers to use this helper:
   - `showModelsForProvider()` — main model edit (per-provider)
   - `showAllModels()` — main model edit (all providers)
   - `showAddFallback()` — add fallback
   - `showEditFallback()` — edit existing fallback

4. Fixed **all** save paths to construct full model IDs: `${provider}/${model}`:
   - Main model: already fixed in previous step
   - Fallback selection: fixed `showAddFallback` and `showEditFallback` onSelect to use full ID
   - Custom fallback input: already uses raw user input (assumed full ID)

**Impact**:
- ✅ Single source of truth for option building
- ✅ Consistent model ID extraction everywhere
- ✅ Proper full ID format saved in both `agents[].model` and `agents[].fallback_models[]`
- ✅ Eliminated copy-paste bugs that caused the "wrong format" issue

**Files Modified**:
- `.opencode/tui/agent-manager.jsx` — added helpers, replaced all model option loops

---

### Fix: Wrong Model ID Format Saved

**Bug**: Model picker saved `model.name` (display name like `"GLM-5 (NVIDIA) - DEPRECATED use glm-5.1"`) instead of `model.id` (actual API ID like `"z-ai/glm5"`).

**Symptom**: OpenCode showed wrong model info like `"Sisyphus - Ultraworker Step 3.5 Flash (NVIDIA)"` even after selecting GLM-5.

**Root Cause**: In `showModelsForProvider()` and `showAllModels()`, the code used:
```javascript
const modelName = model.name || model.id || "unknown";
options.push({ title: modelName, value: { model: modelName, provider: pid } });
```

This saved the human-readable `model.name` (e.g., `"GLM-5 (NVIDIA) - DEPRECATED use glm-5.1"`) instead of the API-compatible `model.id` (e.g., `"z-ai/glm5"`).

**Fix**: Separate display name from saved ID:
```javascript
const modelId = model.id || model.name || "unknown";
const modelDisplayName = model.name || model.id || "unknown";
options.push({
  title: modelDisplayName,       // Show readable name
  value: { model: modelId, provider: pid }  // Save API ID
});
```

**Files Modified**:
- `.opencode/tui/agent-manager.jsx` — `showModelsForProvider()` and `showAllModels()`

**Note**: The display name "Sisyphus - Ultraworker" is intentionally hardcoded in `oh-my-opencode/src/shared/agent-display-names.ts`. This is the agent's role description, not the model. The model name shown after it (e.g., "Step 3.5 Flash") comes from the `model` field in config.

---

### Fix: Changes Not Reflecting in OpenCode Runtime

**Bug**: Model selections save to file correctly, toast shows success, but OpenCode doesn't use the new model when running tasks.

**Root Cause**: `api.client.app.agents({})` is a **read-only getter** that returns the server's cached agent list. It does NOT trigger a config reload from disk.

**Evidence from SDK research**:
- `client.app.agents()` → `GET /agent` — returns cached in-memory agents
- `client.instance.dispose()` → `POST /instance/dispose` — calls `Config.global.reset()` + `Instance.disposeAll()`
- The `/reload` slash command internally calls `Instance.dispose()` to trigger reload

**Architecture**:
```
OpenCode Startup
    ↓
loadPluginConfig() reads oh-my-opencode.json
    ↓
Plugin's config handler returns agent definitions
    ↓
Server caches agents in memory
    ↓
[File change] ← Server has no watcher for plugin config!
    ↓
client.app.agents() → Returns cached data, NOT re-reading file
```

**Fix Applied** — change `reloadAgents()` from:
```javascript
// WRONG - just fetches cached agents
await api.client.app.agents({});
```

To:
```javascript
// CORRECT - triggers full config reload via instance dispose
await api.client.instance.dispose({});
```

**Files Modified**:
- `.opencode/tui/agent-manager.jsx` — `reloadAgents()` now calls `api.client.instance.dispose({})`

**Trade-offs**:
- `instance.dispose()` is a heavier operation (full reload)
- But it's the same mechanism as `/reload` slash command
- Alternative: Could use `api.command.trigger("/reload")` for user-triggered reload

---

## Session: db678dc0 (April 15, 2026)

### Fix: Enter Key Closes Dialog Instead of Triggering Action

**Bug**: Pressing Enter on "Model: ..." or "Add new fallback" exits the command palette entirely instead of showing the model picker.

**Root Cause**: `api.ui.dialog.clear()` in `onSelect` callbacks was clearing the ENTIRE dialog system before the next dialog function (`editModel()`, `showFallbackManager()`) could render.

**Code Flow (broken)**:
```javascript
// showAgentDetail.jsx - onSelect callback
onSelect={(item) => {
  api.ui.dialog.clear(); // ← This closes EVERYTHING
  const { action } = item.value;
  if (action === "editModel") {
    editModel(...); // ← This never renders because dialog is gone
  }
}}
```

**Fix Applied** (via Qwen CLI session db678dc0):
1. Removed `api.ui.dialog.clear()` from `showAgentDetail()` onSelect callback (line 268)
2. Removed `api.ui.dialog.clear()` from `showFallbackManager()` onSelect callback (line 416)
3. Let `editModel()`, `showFallbackManager()`, etc. use `api.ui.dialog.replace()` internally without preceding `clear()`

**Test Added**: `test/tui-dialog-transitions.test.ts`
- Parses `.opencode/tui/agent-manager.jsx` as source
- Validates no `dialog.clear()` exists immediately before navigation in onSelect callbacks
- Uses regex to find onSelect handler blocks and check for the anti-pattern

**Files Modified**:
- `.opencode/tui/agent-manager.jsx` — removed 2 `api.ui.dialog.clear()` calls
- `test/tui-dialog-transitions.test.ts` — new test file (201 lines)

---

## Session: b6bb35aa (April 14, 2026) — Knowledge Extraction

### Project Overview
OpenCode Agent Manager plugin — inspect, explain, and modify OpenCode agent settings. Supports Oh My OpenCode and generic configs via JSONC.

### Architecture (from session)
```
src/
├── index.ts       — exports { AgentManagerPlugin as server }
├── plugin.ts      — agent_manager tool + tui.command.execute hook
├── config.ts      — Config discovery, JSONC support, multi-location
├── agentSystem.ts — Agent roles, fallback chains, orchestration
├── subagent.ts    — 5-agent validation pipeline
├── types.ts       — TypeScript interfaces
└── tui.ts         — TUI stub (registers command palette entry)

dist/              — Built JS output
cli/               — Standalone Bun CLI
```

### Critical OpenCode Plugin Loading Rules (from session)
1. **Server auto-discovers** from `{plugin,plugins}/*.{ts,js}` non-recursively
2. **TUI does NOT auto-discover** — needs explicit `plugin` array in `~/.config/opencode/tui.json`
3. **Plugin default export MUST contain EITHER `server()` OR `tui()`, NEVER both**
4. **OpenCode v1.4.3 Bug #18094**: Loader silently stops after certain plugins (workaround: alphabetical ordering)
5. **TUI uses SolidJS** (not React) — requires `@opentui/solid/runtime-plugin-support`

### Mistakes Documented in Qwen Session

| # | Mistake | Fix |
|---|---------|-----|
| 1 | Stale global copy (`~/.config/opencode/plugins/agent-manager/` was real dir, not symlink) | Replaced with symlink |
| 2 | Non-plugin modules loaded (`config.js`, `agentSystem.js` picked up by scanner) | Renamed to `_agent-manager/` |
| 3 | oh-my-opencode TUI crash (`dist/index.js` had manual `export { tui }`) | Removed tui export, rebuilt |
| 4 | Rebuild overwrites manual fixes | Need post-build script |
| 5 | TUI plugin crashes server (TUI-only file in plugins dir auto-discovered) | Moved to `.opencode/tui/` |
| 6 | "Path plugin must export id" (TUI plugin missing `id` field) | Added `id: "agent-manager"` |
| 7 | TUI not discovering plugins | Created explicit `~/.config/opencode/tui.json` |
| 8 | JSX runtime errors (TUI uses SolidJS, not React) | Added `@opentui/solid/runtime-plugin-support` |

### Previous Unresolved Issue (pre-April 15)
- **DialogSelect options not selectable** — Multiple API patterns tried (`options`/`onSelect`, per-option vs top-level callbacks). PluginManager uses `rows`/`value`/`onValueChange` internally — may be correct pattern.
- **Status**: ✅ FIXED in session db678dc0 (the Enter key fix removed the `dialog.clear()` anti-pattern which was also causing selection issues)

### Working at Session End (April 14)
- ✅ `agent_manager` tool registered and callable
- ✅ `tui.command.execute` hook registered
- ✅ "Agent Manager" appears in command palette (Ctrl+P)
- ✅ DialogSelect shows with options
- ❌ Options cannot be selected / do nothing when clicked
- **Status (April 15)**: ✅ FIXED — `dialog.clear()` removal in onSelect resolved both Enter key and selection issues

---

## Session: 525d890b / ca5a081d (April 14)
Tiny sessions — just "login" and "logout" commands (rate limited, no content).

---

## Current TUI File State (after fixes)

**`.opencode/tui/agent-manager.jsx`** — 663 lines

Key dialog functions:
- `showAgentList()` — Main agent selector
- `showAgentDetail()` — Agent detail view with actions
- `showFallbackManager()` — Manage fallback chains
- `editModel()` — Change model for an agent
- `showAddFallback()` / `showEditFallback()` — Add/edit fallbacks

**Pattern**: Each function calls `api.ui.dialog.replace(() => (...))` internally — NO preceding `dialog.clear()`.

---

## File Locations
- TUI Plugin: `.opencode/tui/agent-manager.jsx`
- Server Plugin: `src/plugin.ts`
- Global Config: `~/.config/opencode/config.json`
- TUI Config: `~/.config/opencode/tui.json`
- Test: `test/tui-dialog-transitions.test.ts`

---

## Test Commands
```bash
bun run build        # tsc → dist/
bun run deploy-plugin # rsync dist/ → .opencode/plugins/
bun test             # Full suite (~48 tests)
bun test test/tui-smoke.test.ts test/tui-helpers.test.ts  # Core TUI tests
bun test test/tui-dialog-transitions.test.ts  # Dialog transition safety
```

---

## Deep Dive: DRY Violations Analysis

**Scanned**: All `src/` TypeScript files and test suite. Found 7 major DRY violations with concrete refactor opportunities.

---

### 1. Agent Metadata Duplication (CRITICAL)

**The Problem**: Two separate files maintain nearly identical agent definitions with divergent data.

| Location | Content | Size |
|----------|---------|------|
| `src/agentSystem.ts` | `OH_MY_OPENCODE_AGENTS` (8 agents) + `DEFAULT_FALLBACK_CHAINS` | 80 LOC |
| `src/tui-helpers.ts` | `DEFAULT_AGENTS` (16 agents) + `DEFAULT_FALLBACKS` | 134 LOC |

**Overlap**: Both define roles/descriptions/fallbacks for the same core agents (Sisyphus, oracle, librarian, explore, multimodal-looker, Prometheus, Metis), but with:
- Different wording (e.g., "main orchestrator" vs "orchestrator")
- Different fallback provider lists
- Different sets of agents (tui-helpers includes visual-engineering, deep, quick, ultrabrain, artistry, unspecified-*)

**Impact**: Inconsistent agent metadata across codebase; changes must be made in two places; risk of divergence.

**Refactor**: Extract a single source of truth. Create `src/agent-metadata.ts` exporting a unified `AGENT_REGISTRY` containing all agents (both Oh My OpenCode and Task Master categories). Then:
- `agentSystem.ts` re-exports `OH_MY_OPENCODE_AGENTS` as the subset needed for plugin
- `tui-helpers.ts` consumes `AGENT_REGISTRY` for `DEFAULT_AGENTS`

---

### 2. Config File Location Duplication

**The Problem**: Config file locations are hard-coded in two places.

| Location | Definition |
|----------|------------|
| `src/config.ts` | `CONFIG_LOCATIONS` array (5 entries) |
| `.opencode/tui/agent-manager.jsx` | `CONFIG_FILES` array (5 entries) |

**Impact**: Changing config file locations requires updating two files.

**Refactor**: Extract constants to shared module or generate JSON listing both project and user config paths.

---

### 3. Save Config Logic Duplication

**The Problem**: Nearly identical backup-and-write pattern:

- `src/config.ts:saveConfig` (Node `fs`)
- TUI `saveConfig` (Bun)

Both do: read → parse → merge → backup → write.

**Impact**: Bug fixes/improvements must be duplicated; risk of divergent behavior.

**Refactor**: Document canonical algorithm; consider creating a shared pure function for the merge step that can be used in both environments.

---

### 4. Path Normalization Logic Duplication

**The Problem**: `normalizePath` in `config.ts` vs inline logic in TUI.

**Impact**: Changes to path rules require two updates.

**Refactor**: Extract `normalizePath` into a pure function in `src/path-utils.ts` that works in both Node and Bun environments.

---

### 5. Test Setup Duplication in `test/tui-helpers.test.ts`

**The Problem**: 364-line file with many repetitive `LoadedConfig[]` constructions.

**Impact**: Test brittleness; hard to maintain when LoadedConfig shape changes.

**Refactor**: Create test factory helpers:
```typescript
export const makeLoadedConfig = (overrides?: Partial<LoadedConfig>): LoadedConfig => ({ ... });
export const makeAgentConfig = (model?: string, fallback?: string[]): AgentConfig => ({ ... });
```

---

### 6. `src/subagent.ts` Validation Loop Patterns

**The Problem**: Two separate loops iterate over `context.config.agents` with similar structure (permission validation, prompt_append duplicate detection). Adding another validation means adding another loop.

**Impact**: Hard to consolidate validation logic; repeated iteration pattern.

**Refactor**: Create separate validator functions and combine:
```typescript
const validatePermissions = (agents) => { ... };
const validatePromptAppendDuplicates = (agents) => { ... };
const validateAgents = (agents) => [...validatePermissions(agents), ...validatePromptAppendDuplicates(agents)];
```

---

### 7. TUI Dialog Boilerplate Duplication

**The Problem**: Many dialog functions follow same pattern: setSize → replace → build options → onSelect → saveAgentConfig. We already extracted `buildModelOptions`, but more extraction possible.

**Refactor**: 
- `renderSelectDialog(title, options, onSelect)` helper
- `backButton()` for common "← Back" option
- `handleModelSelection(item)` to construct fullModelId and save
- `handleFallbackSelection(item, existing)` for fallback updates

Example:
```typescript
function renderModelPicker(api, { title, providers, currentModel, onSave }) {
  const options = buildModelOptions(providers, currentModel);
  options.unshift(backButton());
  return api.ui.dialog.replace(() => (
    <Select title={title} options={options} onSelect={handleSelect(api, onSave)} />
  ));
}
```

---

## Summary Table

| # | Violation | Files Affected | Impact | Effort |
|---|-----------|----------------|--------|--------|
| 1 | Agent metadata duplication | `agentSystem.ts`, `tui-helpers.ts` | High | Medium |
| 2 | Config locations duplication | `config.ts`, TUI | Medium | Low |
| 3 | Save config pattern | `config.ts`, TUI | Medium | Medium |
| 4 | Path normalization | `config.ts`, TUI | Low | Low |
| 5 | Test setup duplication | `test/tui-helpers.test.ts` | Medium | Low |
| 6 | Validation loops | `subagent.ts` | Low | Low |
| 7 | TUI dialog boilerplate | `agent-manager.jsx` | High | Medium |

**Priority**: #1 (critical), #2 (low-hanging), #5, #7.

---

## Session: April 17, 2026 — DRY Fixes Applied

All 5 major DRY violations fixed via parallel subagent delegation:

### Fix #1: Agent Metadata Consolidation ✅
**New file**: `src/agent-metadata.ts` (153 lines)
- Unified `AGENT_REGISTRY` with all 16 agents (Oh My OpenCode + Task Master)
- Each agent has: `role`, `description`, `fallback`
- Helper functions: `getOhMyOpenCodeAgents()`, `getTaskMasterAgents()`, `getAllFallbackChains()`

**Updated files**:
- `src/agentSystem.ts` — imports from agent-metadata, re-exports for backward compatibility (53 lines, down from 80)
- `src/tui-helpers.ts` — imports `AGENT_REGISTRY`, derives `DEFAULT_AGENTS` and `DEFAULT_FALLBACKS` (128 lines, down from 134)

### Fix #2: Config Path Constants ✅
**New file**: `src/config-paths.ts` (12 lines)
- `PROJECT_CONFIG_PATHS` — 3 paths
- `USER_CONFIG_PATHS` — 2 paths
- `ALL_CONFIG_PATHS` — combined

### Fix #3: Test Factory Helpers ✅
**New file**: `test/helpers/factories.ts` (28 lines)
- `makeLoadedConfig(overrides)` — factory for LoadedConfig objects
- `makeAgentConfig(opts)` — factory for AgentConfig objects
- `makeMergedAgent(overrides)` — factory for MergedAgent objects

**Updated**: `test/tui-helpers.test.ts` — uses factories to reduce repetition

### Fix #4: Agent Validation Helpers ✅
**Updated**: `src/subagent.ts` (171 lines, up from 156)
- Extracted `validateAgentPermissions(agents)` — permission validation logic
- Extracted `findPromptAppendDuplicates(agents)` — duplicate detection logic
- Both exported for testability

### Fix #5: TUI Dialog Helpers ✅
**Updated**: `.opencode/tui/agent-manager.jsx`
- Added `backButton(description)` — creates consistent back option
- Added `saveModelSelection(item, agent)` — returns agent with full model ID
- Added `addToFallbacks(item, agent)` — returns new fallbacks array
- Added `editFallbackAt(item, agent, index)` — returns updated fallbacks array

### Test Results
```
bun test: 79 pass, 3 fail (pre-existing install/entrypoint failures)
```

---

## Session: April 17, 2026 — Model Resolution Investigation

### Problem: "qwen 397" Resolved Instead of User Selection

**User's Observation**: Selected model via AgentManager TUI but OpenCode resolved to "Qwen 3.5 397B A17B (NVIDIA)".

### Root Cause Analysis

**Model ID Found**: `qwen/qwen3.5-397b-a17b` in:
- `/Users/alex/dev/oh-my-opencode/src/generated/model-capabilities.generated.json` (line 3490)

**Model Resolution Pipeline** (from oh-my-opencode source):
```
1. uiSelectedModel → returns immediately (NO availability check)
2. userModel → returns immediately
3. categoryDefaultModel → fuzzy match or transform
4. userFallbackModels → try each
5. fallbackChain (hardcoded) → try each
6. systemDefaultModel → last resort
```

**Key Finding**: If the saved model ID doesn't match any available model, OpenCode falls through to fallback chain.

**User's Config Showed**:
```json
"model": "nvidia/z-ai/glm5",
"fallback_models": ["nvidia/z-ai/glm5", "nvidia/moonshotai/kimi-k2.5", ...]
```

**But backup showed**:
```json
"model": "nvidia/GLM-5 (NVIDIA) - DEPRECATED use glm-5.1"
```

This display-name format is **invalid** — OpenCode couldn't find it → fell back.

### Why AgentManager Changes Don't Appear in TUI Selector

**The Disconnect**:
- OpenCode TUI agent selector is part of the **server binary**, not the oh-my-opencode plugin
- The server loads config **ONCE at startup** via `loadPluginConfig()` in `plugin-config.ts`
- No file watching or hot-reload existed
- AgentManager modifies config file but server doesn't see changes until restart

**Evidence**:
- `/Users/alex/dev/oh-my-opencode/src/plugin-config.ts` — synchronous file reads, no watcher
- Server binary (`/opt/homebrew/bin/opencode`) — 101MB compiled executable
- TUI frontend calls `client.app.agents()` → server returns cached config

### Fix: Config Hot-Reload Implemented

**New file**: `/Users/alex/dev/oh-my-opencode/src/config-watcher.ts`
- Uses Node's built-in `fs.watch()` (no external dependencies)
- 300ms debouncing to handle burst saves
- Watches both user-level (`~/.config/opencode/`) and project-level (`.opencode/`) configs
- Exports: `startConfigWatcher()`, `stopConfigWatcher()`, `isConfigWatcherActive()`

**Modified files**:
- `plugin-config.ts` — added `startPluginConfigWatcher()`, `stopPluginConfigWatcher()`, `reloadPluginConfig()`, `getCurrentPluginConfig()`
- `index.ts` — starts watcher on plugin load, shows TUI toast on reload, emits `config.reload` event

**Features**:
- Debounced reloads (300ms)
- Dual config support (user + project)
- TUI notification on reload
- Clean lifecycle (stopped on dispose)

### NVIDIA NIM Model ID Format

**Correct Format**: `nvidia/{provider}/{model}`
- Example: `nvidia/z-ai/glm5`
- Example: `nvidia/stepfun-ai/step-3.5-flash`

**Wrong Format** (display name):
- `nvidia/GLM-5 (NVIDIA) - DEPRECATED use glm-5.1`
- `GLM-5 (NVIDIA)`

**AgentManager Bug Fixed**: Previously saved `model.name` (display) instead of `model.id` (API ID).

### Recommendations

1. **Restart OpenCode** after config changes to pick up hot-reload implementation
2. **Verify NVIDIA model IDs** match actual API:
   ```bash
   curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
     https://integrate.api.nvidia.com/v1/models | jq '.data[].id'
   ```
3. **Test hot-reload**: After selecting model in AgentManager, wait 300ms — should see "Config reloaded" toast

### Files Referenced

| File | Purpose |
|------|---------|
| `oh-my-opencode/src/shared/model-resolution-pipeline.ts` | Core model resolution logic |
| `oh-my-opencode/src/shared/model-requirements.ts` | Hardcoded fallback chains |
| `oh-my-opencode/src/shared/provider-model-id-transform.ts` | Model ID transformation |
| `oh-my-opencode/src/generated/model-capabilities.generated.json` | Model definitions (including qwen) |
| `oh-my-opencode/src/plugin-config.ts` | Config loading (now with reload) |
| `oh-my-opencode/src/config-watcher.ts` | File watcher (NEW) |

---