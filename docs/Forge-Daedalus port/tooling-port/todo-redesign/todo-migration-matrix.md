# Todo Migration Matrix: Current Daedalus -> Proposed `todo_read` / `todo_write`

Status: migration planning draft
Scope: transition mapping only; no implementation changes yet
Workspace target: `/home/likas/Research/Daedalus`

## Purpose

Map the current Daedalus `todo` action-enum tool:
- `list`
- `add`
- `toggle`
- `clear`

to the proposed future API:
- `todo_read`
- `todo_write`

This document is meant to help:
- prompt migration
- internal workflow migration
- compatibility layer design
- UI/result rendering migration

## Current Daedalus API

Current request shape:

```json
{
  "action": "list" | "add" | "toggle" | "clear",
  "text": "...",   // add only
  "id": 1           // toggle only
}
```

Current item shape:

```json
{
  "id": 1,
  "text": "Inspect auth flow",
  "done": false
}
```

## Proposed API recap

### `todo_read`
Request:
```json
{}
```

### `todo_write`
Request:
```json
{
  "mode": "merge" | "replace",
  "todos": [
    {
      "id": "inspect-auth-flow",
      "content": "Inspect auth flow",
      "status": "pending"
    }
  ]
}
```

## Migration matrix

| Current operation | Current meaning | Proposed equivalent | Notes |
|---|---|---|---|
| `todo(action='list')` | Return current list | `todo_read({})` | Direct replacement |
| `todo(action='add', text='X')` | Append new unfinished item | `todo_write({ mode: 'merge', todos: [{ id, content: 'X', status: 'pending' }] })` | Requires stable string ID generation |
| `todo(action='toggle', id=N)` from undone -> done | Mark item complete | `todo_write({ mode: 'merge', todos: [{ id, content, status: 'completed' }] })` | Proposed API is explicit, not toggle-based |
| `todo(action='toggle', id=N)` from done -> undone | Reopen item | `todo_write({ mode: 'merge', todos: [{ id, content, status: 'pending' }] })` or `in_progress` | Must decide intended reopened state |
| `todo(action='clear')` | Remove all items | `todo_write({ mode: 'replace', todos: [] })` | Direct semantic replacement |

## Action-by-action migration notes

### 1. `list`

Current:
```json
{ "action": "list" }
```

Target:
```json
{}
```
with tool:
```text
todo_read
```

Migration assessment:
- trivial
- safest and cleanest direct mapping
- prompts should stop teaching action enums and instead use `todo_read`

### 2. `add`

Current:
```json
{ "action": "add", "text": "Inspect auth flow" }
```

Target:
```json
{
  "mode": "merge",
  "todos": [
    {
      "id": "inspect-auth-flow",
      "content": "Inspect auth flow",
      "status": "pending"
    }
  ]
}
```

Migration assessment:
- semantically straightforward
- operationally requires stable string IDs

Recommendation:
- do not hide ID generation if avoidable
- teach prompts/examples to create stable readable IDs

Fallback compatibility option:
- temporary adapter can generate IDs if omitted during migration phase

### 3. `toggle`

Current:
```json
{ "action": "toggle", "id": 3 }
```

Problem:
- `toggle` is ambiguous in the new model
- explicit status is preferred over implicit inversion

Migration rule:
- replace `toggle` behavior with explicit status writes

Examples:

Mark complete:
```json
{
  "mode": "merge",
  "todos": [
    {
      "id": "inspect-auth-flow",
      "content": "Inspect auth flow",
      "status": "completed"
    }
  ]
}
```

Mark active:
```json
{
  "mode": "merge",
  "todos": [
    {
      "id": "implement-token-refresh",
      "content": "Implement token refresh",
      "status": "in_progress"
    }
  ]
}
```

Migration assessment:
- this is the biggest semantic change
- prompts and UI should stop thinking in terms of toggles entirely

Recommendation:
- never emulate `toggle` in the new prompt docs
- always convert to explicit status transitions

### 4. `clear`

Current:
```json
{ "action": "clear" }
```

Target:
```json
{
  "mode": "replace",
  "todos": []
}
```

Migration assessment:
- straightforward
- should be treated as a strong operation

Recommendation:
- use sparingly in prompts
- prefer `replace` when re-planning from scratch, not casual clearing

## Legacy field mapping

| Current field | Proposed field | Migration rule |
|---|---|---|
| `id: number` | `id: string` | Convert to stable string ID; do not preserve integer identity long-term |
| `text` | `content` | Rename directly |
| `done: boolean` | `status` | `false -> pending` by default, `true -> completed` |

## Recommended default conversion rules for stored legacy state

If migrating existing session todo state:

| Legacy value | Proposed value |
|---|---|
| `done = false` | `status = 'pending'` |
| `done = true` | `status = 'completed'` |

Recommended ID conversion for existing items:
- temporary migration can use a stable string form such as `legacy-<number>`
- long-term prompts should stop producing integer IDs entirely

Example:

```json
{
  "id": 3,
  "text": "Inspect auth flow",
  "done": false
}
```

becomes:

```json
{
  "id": "legacy-3",
  "content": "Inspect auth flow",
  "status": "pending"
}
```

## Prompt migration guidance

### Old prompting style to retire
- “Use todo with action add/list/toggle/clear”
- “toggle the todo when finished”
- “clear the todo list” as a routine reset action

### New prompting style to adopt
- “Use `todo_read` to inspect the current execution state”
- “Use `todo_write` in `merge` mode for incremental updates”
- “Use `todo_write` in `replace` mode when rewriting the full execution plan”
- “Use explicit statuses: pending, in_progress, completed, cancelled”

## UI migration implications

Current UI assumptions:
- done vs not done
- toggle semantics
- numeric IDs

New UI needs:
- status-aware rendering
- distinct visual treatment for:
  - pending
  - in_progress
  - completed
  - cancelled
- string IDs or hidden IDs depending on display choice
- better write-result rendering showing changed tasks and status transitions

## Compatibility layer recommendation

Recommended transitional adapter behavior:

### Legacy action `list`
- translate to `todo_read`

### Legacy action `add`
- translate to `todo_write(mode='merge')`
- generate ID if absent from old-style call

### Legacy action `toggle`
- adapter must inspect current item state
- if current status is pending/in_progress -> set completed
- if current status is completed -> set pending
- but this should exist only for backward compatibility, not as a new first-class design

### Legacy action `clear`
- translate to `todo_write(mode='replace', todos=[])`

Recommendation:
- support this adapter temporarily
- do not expose it as the preferred model-facing API once prompts are migrated

## Migration priority

### Phase 1
- ship `todo_read` and `todo_write`
- keep legacy `todo`
- add compatibility translation where useful

### Phase 2
- update prompts, specs, and role docs
- update UI/result rendering
- migrate internal flows away from `toggle`

### Phase 3
- deprecate legacy `todo`
- remove old action-enum semantics once prompt/tool usage is stable

## Success criteria

The migration is successful if:
- current `list/add/toggle/clear` semantics are fully representable in the new API
- new prompts no longer depend on toggle-style thinking
- old sessions can be upgraded safely
- the new API is clearer for the model than the old action-enum tool
- the system can evolve toward richer execution-state management without another schema rewrite
