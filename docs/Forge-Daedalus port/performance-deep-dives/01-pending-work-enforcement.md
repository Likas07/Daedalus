# Deep Dive: Pending-Work Enforcement

Status: deep-dive draft
Priority: Very High

## Why this matters

One of the most common failure modes in coding agents is premature completion:
- the agent believes it is done after partial progress
- the agent forgets unfinished subtasks
- the agent stops after one successful local fix while larger planned work remains

A pending-work enforcement mechanism directly targets this failure mode.

## Forge mechanism

Forge includes `PendingTodosHandler`, which inspects active todos at end-of-turn / end-of-run and injects a reminder if pending or in-progress work still exists.

Key references:
- `harnesses/forgecode/crates/forge_app/src/hooks/pending_todos.rs`
- `harnesses/forgecode/crates/forge_config/src/config.rs` (`verify_todos`)

Observed behavior:
- only active todos (`pending`, `in_progress`) matter
- completed/cancelled tasks do not block
- reminder injection is deduplicated for identical outstanding todo sets
- behavior is configurable

## Why it likely improves performance

This mechanism likely improves:
- multi-step completion rate
- resistance to premature stopping
- alignment between plan and execution
- benchmark success where tasks require multiple dependent steps

It is a direct guard against "LLM satisfaction bias" — the tendency to conclude too early once some visible progress has occurred.

## Current Daedalus state

Daedalus has relevant ingredients but not the same explicit enforcement layer:
- todo tooling exists
- plan-mode tracks plan todo items and execution state
- role redesign is moving toward `todo_read` / `todo_write`

Relevant references:
- `Daedalus/packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- `Daedalus/packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
- redesign docs under `tooling-port/todo-redesign/`

Current gap:
- Daedalus can track work, but there is not yet a clearly specified global unfinished-work completion guard equivalent to Forge's pending todo hook.

## Port thesis

Daedalus should port the behavior, not necessarily the exact architecture.

Target behavior:
- when active work remains, Daedalus should resist concluding the task as complete
- reminder or continuation guidance should be injected only when useful
- the mechanism should work off the future `todo_read` / `todo_write` state model
- plan-mode and general todo state should ideally converge on one notion of "active unfinished work"

## Recommended Daedalus design

### Core rule
Active todos with status:
- `pending`
- `in_progress`

should prevent silent completion unless explicitly overridden.

### Enforcement styles to consider

1. Soft reminder
- inject system/user reminder listing active todos
- allow model to continue naturally

2. Completion veto
- suppress final completion signal if active tasks remain
- require further execution

3. Hybrid
- first reminder softly
- repeated attempts trigger stronger veto behavior

Recommended first pass:
- hybrid, configurable

## Required inputs

This mechanism depends on:
- stable `todo_read` / `todo_write` state
- a way to identify active tasks
- a clear notion of when the model is attempting completion
- deduplication to avoid repetitive reminders

## Key design questions

1. Should pending-work enforcement operate only on main-agent completion, or also on subagent completion?
2. Should plan-mode todos and general todos share the same active-work registry?
3. Should the reminder be framed as:
   - a system reminder
   - a user-style reminder
   - a tool-state reminder
4. Should there be an explicit override flag for tasks where partial completion is acceptable?

## Proposed implementation phases

### Phase 1
- complete todo redesign (`todo_read` / `todo_write`)
- define active-work semantics

### Phase 2
- add a configurable unfinished-work reminder hook
- deduplicate reminder injection by active todo set

### Phase 3
- integrate with plan-mode execution
- optionally add stronger completion veto policy

## Success criteria

- Daedalus stops concluding while active tasks remain
- reminders are informative, not spammy
- completion discipline measurably improves in multi-step tasks
- plan-derived work and ad hoc task tracking behave consistently
