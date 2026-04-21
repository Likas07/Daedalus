# Milestone 2 — Todo Redesign (`todo_read` / `todo_write`)

Status: backlog draft

## Goal
Replace the action-enum todo tool with a richer execution-state substrate.

## Dependencies
- Milestone 0
- strongly benefits from Milestone 1

## Tasks

### M2.1 Define runtime todo model and migration rules in code
Likely files:
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts` (or replacement split files)
- any shared type definitions for session state / UI rendering

Work:
- add string-id todo item model
- add explicit statuses
- define migration behavior from legacy numeric-id / boolean-done state

Verification:
- model supports `pending`, `in_progress`, `completed`, `cancelled`
- legacy state can be converted deterministically

### M2.2 Split `todo` into `todo_read` and `todo_write`
Likely files:
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- or new files such as:
  - `.../tools/todo-read.ts`
  - `.../tools/todo-write.ts`
- bundle registration in:
  - `packages/coding-agent/src/extensions/daedalus/bundle.ts`
  - `packages/coding-agent/src/extensions/daedalus/index.ts`

Work:
- implement `todo_read`
- implement `todo_write`
- preserve compatibility path for legacy `todo`

Verification:
- both new tools work in a live session
- legacy `todo` remains functional if temporarily retained

### M2.3 Implement merge/replace write semantics
Likely files:
- todo tool execution code
- session reconstruction logic

Work:
- support `merge`
- support `replace`
- enforce no duplicate ids and at most one `in_progress`

Verification:
- merge updates only targeted items
- replace swaps the whole list deterministically

### M2.4 Update session reconstruction and UI rendering
Likely files:
- todo tool UI component
- session_start / session_tree reconstruction code
- any TUI widgets for todo display

Work:
- reconstruct new state from tool results
- render status-aware UI
- render change summaries cleanly

Verification:
- resumed sessions show correct todo state
- UI differentiates pending/in-progress/completed/cancelled

### M2.5 Add tests for todo lifecycle
Tests:
- read empty state
- merge add
- merge update
- replace all
- status transitions
- invariant enforcement
- migration from legacy todo state

Verification:
- full todo lifecycle test coverage exists

## Completion criteria
- `todo_read` / `todo_write` work reliably
- old toggle semantics are no longer required for new workflows
- role docs and prompt set can truthfully assume the new model
