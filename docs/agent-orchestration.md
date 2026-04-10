# Agent Orchestration and Task Context

This guide explains how subagent orchestration works in OpenCode and Oh My OpenCode, and how the agent manager plugin will support it.

## Key concepts

- **Sisyphus** is the main orchestrator for Oh My OpenCode.
- **Prometheus** acts as the planner.
- **Atlas / Junior** are worker subagents that execute tasks.
- **Background agents** run parallel augmenting tasks such as search, docs lookup, or code review.

## Atomic task context

For each delegated task, the system must provide the subagent with:

- the task goal and constraints
- the current file(s) or feature scope
- relevant project conventions or style notes
- the surrounding code or README references
- any previous plan decisions or acceptance criteria

## Recommended orchestration pattern

1. **Plan creation**: Prometheus creates a structured plan with tasks and acceptance criteria.
2. **Context injection**: Each task is paired with a slice of project context, not the entire codebase.
3. **Subagent assignment**: Tasks are delegated to specialized agents by category, e.g. `visual`, `business-logic`, `quick`.
4. **Verification**: Completed task outputs are validated and integrated back into the main plan.

## Diagram

```
+------------+      +-------------+      +----------------+
|  User / UI | ---> |  Prometheus | ---> |  Task planner  |
+------------+      +-------------+      +----------------+
                                |                    \
                                v                     \
                      +----------------+       +----------------------+
                      | Sisyphus /    |       | Subagents / Workers  |
                      | orchestrator   |       | - oracle            |
                      +----------------+       | - explore           |
                                |              | - multimodal-looker |
                                v              +----------------------+
                    +------------------------------------+
                    | Atomic task context injector      |
                    | - file references                 |
                    | - task instructions               |
                    | - prompt_append                   |
                    +------------------------------------+
```

## Plugin support

The plugin will help users:

- identify which agents are active in the harness
- configure categories and permission scopes for delegation
- tune `sisyphus_agent` and `background_task` settings
- record and explain how subagents receive task-specific context
- create safe config edits with backups
