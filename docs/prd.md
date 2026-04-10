# Product Requirements Document

## Overview

The OpenCode Agent Manager plugin is a local OpenCode extension that helps users inspect, understand, and modify OpenCode agent and Oh My OpenCode settings. It will provide a terminal-first configuration experience, built-in documentation, and support for subagent orchestration.

## Goals

- Make agent config easy to discover and edit.
- Support Oh My OpenCode and generic OpenCode configuration.
- Explain how subagents are orchestrated and how atomic task context is delivered.
- Keep the plugin safe by backing up configs and validating writes.

## Features

- Detect project and user OpenCode config files.
- Display agent settings and category delegation presets.
- Allow editing of model overrides, permission rules, hooks, and orchestration flags.
- Show diagrams for agent orchestration and model resolution.
- Preserve JSONC formatting and comments where possible.
- Back up config files before changes.

## User stories

- As a user, I want to see which agent config file is active.
- As a user, I want to change an agent's model and permission settings safely.
- As a user, I want to understand how Oh My OpenCode and subagents work together.
- As a user, I want the plugin to create backups before it writes my config.

## Success criteria

- The plugin loads in OpenCode and exposes a management command/tool.
- Users can inspect and persist agent config edits safely.
- Documentation explains both configuration and orchestration clearly.
- The plugin captures subagent orchestration best practices in the UI.

## Non-functional requirements

- Works from the OpenCode plugin system.
- Uses plain text and ASCII diagrams for terminal readability.
- Avoids destructive edits by backing up configs first.
- Supports both project-local and user-level config files.
