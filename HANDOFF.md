# Agent Manager TUI Plugin - Handoff Document

## Overview

This document provides a comprehensive summary of the Agent Manager TUI plugin development, including what worked, what didn't, and the correct steps to take for future development.

## Current Status

**Working:**
- Navigation (arrow keys)
- Dialog display and rendering
- "Remove last fallback" option
- "Back to agent" navigation
- Config file loading (both `agents` and `categories` sections)
- Case-insensitive agent key matching
- Model badge display and shortening
- Test suite (48 tests passing)

**Not Working:**
- Selecting model options in `editModel()` - Enter key doesn't trigger `onSelect`
- Selecting "Add new fallback" option - Enter key doesn't trigger `onSelect`

---

## Key Technical Discoveries

### 1. DialogSelect API Pattern (CRITICAL)

**The correct pattern from `tui-smoke.tsx`:**
```jsx
const picker = (api) => {
  const DialogSelect = api.ui.DialogSelect
  
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title="Select option"
      options={opts}
      current={currentValue}
      onSelect={(item) => {
        api.ui.dialog.clear()  // <-- CRITICAL: Clear dialog first!
        api.route.navigate(...) // Then do navigation/action
      }}
    />
  ))
}
```

**Key difference:** The working example calls `api.ui.dialog.clear()` BEFORE the action. Our code doesn't clear the dialog, which may cause the Enter key event to not propagate correctly.

### 2. JSX Syntax vs Function Call Syntax

**CORRECT (JSX component syntax):**
```jsx
<DialogSelect
  title="Select Model"
  options={options}
  onSelect={(item) => { ... }}
/>
```

**INCORRECT (function call syntax):**
```jsx
api.ui.DialogSelect({
  title: "Select Model",
  options: options,
  onSelect: (item) => { ... }
})
```

The JSX syntax works because it properly integrates with the SolidJS reconciler.

### 3. Unicode Characters in Option Titles

Unicode characters like `+`, `-`, `✏`, `←` may interfere with DialogSelect rendering. Always use plain ASCII text for option titles:

| Avoid | Use Instead |
|-------|-------------|
| `+ Add new fallback` | `Add new fallback` |
| `✏ Type custom model` | `Type custom model` |
| `- Remove last fallback` | `Remove last fallback` |
| `← Back to agent` | `Back to agent` |

### 4. Config File Structure

OpenCode config files have TWO sections for agent definitions:

```json
{
  "agents": {
    "sisyphus": { "model": "...", "fallback_models": [...] },
    "oracle": { "model": "...", "fallback_models": [...] }
  },
  "categories": {
    "ultrabrain": { "model": "...", "fallback_models": [...] },
    "visual-engineering": { "model": "...", "fallback_models": [...] }
  }
}
```

**Critical:** Categories must be saved to `categories` section, agents to `agents` section.

### 5. Case Sensitivity

Agent keys are case-insensitive for matching but case-preserving for display:

```typescript
// Normalize for matching
const normalizedKey = agentKey.toLowerCase()

// Preserve original for display
merged[normalizedKey].key = agentKey  // Original casing
```

This prevents duplicates like "Prometheus" and "prometheus".

---

## File Locations

| File | Purpose |
|------|---------|
| `.opencode/tui/agent-manager.jsx` | Main TUI plugin (660+ lines) |
| `src/tui-helpers.ts` | Extracted pure functions for testing |
| `test/tui-helpers.test.ts` | Unit tests (36 tests) |
| `test/tui-smoke.test.ts` | Integration tests (12 tests) |
| `~/.config/opencode/tui.json` | Plugin loading config |

---

## Testing

### Run Tests
```bash
cd "/Volumes/Kingston XS1000 Media - Data/macOS-relocated/dev/AgentManager"
bun test test/tui-helpers.test.ts test/tui-smoke.test.ts
```

### Test Coverage
- `modelBadge()` - 7 test cases
- `shortenModel()` - 6 test cases
- `mergeWithDefaults()` - 9 test cases
- `determineSectionKey()` - 3 test cases
- `buildAgentUpdate()` - 4 test cases
- `DEFAULT_AGENTS` - 4 test cases
- `DEFAULT_FALLBACKS` - 3 test cases
- Integration tests - 12 test cases

**Note:** Tests cover pure functions only. UI interaction testing requires manual testing.

---

## Known Issues & Workarounds

### Issue 1: Enter Key Not Working for Some Options

**Symptoms:** 
- Arrow key navigation works
- Some options (like "Remove last fallback") work
- Other options (like "Add new fallback", model selection) don't respond to Enter

**Attempted Fixes:**
1. ✅ Changed from function call to JSX syntax - partially helped
2. ✅ Removed Unicode characters from titles - partially helped
3. ⏳ Add `api.ui.dialog.clear()` before action - **TRY THIS NEXT**

**Root Cause (Hypothesis):**
The DialogSelect component may need the dialog to be cleared before the `onSelect` callback can properly execute navigation or state changes.

### Issue 2: DialogSelect in Plugins vs Built-in

**Observation:** Enter key works in all built-in OpenCode dialogs but not reliably in plugin dialogs.

