# Forge / Hermes / Daedalus Tooling Comparison

Status: review artifact
Purpose: side-by-side design reference for reviewing how Daedalus should port or adapt search and todo tooling from Forge and Hermes.

## How to use this document

For each tooling area below:
- "Current Daedalus" describes the existing state in Daedalus
- "Forge baseline" captures the Forge model worth porting or adapting
- "Hermes baseline" captures relevant structured-tooling ideas from Hermes when applicable
- "Target Daedalus direction" states the intended design
- "What is being copied" identifies high-confidence transferable behavior
- "What is being adapted" identifies intentional deviations

This is not an implementation spec.
It is a comparison artifact meant to support design review.

---

## 1. Search Tooling

### Current Daedalus
Daedalus currently exposes a more fragmented search/discovery surface, including:
- `grep`
- `find`
- `ls`
- `read`
- shell/ripgrep-oriented search patterns
- some prompt guidance around manual discovery

Daedalus also has stronger edit tooling already in place (`hashline_edit`, `ast_grep`, `ast_edit`), but semantic discovery is not yet represented in the same first-class way as Forge.

### Forge baseline
Forge exposes a clearer two-track search model:
- `sem_search`
- `fs_search`

Observed strengths:
- `sem_search` is treated as the default discovery tool for understanding unfamiliar code
- `fs_search` acts as a unified exact-search/filesystem search surface
- search ergonomics are cleaner because the model has fewer overlapping discovery choices
- prompts explicitly teach when to use semantic discovery vs exact search

### Hermes baseline
Hermes contributes a strong abstraction lesson rather than a direct one-to-one port here:
- tools tend to have clear scopes and structured parameters
- search/file tooling is typically organized to reduce shell overuse
- the system encourages using dedicated tools instead of terminal commands for file discovery

### Target Daedalus direction
Daedalus should move toward:
- `sem_search` as the main semantic discovery tool
- `fs_search` as the main exact/pattern/filesystem search tool
- de-emphasis or deactivation of overlapping legacy search tools only after parity is proven

### What is being copied
From Forge:
- semantic-search-first discovery doctrine
- unified exact-search surface via `fs_search`
- clearer prompt guidance about tool selection

### What is being adapted
For Daedalus:
- legacy tools may remain temporarily during migration
- `read` is preserved as a separate file-reading primitive
- consolidation should happen only after workflow and regression validation
- search tools must fit Daedalus's role system (Daedalus, Sage, Muse, Worker)

### Why the adaptation exists
Daedalus has more pre-existing search tool fragmentation than Forge in this area, so the migration needs a staged consolidation path instead of a hard replacement.

---

## 2. Todo Tooling

### Current Daedalus
Daedalus currently has a single `todo` tool with action-enum semantics:
- `list`
- `add`
- `toggle`
- `clear`

Item shape is simple:
- numeric id
- text
- done boolean

Observed strengths:
- simple and already integrated into branch/session reconstruction
- lightweight UI support already exists

Observed weaknesses:
- boolean completion model is too weak
- toggle semantics are ambiguous
- read and write are mixed together in one action-based interface
- no first-class `in_progress`
- no clear diff-style write result model
- no strong unfinished-work enforcement behavior

### Forge baseline
Forge uses:
- `todo_read`
- `todo_write`

Observed strengths:
- explicit status lifecycle:
  - pending
  - in_progress
  - completed
  - cancelled
- read/write tool split
- unfinished todo enforcement via `PendingTodosHandler`
- resume-time reinjection of active todos into conversation context
- todo list treated as execution state, not just a scratchpad

### Hermes baseline
Hermes uses a structured todo model with:
- stable string ids
- explicit statuses
- structured array updates
- merge/update semantics
- guidance around a single `in_progress` item

Observed strengths:
- clean structured item model
- explicit status transitions
- clearer update semantics than action enums
- stable IDs under model control

### Target Daedalus direction
Daedalus should move toward:
- Forge-style split: `todo_read` + `todo_write`
- Hermes-style structured item schema
- Forge-inspired enforcement behavior
- Daedalus-specific branch/session/UI integration

### What is being copied
From Forge:
- read/write split
- active-work enforcement concept
- resume-time reinjection of active todos
- todo state as execution state

From Hermes:
- structured item schema
- string IDs
- explicit statuses
- merge/replace style update semantics

### What is being adapted
For Daedalus:
- preserve branch-aware reconstruction
- integrate with plan-mode and subagent workflows over time
- keep migration path from legacy `todo`
- avoid Forge's content-matching approach in favor of stable IDs

### Why the adaptation exists
Forge's behavioral model is stronger, but Hermes offers a cleaner structured API shape. Daedalus benefits from combining the two rather than cloning either one exactly.

---

## 3. Search: Role-by-Role Impact

### Daedalus
Target behavior:
- use `sem_search` for grounded discovery in ambiguous codebase work
- use `fs_search` for exact lookup and filtering
- stop relying on fragmented legacy search habits once parity exists

### Sage
Target behavior:
- highest-value consumer of `sem_search`
- use `fs_search` for exact evidence gathering
- become markedly stronger at fast recon + deep research through better discovery tools

### Muse
Target behavior:
- use `sem_search` to refine planning with real codebase evidence
- use `fs_search` when planning depends on exact strings/files/config facts

### Worker
Target behavior:
- mostly use `fs_search` and `read`
- use `sem_search` only when scoped discovery inside the assigned lane is truly needed

---

## 4. Todo: Role-by-Role Impact

### Daedalus
Target behavior:
- primary owner of execution-state discipline
- use `todo_read` to inspect current state
- use `todo_write` to create, update, and refine task state
- enforce stronger completion discipline

### Sage
Target behavior:
- mostly read-only consumer of todo state
- may read current execution state for context
- rarely writes, except in special user-facing analysis flows if ever

### Muse
Target behavior:
- use `todo_write` when converting plans into execution-state artifacts
- establish or rewrite plan-derived task state explicitly

### Worker
Target behavior:
- use `todo_read` when it helps lane alignment
- use `todo_write` for narrow progress updates
- report explicit status transitions rather than toggle-style completions

---

## 5. Design Thesis Summary

### Search thesis
Daedalus should become more Forge-like by simplifying the discovery surface:
- semantic discovery -> `sem_search`
- exact/pattern/filesystem search -> `fs_search`

### Todo thesis
Daedalus should become more Forge-like behaviorally and more Hermes-like structurally:
- Forge-like split and enforcement
- Hermes-like item schema and update semantics
- Daedalus-specific orchestration and integration

---

## 6. Review checklist

Questions to ask during tooling review:

### Search
1. Does `sem_search` become the default discovery tool in prompts and role docs?
2. Does `fs_search` truly subsume the practical role of current fragmented search tools?
3. Are any retained legacy tools still justified after consolidation?
4. Is search behavior becoming simpler for the model rather than more confusing?

### Todo
5. Does the split into `todo_read` / `todo_write` make the API clearer than the current action-enum tool?
6. Are explicit statuses replacing toggle-style thinking everywhere?
7. Is unfinished-work discipline becoming stronger without making the system awkward?
8. Does the new todo design fit cleanly with Muse, Worker, and plan-mode?

---

## 7. Current judgment

At this stage, the intended tooling direction can be summarized as:
- Search: port Forge's two-track model (`sem_search` + `fs_search`) into Daedalus and consolidate legacy search surfaces carefully
- Todos: combine Forge's behavioral discipline with Hermes's structured API model, then integrate that into Daedalus's orchestration and plan-mode workflows

That is the current tooling target design.
