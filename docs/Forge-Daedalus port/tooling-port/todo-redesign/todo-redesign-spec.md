# Todo Redesign Spec: Forge + Hermes -> Daedalus

Status: planning draft
Scope: todo model, tool split, and behavior redesign only; no implementation changes yet
Workspace target: `/home/likas/Research/Daedalus`

## Goal

Redesign Daedalus todo management so it supports:
- Forge-style explicit task state and enforcement
- Hermes-style structured todo item updates
- clearer read/write tool separation
- stronger execution discipline for Daedalus, Sage, Muse, and Worker workflows

The target is not to clone either system exactly.
The target is to combine:
- Forge's richer runtime behavior around pending/in-progress work
- Hermes's simpler, cleaner structured todo API
- Daedalus's artisan/orchestrator identity and branch-aware workflow model

## Current Daedalus model

Current implementation:
- single tool: `todo`
- actions: `list`, `add`, `toggle`, `clear`
- item model:
  - `id: number`
  - `text: string`
  - `done: boolean`

Source:
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`

Current strengths:
- simple and easy to understand
- branch/session reconstruction already exists
- basic UI integration already exists

Current limitations:
- boolean `done` is too weak for real execution-state tracking
- `toggle` is ambiguous and not semantically rich
- mixed read/write action enum is cognitively noisy for the model
- weak support for explicit `in_progress` / `cancelled` / `blocked` style workflows
- no structured notion of update diffs or change reporting
- no enforcement behavior when the model tries to stop with active tasks remaining

## Forge todo model

Observed Forge model:
- separate tools: `todo_write` and `todo_read`
- status enum:
  - `pending`
  - `in_progress`
  - `completed`
  - `cancelled`
- todo data model includes:
  - `id: String`
  - `content: String`
  - `status: TodoStatus`
- model-facing write input is simplified as `TodoItem`:
  - `content`
  - `status`
- server matches by content and updates/creates accordingly
- cancelled status removes item from active list semantics
- pending todos are injected back into the conversation on resume
- pending/in-progress todos can block completion via `PendingTodosHandler`
- config has `verify_todos` to enforce that unfinished work prevents premature completion

Sources:
- `harnesses/forgecode/crates/forge_domain/src/tools/catalog.rs`
- `harnesses/forgecode/crates/forge_app/src/services.rs`
- `harnesses/forgecode/crates/forge_app/src/hooks/pending_todos.rs`
- `harnesses/forgecode/crates/forge_app/src/user_prompt.rs`
- `harnesses/forgecode/crates/forge_config/src/config.rs`

What Forge gets right:
- explicit statuses rather than toggle semantics
- separate read vs write API surface
- runtime enforcement around unfinished work
- resume-time reinjection of task state into the context
- todo list is treated as execution state, not just a scratchpad

Potential downside to copy cautiously:
- matching by content is convenient but can be fragile if task text changes frequently

## Hermes todo model

Observed Hermes model in this environment:
- single tool: `todo`
- items have:
  - `id: string`
  - `content: string`
  - `status: pending | in_progress | completed | cancelled`
- write behavior uses a `todos` array
- supports full-list replace or merge-by-id update
- enforces that only one item should be `in_progress` at a time
- tool is explicitly positioned as session task planning/tracking for complex work

What Hermes gets right:
- simple structured API
- explicit statuses
- stable string IDs under model control
- merge semantics are cleaner than action enums
- `in_progress` as a first-class state
- prompts naturally toward plan updates rather than toggles

Potential downside to copy cautiously:
- a single combined tool can still blur read/write semantics a bit compared with Forge

## Design decision

Daedalus should adopt:
- Forge-style split: `todo_read` + `todo_write`
- Hermes-style structured todo item schema
- Forge-inspired enforcement behavior
- Daedalus-specific branch/session/UI integration

In other words:
- split like Forge
- item schema like Hermes
- enforcement inspired by Forge
- integration adapted to Daedalus

## Proposed target model

### Todo item schema

```ts
{
  id: string,
  content: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
}
```

Optional future extension (not required for first pass):
- `notes?: string`
- `owner?: 'daedalus' | 'sage' | 'muse' | 'worker'`
- `source?: 'manual' | 'plan' | 'subagent'`

First-pass recommendation:
- keep the schema minimal
- do not add metadata until core behavior is stable

## Proposed tools

### todo_read

Purpose:
- return the current todo state in a model-friendly structured form
- support prompt-level inspection of execution state

Behavior:
- no parameters required for base case
- returns full ordered todo list
- may optionally support filtered reads later

### todo_write

Purpose:
- create, update, and remove todos via structured list semantics

Recommended first-pass API:
- accept `todos: TodoItem[]`
- support merge/update semantics by `id`
- allow omitted existing todos to remain unless explicit replace mode is requested

Recommended write options:
- `merge: boolean` default true or false depending on final prompt philosophy
- or split modes explicitly:
  - merge/update by id
  - replace full list

My recommendation:
- prefer Hermes-like explicit merge/replace semantics over Forge's content-matching
- use stable `id` values rather than content matching

## Status model

Use:
- `pending`
- `in_progress`
- `completed`
- `cancelled`

Rules:
- at most one `in_progress` item at a time by default
- `cancelled` items should not count as active work
- `completed` and `cancelled` should not block completion checks
- `pending` and `in_progress` should count as active work

## Behavioral policies to port from Forge

### 1. Resume-time task reinjection
When a session resumes, active todo state should be visible to the agent again.

Current Daedalus already reconstructs todo state from session history.
That should be preserved and upgraded for the richer status model.

Target behavior:
- active todo state is reconstructed on session start / branch switch
- resumed sessions surface current work clearly to the agent
- UI can show active list with richer status markers

### 2. Pending-work completion guard
Daedalus should consider a Forge-like completion guard.

Target behavior:
- if the agent attempts to finish while `pending` or `in_progress` items remain,
  Daedalus may inject a reminder or otherwise discourage premature completion
- this should be configurable, like Forge's `verify_todos`

Recommendation:
- add a configurable completion guard after the core todo redesign lands
- do not block on implementing the guard to complete the schema/tool redesign

### 3. Todo diff / change visibility
Forge appears to treat todo writes as meaningful state-change events.
Daedalus should expose write results in a way that clearly shows what changed.

Target behavior:
- added items
- updated statuses
- removed/cancelled items
- current active item

This is useful for:
- prompt compaction
- session replay
- UI rendering
- debugging agent behavior

## Proposed Daedalus-specific adaptations

### 1. Preserve branch-aware behavior
Current Daedalus todo state is branch/session aware.
That is valuable and should be retained.

### 2. Integrate with plan-mode execution
Daedalus already has plan-mode execution tracking.
The todo redesign should eventually align with that system rather than live beside it awkwardly.

Longer-term target:
- plan-mode execution state and todo state should converge or interoperate cleanly

### 3. Support role-aware usage
Expected dominant users:
- Daedalus: primary owner of todo discipline
- Muse: can emit plan-derived tasks
- Worker: can report delegated-lane progress
- Sage: usually read-only consumer, rarely writer

Recommendation:
- do not over-encode role metadata in v1
- but keep future extension space open

## Recommended migration path

### Phase 1: model + tool surface
- introduce `todo_read`
- introduce `todo_write`
- adopt structured schema with string IDs and explicit statuses
- keep legacy `todo` tool temporarily for compatibility

### Phase 2: behavior + prompts
- update Daedalus prompt to require richer todo state for non-trivial work
- update Muse prompt to emit plan-compatible todos
- update Worker prompt to report lane completion through `todo_write`
- update UI rendering for statuses beyond done/undone

### Phase 3: enforcement
- add configurable pending-work completion guard
- inject reminder when agent tries to stop with active todos
- ensure resumed sessions expose active todo state clearly

### Phase 4: consolidation
- deprecate legacy `todo` action-enum tool
- migrate plan-mode/task flows to the new todo model where appropriate

## Legacy compatibility recommendation

Do not hard-remove current `todo` immediately.
Instead:
1. add new tools first
2. update prompts and role docs
3. migrate internal workflows
4. deprecate old tool
5. remove only after compatibility confidence is high

## Concrete recommendation

### Use Forge ideas for:
- split read/write tools
- active-work enforcement
- resume-time task reinjection
- treating todos as execution state

### Use Hermes ideas for:
- structured todo item shape
- explicit status lifecycle
- stable item IDs
- merge/update semantics

### Keep from Daedalus:
- branch/session reconstruction
- UI visibility
- integration with plan-mode and subagent workflows

## Success criteria

The redesign is successful if:
- todo state becomes richer than add/toggle/clear/list
- the model has a cleaner API than the current single action-enum tool
- active work is harder to silently lose
- Daedalus can express Forge-like execution discipline without copying Forge mechanically
- future convergence with plan-mode execution becomes easier rather than harder
