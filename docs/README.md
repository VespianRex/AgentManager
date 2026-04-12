# Agent Manager Plugin Documentation

This folder contains documentation for the OpenCode Agent Manager plugin.

## Contents

- `architecture.md` - Plugin design, hook usage, and implementation notes.
- `oh-my-opencode-guide.md` - Oh My OpenCode-specific configuration guidance.
- `agent-config-flow.md` - Configuration flows, diagrams, and user interaction patterns.
- `agent-orchestration.md` - Subagent orchestration strategy and atomic task context handling.
- `prd.md` - Product requirements document.

## Usage

Install the plugin by copying the files into your workspace's `.opencode/plugins/` directory.

The plugin registers a Command Palette entry so it is discoverable via OpenCode's palette. Look for the command titled **Open Agent Manager** (slash name: `agent-manager`) in the Command Palette/Quick Open. By default the plugin does not override host keybindings — use your host's Command Palette (e.g., Cmd+Shift+P on macOS or Ctrl+Shift+P on Windows/Linux) to open it.

From OpenCode, invoke the plugin using the custom tool or command that will be implemented in the plugin entrypoint.
