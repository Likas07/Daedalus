# Todo API Proposal: Daedalus `todo_read` + `todo_write`

Status: API draft
Scope: concrete tool request/response design only; no implementation changes yet
Workspace target: `/home/likas/Research/Daedalus`

## Goal

Define a concrete API for replacing the current action-enum `todo` tool with:
- `todo_read`
- `todo_write`

The API should support:
- explicit status-based task tracking
- stable item identity
- merge and replace flows
- clear write result reporting
- future compatibility with plan-mode and subagent workflows

## Design principles

1. Separate read from write
2. Prefer explicit structured updates over action enums
3. Use stable string IDs
4. Support both incremental updates and full-list replacement
5. Make write results easy to render, compact, and audit
6. Keep v1 minimal but extensible

## Canonical todo item shape

```ts
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

Notes:
- `id` is the stable identity key
- `content` is user/model-visible task text
- `status` is the execution state
- v1 intentionally omits metadata such as owner/source/notes

## Status semantics

### pending
Task exists but is not currently active.

### in_progress
Task is actively being worked.

### completed
Task is done and should not count as active work.

### cancelled
Task is intentionally abandoned / superseded and should not count as active work.

## Global invariants

Recommended invariants for v1:
- at most one `in_progress` item at a time
- `pending` and `in_progress` are active work
- `completed` and `cancelled` are inactive work
- list order is meaningful and should be preserved

## Tool 1: `todo_read`

### Purpose
Read current todo execution state.

### Request schema

Minimal v1:

```json
{}
```

Optional future extensions:

```json
{
  "status": ["pending", "in_progress"],
  "include_inactive": true
}
```

Recommendation for v1:
- keep request empty
- always return the full ordered list

### Response shape

```json
{
  "todos": [
    {
      "id": "task-1",
      "content": "Inspect auth flow",
      "status": "completed"
    },
    {
      "id": "task-2",
      "content": "Implement token refresh",
      "status": "in_progress"
    },
    {
      "id": "task-3",
      "content": "Add tests for refresh flow",
      "status": "pending"
    }
  ],
  "summary": {
    "total": 3,
    "active": 2,
    "pending": 1,
    "in_progress": 1,
    "completed": 1,
    "cancelled": 0
  }
}
```

### Rationale
- full list keeps behavior simple
- summary helps prompts/UI render state quickly
- preserves order semantics

## Tool 2: `todo_write`

### Purpose
Create, update, reorder, replace, or remove todo items through structured writes.

## `todo_write` request model

Recommended top-level schema:

```json
{
  "todos": [
    {
      "id": "task-2",
      "content": "Implement token refresh",
      "status": "completed"
    }
  ],
  "mode": "merge"
}
```

### Fields

#### `todos`
Array of todo items to write.

#### `mode`
One of:
- `merge`
- `replace`

Default recommendation:
- `merge`

## `todo_write` modes

### Mode: `merge`
Behavior:
- update existing items by `id`
- add new items whose `id` is not present
- preserve unspecified existing items
- preserve ordering of existing items, appending new ones by default

Use for:
- incremental progress updates
- marking completion
- adding newly discovered subtasks

### Mode: `replace`
Behavior:
- replace the full todo list with the provided ordered list

Use for:
- re-planning from scratch
- promoting a plan artifact into the current execution state
- rewriting the task stack after major scope changes

## `todo_write` ID policy

Recommended v1 policy:
- the caller provides string IDs
- IDs must be stable across updates
- if caller omits an ID for a new item, the server may generate one, but this should be avoided in prompt guidance when possible

Preferred prompt doctrine:
- agents should provide explicit IDs in stable human-readable form, e.g.:
  - `inspect-auth-flow`
  - `implement-token-refresh`
  - `add-refresh-tests`

Why:
- better merge behavior
- easier debugging
- easier diff readability
- more stable subagent coordination

## `todo_write` validation rules

Recommended v1 validation:
- `content` must be non-empty
- `id` must be non-empty
- no duplicate IDs in a single write request
- no more than one `in_progress` item after applying the write
- invalid statuses rejected

Optional rule:
- cap content length to a reasonable bound

## `todo_write` response shape

Recommended response:

```json
{
  "todos": [
    {
      "id": "inspect-auth-flow",
      "content": "Inspect auth flow",
      "status": "completed"
    },
    {
      "id": "implement-token-refresh",
      "content": "Implement token refresh",
      "status": "in_progress"
    },
    {
      "id": "add-refresh-tests",
      "content": "Add tests for refresh flow",
      "status": "pending"
    }
  ],
  "changes": [
    {
      "kind": "updated",
      "id": "inspect-auth-flow",
      "before": {
        "id": "inspect-auth-flow",
        "content": "Inspect auth flow",
        "status": "in_progress"
      },
      "after": {
        "id": "inspect-auth-flow",
        "content": "Inspect auth flow",
        "status": "completed"
      }
    },
    {
      "kind": "added",
      "id": "add-refresh-tests",
      "before": null,
      "after": {
        "id": "add-refresh-tests",
        "content": "Add tests for refresh flow",
        "status": "pending"
      }
    }
  ],
  "summary": {
    "total": 3,
    "active": 2,
    "pending": 1,
    "in_progress": 1,
    "completed": 1,
    "cancelled": 0
  }
}
```

## Change event model

Recommended `changes[*].kind` values:
- `added`
- `updated`
- `removed`

Question:
Should `cancelled` be a status-only update or a removal?

Recommendation:
- keep `cancelled` as a status update, not a structural removal
- if the system later wants cleanup, a separate pruning behavior can remove cancelled/completed items

Why:
- preserves auditability
- keeps semantics explicit
- avoids hiding superseded work too early

## Suggested tool behavior examples

### Example 1: Read current work

Request:
```json
{}
```

Tool:
- `todo_read`

Meaning:
- show current ordered task state

### Example 2: Add initial plan tasks

Request:
```json
{
  "mode": "replace",
  "todos": [
    { "id": "inspect-auth-flow", "content": "Inspect auth flow", "status": "in_progress" },
    { "id": "implement-token-refresh", "content": "Implement token refresh", "status": "pending" },
    { "id": "add-refresh-tests", "content": "Add tests for refresh flow", "status": "pending" }
  ]
}
```

Meaning:
- replace current list with the planned execution stack

### Example 3: Mark a step complete and next step active

Request:
```json
{
  "mode": "merge",
  "todos": [
    { "id": "inspect-auth-flow", "content": "Inspect auth flow", "status": "completed" },
    { "id": "implement-token-refresh", "content": "Implement token refresh", "status": "in_progress" }
  ]
}
```

Meaning:
- progress the execution state without rewriting the whole list

### Example 4: Add a newly discovered subtask

Request:
```json
{
  "mode": "merge",
  "todos": [
    { "id": "migrate-token-cache", "content": "Migrate token cache serialization", "status": "pending" }
  ]
}
```

Meaning:
- keep current work and append a newly discovered task

### Example 5: Cancel a superseded task

Request:
```json
{
  "mode": "merge",
  "todos": [
    { "id": "old-refresh-approach", "content": "Implement old refresh approach", "status": "cancelled" }
  ]
}
```

Meaning:
- mark the task inactive without erasing its history

## Interaction with plan-mode

Recommended future alignment:
- Muse produces plan tasks that can map directly into `TodoItem[]`
- plan execution can hydrate `todo_write(mode=replace)` from a plan artifact
- Daedalus can then advance execution through incremental `merge` writes

This suggests the proposed API is a good bridge between planning and execution.

## Interaction with subagents

### Daedalus
- primary writer and reader
- owns overall task ordering and active task selection

### Muse
- likely writer in `replace` mode when establishing a fresh execution plan
- may write in `merge` mode when refining a plan

### Worker
- likely writer in `merge` mode for status updates on delegated lanes
- should not rewrite full list casually

### Sage
- usually `todo_read` only
- rare writer, except perhaps when acting as a user-facing primary agent in analysis mode

## Compatibility strategy

Recommended compatibility path:

### Phase 1
- add `todo_read`
- add `todo_write`
- keep old `todo` tool for compatibility

### Phase 2
- update prompts and role docs to prefer new tools
- update plan-mode / subagent flows
- add richer UI rendering for statuses

### Phase 3
- soft-deprecate legacy `todo`
- add migration layer if needed

### Phase 4
- remove legacy action-enum tool after adoption confidence is high

## Recommendation summary

Recommended Daedalus v1 target:
- split tools: `todo_read`, `todo_write`
- structured item model: `{id, content, status}`
- statuses: `pending`, `in_progress`, `completed`, `cancelled`
- `todo_write` modes: `merge`, `replace`
- stable string IDs
- write result includes `changes` + full `todos` + `summary`

This gives Daedalus:
- Forge-style discipline and clearer read/write separation
- Hermes-style structured update ergonomics
- a better substrate for Muse, Worker, and plan-mode integration
