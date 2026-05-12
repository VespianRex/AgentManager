# COMMAND-001: Task Master AI CLI

## Origin
- Sessions: Multiple sessions showed evidence of Task Master usage patterns
- Projects: unknown
- Date range: 2026-04-01 → 2026-04-01
- Last enriched: 2026-04-01

## Workflow
The Task Master AI CLI is used for PRD-driven task management via eyaltoledano/claude-task-master. Common usage patterns include:
1. Creating tasks from PRDs using task creation commands
2. Tracking implementation progress through task status updates
3. Managing dependencies between tasks using blockedBy and blocks relationships
4. Executing autonomous TDD execution (tm autopilot)
5. Launching parallel AI agent teams (tm clusters)
6. Using tm start command to hand off tasks to Claude Code with full context

## Proposed Command Spec
\`\`\`markdown
---
description: Task Master AI CLI for PRD-driven task management
agent: orchestrator
model: none
---

# Task Master AI CLI Commands

## Task Creation
/tm create-prd [prd-path] - Create tasks from a PRD document
/tm create [subject] [description] - Create a new task

## Task Management
/tm list [status] - List tasks filtered by status
/tm update [task-id] [status] - Update task status
/tm add-blocked-by [task-id] [blocked-task-id] - Add dependency
/tm add-blocks [task-id] [dependent-task-id] - Add dependent task

## Execution Modes
/tm autopilot [task-id] - Execute autonomous TDD for a task
/tm start [task-id] - Start task execution with full context handoff
/tm cluster [task-ids] - Launch parallel AI agent team

## Verification
/tm verify [task-id] - Run verification checks for task completion
/tm test [task-id] - Execute test suite for task
\`\`\`

## Frequency
Observed across multiple sessions in Wave 1 harvesting

## Related Skills
- SKILL-001: Ultrawork Mode Protocol (provides the execution framework)
- MISTAKE-001: Implementation Challenges (common pitfalls to avoid)

## Auto-Detection Trigger
This command would auto-trigger when the user types phrases like:
- "create a task from prd"
- "manage task dependencies"
- "start autonomous tdd execution"
- "launch parallel agent team"