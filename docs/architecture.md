# Plugin Architecture

## Goals

- Provide a local OpenCode plugin for managing agent settings.
- Support Oh My OpenCode-specific configuration and generic OpenCode agent config.
- Enable a command-driven TUI flow for inspecting and editing settings.
- Surface subagent orchestration and atomic task context details.

## Core components

- **Plugin entrypoint**: `.opencode/plugins/agent-manager.ts`
- **Types and helpers**: `.opencode/plugins/agent-manager.types.ts`
- **Documentation**: `docs/` folder with guides and diagrams
- **Examples**: sample config templates in `examples/`

## Hook model

The plugin will use OpenCode's plugin API to:

- register a custom tool for agent management
- optionally intercept a TUI command event such as `/agent-manager`
- read and write OpenCode config files safely

## Config discovery

The plugin will search these locations:

- Project config: `.opencode/oh-my-opencode.json`, `opencode.json`, `.opencode/package.json`
- User config: `~/.config/opencode/oh-my-opencode.json`, `~/.config/opencode/opencode.json`

It will preserve JSONC comments and create backups before writing.

## Subagent orchestration and context management

The plugin uses a lightweight subagent pipeline to inspect and validate configuration with explicit context passing.

- **ConfigDiscovery** receives the raw config document and returns a summary of agents and categories.
- **SystemExplanation** adds an overview of Oh My OpenCode roles and fallback provider chains.
- **ConfigValidation** checks permission values, hook names, and whether the config follows expected OpenCode patterns.
- **OrchestrationReview** inspects `sisyphus_agent` and `background_task` configuration to verify subagent orchestration settings.
- **InstructionFollowReview** detects repeated `prompt_append` usage and issues DRY/KISS guidance.

The plugin treats these checks as separate subagent tasks, ensuring each stage receives only the relevant context for that audit.
