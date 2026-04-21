# Complete Implementation Backlog for Forge -> Daedalus Port

Status: implementation backlog draft
Purpose: provide a complete, milestone-by-milestone implementation backlog for all currently planned Forge -> Daedalus work.

## How to use this document

This is a backlog, not just a roadmap.
For each milestone it includes:
- goal
- dependencies
- concrete implementation tasks
- likely file targets
- verification steps
- completion criteria

The backlog is ordered to minimize rework and maximize compounding gains.

---

# Milestone 0 — Design Freeze for Current Prompt / Tool Direction

## Goal
Stabilize the design artifacts enough that implementation work can proceed without structural churn.

## Dependencies
- none

## Tasks

### M0.1 Finalize Daedalus-New prompt family for implementation readiness
Files:
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Daedalus.md`
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Sage.md`
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Muse.md`
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Worker.md`

Work:
- remove remaining conceptual ambiguity around role boundaries
- confirm tool assumptions match the intended future tool surface
- confirm Daedalus vs Sage vs Muse vs Worker authority boundaries

Verification:
- all four prompts are internally coherent
- no old role assumptions remain (Planner/Reviewer/Scout as separate agents)

### M0.2 Freeze todo API direction
Files:
- `docs/Forge-Daedalus port/tooling-port/todo-redesign/todo-redesign-spec.md`
- `docs/Forge-Daedalus port/tooling-port/todo-redesign/todo-api-proposal.md`
- `docs/Forge-Daedalus port/tooling-port/todo-redesign/todo-migration-matrix.md`

Work:
- confirm `todo_read` / `todo_write`
- confirm item schema (`id`, `content`, `status`)
- confirm merge/replace semantics

Verification:
- no unresolved schema questions block implementation

### M0.3 Freeze search tool direction
Files:
- `docs/Forge-Daedalus port/tooling-port/search-tooling-port/tooling-port-strategy.md`
- `docs/Forge-Daedalus port/tooling-port/search-tooling-port/search-tool-consolidation-matrix.md`

Work:
- confirm `sem_search` and `fs_search` are the intended future-state tools
- confirm which legacy tools are initially retained vs only de-emphasized

Verification:
- enough clarity exists to begin implementation without rethinking search doctrine mid-stream

## Milestone completion criteria
- prompt family is stable enough to code against
- todo API is stable enough to implement
- search API direction is stable enough to implement

---

# Milestone 1 — Tool-Call Robustness Hardening

## Goal
Make Daedalus tool invocation more resilient before introducing richer tool schemas.

## Dependencies
- Milestone 0 design stability

## Tasks

### M1.1 Audit current tool-call ingestion path
Likely files:
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- tool wrapping / schema files under `packages/coding-agent/src/core/tools/`
- provider / model integration code in `packages/ai` and related call sites

Work:
- trace where tool call JSON is parsed and validated
- identify current handling for malformed or stringified arguments
- identify provider/model-specific weak spots

Verification:
- document current failure modes and gaps

### M1.2 Add regression tests for malformed tool-call payloads
Likely test targets:
- `packages/coding-agent/src/**/__tests__/...`
- or existing test dirs under relevant core/tool modules

Test cases:
- stringified object arguments
- enum casing mismatches where safe to normalize
- arrays vs singleton objects where unsafe/safe distinctions matter
- partial/malformed JSON that can be repaired safely

Verification:
- failing tests demonstrate current gaps

### M1.3 Implement safe coercion/repair layer
Likely files:
- provider response normalization layer
- tool dispatch layer
- schema validation helpers

Work:
- support safe repair for recoverable argument shapes
- classify recoverable vs unrecoverable failures
- keep strictness for dangerous operations where coercion would be risky

Verification:
- regression tests pass
- normal tool behavior unchanged

### M1.4 Improve tool-call diagnostics
Likely files:
- tool execution result formatting
- error rendering / UI reporting
- RPC/logging surfaces if applicable

Work:
- produce clearer error messages for invalid arguments
- distinguish repaired-call success from unrecoverable failure
- optionally log coercion/repair events for debugging

Verification:
- diagnostics are inspectable and actionable

