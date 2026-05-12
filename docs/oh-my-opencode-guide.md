# Oh My OpenCode Guide

This document captures the key configuration concepts for Oh My OpenCode.

## Config file locations

- Project-specific: `.opencode/oh-my-opencode.json`
- User-specific: `~/.config/opencode/oh-my-opencode.json`
- Generic project config: `opencode.json` or `.opencode/package.json`

## Important sections

- `agents`: override model, temperature, prompt, tools, permission, and disable flags.
- `categories`: define domain-specific delegation presets such as `visual`, `quick`, and `business-logic`.
- `permissions`: control agent capabilities with options such as `edit`, `bash`, `webfetch`, `doom_loop`, and `external_directory`.
- `disabled_agents`, `disabled_skills`, `disabled_hooks`, `disabled_mcps`: toggle features and subagents.
- `sisyphus_agent`: configure orchestrator behavior including planner and builder settings.
- `background_task`: manage parallel execution limits.
- `lsp`: custom LSP server definitions.
- `experimental`: opt-in features such as aggressive truncation and auto-resume.

## Advice

- Only override what you need. Most defaults are intended to work out of the box.
- Use `prompt_append` to add custom instructions without replacing the default system prompt.
- Keep permission changes deliberate: `edit` and `bash` are the most sensitive settings.

## Fallback model resolution

Oh My OpenCode chooses models using a three-step resolution system:

1. **User override** — an explicit model configured in `oh-my-opencode.json`.
2. **Provider fallback chain** — try providers in priority order until an available model is found.
3. **System default** — fall back to the default OpenCode model if no other provider resolves.

This plugin surface this flow in the CLI and plugin output so you can understand why a given agent will use a specific model.

## Subagent orchestration

The plugin also documents how Sisyphus works with Prometheus and background agents:

- `Sisyphus` orchestrates the work plan and delegates atomic tasks.
- `Prometheus` generates structured plans and clarifies requirements.
- `Atlas`, `Junior`, and other worker agents execute assigned tasks with the context they need.
- Background agents handle parallel tasks such as docs lookup, search, and component review.

Use the plugin to check whether your config includes `sisyphus_agent` and `background_task` settings, and whether they are consistent with an orchestrated workflow.
