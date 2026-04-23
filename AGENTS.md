# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-14
**Commit:** 80fbb05
**Branch:** fix/plugin-tool-api-node16

## OVERVIEW
OpenCode Agent Manager plugin. Inspect, explain, and modify OpenCode agent settings. Supports Oh My OpenCode and generic configs via JSONC.

## STRUCTURE
```
AgentManager/
├── src/          # Core TS: plugin, config, types, 5-agent validation pipeline
├── cli/          # Standalone Bun CLI for interactive inspection
├── test/         # Bun test suite (unit + e2e + build/deploy verification)
├── docs/         # Architecture, PRD, orchestration guides
├── dist/         # Build output (JS)
├── .opencode/
│   ├── plugins/agent-manager/  # Deployed plugin files (JS copies of dist)
│   └── tui/agent-manager.jsx   # TUI JSX plugin (active dev, broken selection)
└── examples/     # Sample JSONC templates
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Agent Manager tool | `src/plugin.ts` | `agent_manager` tool + `tui.command.execute` hook |
| Config discovery/save | `src/config.ts` | JSONC parsing, backup, multi-location discovery |
| Validation pipeline | `src/subagent.ts` | 5-agent pipeline: discovery, system explanation, validation, orchestration, instruction follow |
| Agent fallback chains | `src/agentSystem.ts` | Oh My OpenCode agent roles + default fallbacks |
| TUI Command Palette | `.opencode/tui/agent-manager.jsx` | JSX-based TUI plugin using `@opentui/solid` |
| OpenCode global config | `~/.config/opencode/` | config.json, tui.json, plugins/ symlinks |

## CONVENTIONS
- **Bun-only**: `bun run test`, `bun run build` (tsc). No npm/pnpm/yarn.
- **Dual output**: TypeScript compiles to JS in `dist/`, then rsync'd to `.opencode/plugins/`.
- **Symlink deployment**: Global plugins dir uses symlinks to project files.
- **JSONC support**: Config loading preserves comments via `comment-json`.

## ANTI-PATTERNS (THIS PROJECT)
- **NEVER** put non-plugin `.js` files in `.opencode/plugins/` or `~/.config/opencode/plugins/` (scanner loads ALL `.js` files).
- **NEVER** export both `server` and `tui` in the same default export (OpenCode throws).
- **NEVER** assume TUI auto-discovers plugins (needs explicit `tui.json`).
- **DON'T** rely on auto-discovery for path plugins (broken in v1.4.3); use explicit `config.json` plugin array.

## OPENCODE PLUGIN LOADING RULES
- Server scans `{plugin,plugins}/*.{ts,js}` non-recursively in `.opencode/plugins/` and `~/.config/opencode/plugins/`.
- TUI loads plugins ONLY from `plugin` array in `tui.json` (no auto-discovery).
- Plugin default export must have EITHER `server` OR `tui`, not both.
- `readV1Plugin` in `detect` mode (server) returns undefined silently; strict mode (TUI) throws on invalid.
- OpenCode v1.4.3 has bug #18094: loader silently stops after certain plugins. Alphabetical ordering workaround (`aa-*` before `oh-*`).

## CRITICAL KNOWLEDGE FROM PREVIOUS SESSIONS (QWEN CLI)

### Mistakes & Fixes
1. **Stale global copy**: `~/.config/opencode/plugins/agent-manager/` was a real directory (stale copy) instead of symlink → Replaced with symlink.
2. **Non-plugin modules loaded**: `config.js`, `agentSystem.js` picked up by scanner → Renamed dir to `_agent-manager/` (underscore prefix).
3. **oh-my-opencode TUI crash**: `dist/index.js` had manual `export { tui }` → server loader called it as server plugin → Removed tui export, rebuilt from source.
4. **Rebuild overwrites fixes**: `bun run build` wipes manual dist edits → Need post-build script or source modification.
5. **TUI plugin crashes server**: TUI-only file in plugins dir auto-discovered → Moved to `.opencode/tui/` (not scanned).
6. **"Path plugin must export id"**: TUI plugin default missing `id` → Added `id: "agent-manager"`.
7. **TUI not discovering plugins**: Needs explicit `~/.config/opencode/tui.json`.
8. **JSX runtime errors**: TUI uses SolidJS, not React → Added `@opentui/solid/runtime-plugin-support`.

### UNRESOLVED ISSUES
- **DialogSelect options not selectable**: The TUI shows Agent Manager dialog but clicks do nothing. Multiple attempts with `onSelect` patterns failed. Last attempt: per-option `onSelect` + top-level `onSelect`. The PluginManager internally uses `rows`/`value`/`onValueChange` - this may be the correct pattern.
- **Build process**: Manual edits to `dist/` lost on rebuild. Need automated post-build step.

## COMMANDS
```bash
bun run build        # tsc compile to dist/
bun run deploy-plugin # rsync dist/ to .opencode/plugins/agent-manager/
bun run test         # Full test suite (test/*.test.ts)
bun run smoke        # Smoke test only
bun run e2e          # End-to-end plugin behavior test
```

## NOTES
- Global config in `~/.config/opencode/config.json` has explicit plugin paths.
- Plugin symlink: `~/.config/opencode/plugins/agent-manager.js` → project file.
- TUI config: `~/.config/opencode/tui.json` loads `.opencode/tui/agent-manager.jsx`.
- Oh My OpenCode is a fork; rebase with upstream `dev` branch periodically.
