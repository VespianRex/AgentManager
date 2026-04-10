# OpenCode Agent Manager

A local OpenCode plugin and optional quick TUI for inspecting, explaining, and modifying OpenCode agent settings.

This project is designed to support both Oh My OpenCode and generic OpenCode configurations.

## What it includes

- `.opencode/plugins/agent-manager.ts`: plugin entrypoint for OpenCode
- `docs/`: implementation docs, architecture, and product requirements
- `examples/`: sample config templates

## Getting started

1. Install the plugin by placing it in `.opencode/plugins/`.
2. Run OpenCode in your project and invoke the plugin using a custom tool or command.
3. Use the docs in `docs/` to learn how to configure Oh My OpenCode agents, categories, hooks, and subagent orchestration.

## Running tests

- `npm test` — run the full test suite
- `npm run smoke` — run the smoke test
- `npm run e2e` — run the end-to-end plugin behavior test

## What this plugin provides

- config discovery for both project and user OpenCode files
- agent metadata and fallback system explanations
- subagent-style validation tasks for config checks and instruction-following guidance
- a simple CLI entrypoint in `cli/index.ts`
- safe JSONC reads/writes with backup support

PR created by assistant at 2026-04-10T16:03:58Z
