# .opencode/tui/ - TUI Plugin

## OVERVIEW
JSX-based TUI plugin using `@opentui/solid` for the Agent Manager UI in OpenCode's command palette.

## KEY FILE
| File | Purpose |
|------|---------|
| `agent-manager.jsx` | TUI plugin with DialogSelect, SolidJS components, command palette integration |

## CRITICAL RULES
- **NOT in plugins directory**: This file lives in `.opencode/tui/` NOT `.opencode/plugins/` to avoid server auto-discovery crash.
- **TUI loading**: Requires explicit `plugin` array in `~/.config/opencode/tui.json`.
- **JSX runtime**: Uses SolidJS via `@opentui/solid/runtime-plugin-support`, NOT React.
- **Default export**: Must have `id` + EITHER `server` OR `tui`, never both.

## KNOWN ISSUES
- **DialogSelect selection broken**: Options show but clicks do nothing. Tried `onSelect` patterns (per-option + top-level). PluginManager uses `rows`/`value`/`onValueChange` - may need different API.
- **Build overwrites**: Manual edits to JSX lost if project rebuilds.

## LOADING
```json
// ~/.config/opencode/tui.json
{
  "plugin": ["./.opencode/tui/agent-manager.jsx"]
}
```
