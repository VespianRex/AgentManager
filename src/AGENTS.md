# src/ - Core Plugin Logic

## OVERVIEW
TypeScript source for the Agent Manager OpenCode plugin: config management, agent metadata, validation pipeline, and plugin exports.

## MODULE DEPENDENCY GRAPH
```
index.ts (entry) ──┬── plugin.ts (main server plugin)
                   ├── config.ts (JSONC load/save/discovery)
                   ├── agentSystem.ts (agent roles/fallbacks)
                   └── subagent.ts (5-agent validation pipeline)
                   └── types.ts (shared interfaces)
                   └── tui.ts (TUI command registration stub)
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Server plugin export | `index.ts` | Only exports `{ AgentManagerPlugin as server }` - NO `tui` export |
| Plugin definition | `plugin.ts` | `agent_manager` tool + `tui.command.execute` hook |
| Config discovery | `config.ts` | `findConfigFiles()`, `loadConfig()`, `saveConfig()`, JSONC via `comment-json` |
| Agent system | `agentSystem.ts` | `OH_MY_OPENCODE_AGENTS`, `DEFAULT_FALLBACK_CHAINS`, `CATEGORY_PARENT_FALLBACK` |
| Validation pipeline | `subagent.ts` | 5 agents: discovery, system explanation, validation, orchestration review, instruction follow |
| Type definitions | `types.ts` | `ConfigLocation`, `ConfigSummary`, `AgentManagerDocument` |

## CONVENTIONS
- **Import pattern**: All `.ts` files import from `.js` extensions (TypeScript `moduleResolution: bundler`).
- **Export style**: Named exports only. No default exports in source (except in plugin).
- **Type safety**: Strict types for `AgentManagerDocument` - agents/categories as `Record<string, unknown>`.
- **Error handling**: Minimal try/catch in `findConfigFiles()` (silently ignores missing files).

## ANTI-PATTERNS
- **Don't add `tui` export to `index.ts`**: OpenCode server loader treats ALL function exports as server plugins. TUI crashes with `api.command.register` undefined.
- **Don't use `as any`**: No type suppression allowed.
- **Don't mix config types**: `oh-my-opencode.json` vs `opencode.json` have different schemas.

## KEY FUNCTIONS
- `findConfigFiles(cwd)` → scans project + user locations for config files
- `loadConfig(location)` → reads JSONC file, returns parsed document
- `saveConfig(location, document)` → merges changes, creates backup, writes
- `runSubAgentPipeline(context)` → runs 5 validation agents, returns results array
- `getOrchestrationDiagram()` / `getFallbackDiagram()` → ASCII diagrams for UI
