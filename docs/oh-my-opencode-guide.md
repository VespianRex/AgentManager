# Oh My OpenCode Guide

This document captures the key configuration concepts for Oh My OpenCode.

## Config file locations

- Project-specific: `.opencode/oh-my-opencode.json`
- User-specific: `~/.config/opencode/oh-my-opencode.json`

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