## Milestone completion criteria
- recoverable malformed tool calls succeed more often
- regression suite exists for bad-call cases
- richer tools can be added with lower rollout risk

---

# Milestone 2 — Todo Redesign (`todo_read` / `todo_write`)

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

## Milestone completion criteria
- `todo_read` / `todo_write` work reliably
- old toggle semantics are no longer required for new workflows
- role docs and prompt set can truthfully assume the new model

---

# Milestone 3 — Search Tooling Redesign (`sem_search` + `fs_search`)

## Goal
Introduce a cleaner discovery substrate modeled after Forge's semantic vs exact split.

## Dependencies
- Milestone 0
- strongly benefits from Milestone 1

## Tasks

### M3.1 Implement `fs_search`
Likely files:
- search tool registration and implementation under `packages/coding-agent/src/core/tools/` or `extensions/daedalus/tools/`
- search/prompt snippets and bundle registration

Work:
- regex content search
- path scoping
- glob filtering
- output modes
- context/line number controls
- offset/limit handling

Verification:
- feature parity with documented target behavior
- known `grep` / `find` common use cases are covered

### M3.2 Implement `sem_search`
Likely files:
- new semantic search tool implementation
- provider/service interface for semantic retrieval
- prompt snippets / tool definitions

Work:
- define multi-query or at least future-extensible query schema
- implement semantic retrieval path
- return role-usable results for Sage/Muse/Daedalus

Verification:
- semantic discovery works in unfamiliar codebase tasks
- search results are meaningfully different from exact grep-only behavior

### M3.3 Update prompt/tool doctrine
Likely files:
- prompt docs
- system prompt generation files
- role prompt docs if mirrored in code later

Work:
- teach semantic discovery vs exact search split
- reduce fragmented old search doctrine

Verification:
- prompts consistently recommend `sem_search` vs `fs_search` appropriately

### M3.4 Soft-deprecate overlapping legacy search tools in prompts
Likely files:
- prompt generation
- role docs
- maybe bundle defaults

Work:
- stop teaching `grep` / `find` / `ls` as first-line discovery tools where `fs_search` / `sem_search` supersede them
- keep tools alive until parity is proven

Verification:
- search behavior in prompts is simpler and more consistent

### M3.5 Add search test suite
Tests:
- exact content search
- file listing mode
- count mode
- context/offset/limit behavior
- semantic search baseline behavior
- malformed search inputs

## Milestone completion criteria
- `sem_search` and `fs_search` exist and are usable
- role docs can rely on them
- search fragmentation starts shrinking without risky hard removals

---

# Milestone 4 — Pending-Work Enforcement

## Goal
Prevent premature completion when active work remains.

## Dependencies
- Milestone 2
- role/prompt redesign

## Tasks

### M4.1 Define active-work semantics in runtime code
Likely files:
- new todo model implementation
- session metrics/state helpers

Work:
- define active work as `pending` + `in_progress`
- define inactive work as `completed` + `cancelled`

Verification:
- semantics are centralized, not duplicated ad hoc

### M4.2 Implement unfinished-work reminder hook
Likely files:
- conversation end / completion evaluation hooks
- orchestration layer / agent session lifecycle
- reminder rendering utilities

Work:
- inspect todo state at completion boundary
- inject reminder when active work exists
- deduplicate repeated reminders for unchanged active sets

Verification:
- reminder appears once for unchanged outstanding tasks
- reminder updates when task set changes

### M4.3 Add configurability
Likely files:
- settings/config schema
- settings manager
- docs for config behavior

Work:
- add enable/disable config
- maybe later soft/hard enforcement modes

Verification:
- feature can be toggled cleanly

### M4.4 Add tests
Tests:
- no reminder when no active tasks
- reminder when active tasks exist
- no duplicate reminder for unchanged active set
- reminder updates when task set changes

## Milestone completion criteria
- Daedalus no longer silently finishes with outstanding active tasks unless configured to allow it

---

# Milestone 5 — Semantic Workspace Lifecycle

## Goal
Turn semantic search into a dependable subsystem with indexing lifecycle support.

## Dependencies
- Milestone 3
- strongly benefits from Milestone 1

## Tasks