**GitHub Issue Filed:** https://github.com/anomalyco/opencode/issues/22610

---

## Reference Documentation

### OpenCode Plugin API

**Location:** `node_modules/@opencode-ai/plugin/dist/tui.d.ts`

**Key Types:**
```typescript
interface TuiPluginApi {
  ui: {
    DialogSelect: Component<DialogSelectProps>
    DialogPrompt: Component<DialogSelectProps>
    DialogAlert: Component<DialogAlertProps>
    DialogConfirm: Component<DialogConfirmProps>
    dialog: {
      replace: (render: () => JSX.Element, onClose?: () => void) => void
      clear: () => void
      setSize: (size: "medium" | "large" | "xlarge") => void
      readonly open: boolean
      readonly depth: number
    }
    toast: (input: TuiToast) => void
  }
  state: {
    provider: ReadonlyArray<Provider>
    path: { directory: string }
  }
  client: OpencodeClient
  command: { register: (cb: () => TuiCommand[]) => () => void }
  theme: { current: TuiThemeCurrent }
  lifecycle: { onDispose: (fn: () => void) => () => void }
}
```

### OpenTUI Documentation

**Repository:** https://github.com/anomalyco/opentui

**Key Imports:**
```typescript
import { useKeyboard } from "@opentui/solid"
import { RGBA } from "@opentui/core"
```

### Working Examples

**Official Example:** `.opencode/plugins/tui-smoke.tsx` in OpenCode repository

**Key Patterns from tui-smoke.tsx:**
1. Use `api.ui.dialog.clear()` in `onSelect` callbacks
2. Define constants outside functions
3. Use `useKeyboard` for custom key handling
4. Component-based architecture

---

## Recommended Next Steps

### Step 1: Add `api.ui.dialog.clear()` to onSelect callbacks

```jsx
// In editModel function, change:
onSelect={(item) => {
  if (item.value.model === "__custom__") {
    showCustomModelPrompt(...)
  } else {
    saveAgentConfig(...)
  }
}}

// To:
onSelect={(item) => {
  api.ui.dialog.clear()  // Add this line
  if (item.value.model === "__custom__") {
    showCustomModelPrompt(...)
  } else {
    saveAgentConfig(...)
  }
}}
```

### Step 2: Apply to All DialogSelect Components

Add `api.ui.dialog.clear()` to:
- `editModel()` onSelect
- `showAddFallback()` onSelect
- `showEditFallback()` onSelect
- `showFallbackManager()` onSelect
- `showAgentDetail()` onSelect
- `showAgentList()` onSelect

### Step 3: Test Thoroughly

1. Restart OpenCode
2. Open Agent Manager
3. Test each dialog type:
   - Select agent from list
   - Select "Model: ..." option
   - Select model from picker
   - Select "Fallbacks: ..." option
   - Select "Add new fallback"
   - Select fallback from picker
   - Select "Remove last fallback"
   - Select "Back to agent/list"

### Step 4: If Still Not Working

If `api.ui.dialog.clear()` doesn't fix it, try:
1. Use `setTimeout(() => action(), 0)` to defer the action
2. Check if the issue is specific to certain option values
3. Check if the issue is related to dialog depth/stacking

---

## Anti-Patterns to Avoid

### ❌ DON'T: Use function call syntax for dialogs
```jsx
api.ui.DialogSelect({ title: "...", onSelect: ... })
```

### ❌ DON'T: Put Unicode characters in option titles
```jsx
{ title: "✏ Edit model", ... }
```

### ❌ DON'T: Export both server and tui from same plugin
```typescript
export default { server, tui }  // WRONG
export default { id: "x", tui } // CORRECT
```

### ❌ DON'T: Put non-plugin JS files in plugins directory
The scanner loads ALL `.js` files and may crash.

### ❌ DON'T: Assume TUI auto-discovers plugins
Must explicitly list in `tui.json`:
```json
{ "plugin": ["./.opencode/tui/agent-manager.jsx"] }
```

---

## Contact & Resources

- **GitHub Issue:** https://github.com/anomalyco/opencode/issues/22610
- **OpenCode Repo:** https://github.com/anomalyco/opencode
- **OpenTUI Repo:** https://github.com/anomalyco/opentui
- **Plugin API Types:** `node_modules/@opencode-ai/plugin/dist/tui.d.ts`

---

## Summary

The Agent Manager TUI plugin is functionally complete with comprehensive test coverage. The main remaining issue is the Enter key not triggering `onSelect` for certain DialogSelect options. The most likely fix is adding `api.ui.dialog.clear()` to all `onSelect` callbacks, following the pattern in the official `tui-smoke.tsx` example.

**Critical Files:**
- `.opencode/tui/agent-manager.jsx` - Main plugin (edit here)
- `src/tui-helpers.ts` - Pure functions (test here)
- `test/tui-helpers.test.ts` - Unit tests
- `test/tui-smoke.test.ts` - Integration tests

**Key Insight:** The working example in `tui-smoke.tsx` uses `api.ui.dialog.clear()` in `onSelect` callbacks. Our code doesn't. This is the most likely cause of the Enter key issue.
