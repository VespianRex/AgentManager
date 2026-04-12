# Agent Configuration Flow

This document describes the interaction model for the OpenCode Agent Manager plugin.

## User flow

1. Launch the plugin from OpenCode.
2. Detect the current active config file and harness type.
3. Choose between:
   - Oh My OpenCode settings
   - Generic OpenCode agent settings
4. Inspect current agent values.
5. Edit models, permissions, categories, hooks, and orchestration settings.
6. Review changes and save with a backup.

## Menu sections

- **Current environment** — shows config source and active harness.
- **Agent overview** — displays defined agents and their effective settings.
- **Agent editor** — edit model overrides, temperature, prompt append, permission rules, and disable state.
- **Category editor** — customize domain-specific delegation categories.
- **Orchestration editor** — review and tune subagent orchestration and task context delivery.
- **Diagnostics** — show model resolution flow and provider priority chain.

## Diagram

```
[User prompt] -> [Agent Manager plugin]
                    │
          +---------+----------+
          │                    │
[Oh My OpenCode config]   [generic OpenCode config]
          │                    │
  [Agent settings editor]      [Agent settings editor]
          │                    │
  [Save + backup]             [Save + backup]
```

## Data model

The plugin will treat config files as JSONC, preserve comments, and write updated settings carefully.

It will also surface key orchestration patterns to help users understand how their agents and subagents work together.