### M5.1 Define workspace/index lifecycle surface
Likely files:
- semantic search service layer
- workspace/index management code
- config/settings docs

Work:
- workspace init
- workspace sync / resync
- workspace status
- workspace info
- readiness model for semantic search

Verification:
- lifecycle states are clearly representable and inspectable

### M5.2 Implement indexing state and readiness checks
Work:
- detect uninitialized workspace
- detect stale/outdated state if supported
- block/fallback appropriately when semantic search is not ready

Verification:
- semantic search can report readiness cleanly

### M5.3 Integrate role-aware usage expectations
Likely files:
- prompt docs and role docs
- maybe tool metadata/prompt snippets

Work:
- Sage/Muse/Daedalus prompt guidance should reflect readiness-aware use of semantic search

Verification:
- prompt doctrine matches system behavior

### M5.4 Add tests
Tests:
- workspace init
- sync status
- readiness failures
- indexed query path
- stale/unavailable lifecycle behavior

## Milestone completion criteria
- `sem_search` is supported by a coherent lifecycle rather than existing as a blind retrieval tool

---

# Milestone 6 — Doom-Loop Detection (Phase 1)

## Goal
Detect and interrupt low-value repeated behavior.

## Dependencies
- Milestone 2
- Milestone 4
- strongly benefits from Milestone 1

## Tasks

### M6.1 Define loop heuristics
Likely files:
- orchestration/session runtime
- event/state tracking helpers

Candidate signals:
- repeated failed commands
- no task-state change for many turns
- repeated completion attempts with active tasks
- repeated similar reads/searches with no progress

Verification:
- heuristics are explicit and testable

### M6.2 Implement soft anti-stall intervention
Work:
- inject reminder / reflection prompt
- encourage strategy change or re-plan

Verification:
- interventions appear on repeat-stall patterns

### M6.3 Integrate with todo and completion signals
Work:
- use active task state and unfinished-work reminders as loop signals

Verification:
- detector uses real state, not just text heuristics

### M6.4 Add tests
Tests:
- repeated failure pattern detection
- no false trigger on healthy long tasks
- trigger on repeated completion-with-active-work pattern

## Milestone completion criteria
- Daedalus is less likely to burn turns repeating ineffective behavior

---

# Milestone 7 — Plan Execution Primitive

## Goal
Make plans executable operational state, not disposable prose.

## Dependencies
- Milestone 2
- Milestone 4
- role redesign
- benefits from Milestone 1

## Tasks

### M7.1 Freeze plan artifact format for execution
Likely files:
- Muse docs/specs
- plan-mode docs/specs
- maybe plan helper implementation files

Work:
- define how plan steps map to todo items
- define how parallel lanes are represented
- define how verification criteria are stored

Verification:
- plan format is stable enough to automate against

### M7.2 Implement `execute-plan` primitive
Likely files:
- skill implementation / workflow command layer
- plan-mode integration
- maybe new execution helper modules

Work:
- load plan artifact
- initialize execution state
- drive stepwise progress updates
- mark completion via todo state

Verification:
- plan can be resumed and advanced through a real primitive

### M7.3 Integrate with pending-work enforcement
Work:
- ensure active plan steps appear as active work
- prevent plan from being considered complete prematurely

Verification:
- execution + enforcement cooperate cleanly

### M7.4 Add tests
Tests:
- initialize from plan artifact
- resume partially completed plan
- mark steps complete
- detect unfinished plan state

## Milestone completion criteria
- Muse-produced plans can reliably drive execution

---

# Milestone 8 — Plan-Mode / Todo Convergence

## Goal
Reduce duplicated execution-state systems.

## Dependencies
- Milestone 2
- Milestone 7

## Tasks

### M8.1 Audit overlap between plan-mode todoItems and new todo model
Likely files:
- `packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
- new todo tooling files

Work:
- identify duplicated state transitions
- identify migration path to shared substrate or clean interoperability

Verification:
- overlap is documented clearly before refactor

### M8.2 Refactor plan-mode to use or interoperate with the new todo substrate
Work:
- remove duplicated state where sensible
- preserve user-visible plan-mode behavior

Verification:
- plan-mode and general task tracking no longer fight each other

### M8.3 Update tests and docs
Verification:
- plan-mode and todo behavior are consistent in resumed/branched sessions

## Milestone completion criteria
- one coherent mental model exists for task state across planning and execution

---

# Milestone 9 — Role-Aware Performance Tuning

## Goal
Tune behavior by role only after the underlying systems exist.

## Dependencies
- Milestones 2 through 7 minimum

## Tasks

### M9.1 Tune search defaults by role
Work:
- Daedalus: semantic-first for ambiguous discovery
- Sage: strongest semantic reliance
- Muse: semantic + exact planning support
- Worker: mostly exact + read, semantic only when scoped need exists

### M9.2 Tune todo interaction by role
Work:
- Daedalus owns execution-state discipline
- Muse writes plan-derived state
- Worker performs narrow progress writes
- Sage usually read-only

### M9.3 Tune anti-stall thresholds by role
Work:
- Daedalus vs Worker vs Sage may need different tolerance for repetition

### M9.4 Tune model/runtime selection by role/task
Work:
- compaction model
- Muse planning model
- Worker execution model if useful

Verification:
- role behaviors feel sharper with less cross-role leakage

## Milestone completion criteria
- each role behaves efficiently according to its intended lane

---

# Milestone 10 — Secondary Plumbing Refinements

## Goal
Improve safety, efficiency, and maintainability after core systems are stable.

## Dependencies
- earlier milestone stabilization

## Tasks

### M10.1 Snapshot / undo improvements
Likely files:
- file mutation and safety layers
- undo/rollback helpers

### M10.2 Policy / permission refinements
Likely files:
- `extensions/daedalus/safety/*`
- settings/config surfaces

### M10.3 Compaction configuration ergonomics
Likely files:
- compaction config/schema/settings
- RPC/UI settings if exposed

### M10.4 Task-specific model/runtime configuration
Likely files:
- settings-manager
- provider/model selection logic
- subagent runtime config

Verification:
- safer mutation, cleaner cost/performance tradeoffs, lower operational friction

## Milestone completion criteria
- substrate is stronger and more tunable without destabilizing earlier gains

---

# Milestone 11 — UX / Daily-Driver Pass (Deferred)

## Goal
Polish the user-facing workflow after performance-critical plumbing is done.

## Dependencies
- all major performance layers reasonably stable

## Tasks
Potential areas:
- shell-native workflows
- commit / suggest UX
- conversation management polish
- inspectability commands / dashboards
- provider login polish
- zsh or other shell integrations if desired

## Milestone completion criteria
- Daedalus is pleasant and efficient as a daily driver, not only performant internally

---

# Cross-milestone test and verification track

These should run continuously across the campaign rather than only at the end.

## T0. Regression harness updates
Work:
- add tests for new tool surfaces
- add tests for migrated role assumptions
- add tests for execution-state / completion semantics

## T1. Performance probes / evals
Work:
- benchmark representative multi-step tasks
- compare premature completion rates
- compare search effectiveness
- compare loop/stall frequency

## T2. Backward compatibility checks
Work:
- ensure staged migrations do not break current sessions abruptly
- validate legacy tool behavior where temporarily retained

---

# Backlog order summary

## Absolute first wave
1. Milestone 1 — Tool-call robustness hardening
2. Milestone 2 — Todo redesign
3. Milestone 3 — Search tooling redesign

## Second wave
4. Milestone 4 — Pending-work enforcement
5. Milestone 5 — Semantic workspace lifecycle
6. Milestone 6 — Doom-loop detection

## Third wave
7. Milestone 7 — Plan execution primitive
8. Milestone 8 — Plan-mode / todo convergence
9. Milestone 9 — Role-aware performance tuning

## Later refinement
10. Milestone 10 — Secondary plumbing refinements
11. Milestone 11 — UX / daily-driver pass

---

# Strongest implementation guidance

If you only remember one implementation rule, use this:

```text
Do not build control loops on unstable substrate.
First harden tool calls, todo state, and search state.
Then add unfinished-work enforcement, semantic lifecycle, and anti-stall logic.
Then make planning executable.
Then tune and polish.
```

That is the intended implementation discipline for this whole Forge -> Daedalus campaign.
