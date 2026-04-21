# Forge -> Daedalus Ranked Implementation Roadmap

Status: roadmap draft
Purpose: turn the current design, comparison, deep-dive, and dependency work into an ordered implementation campaign.

## Scope

This roadmap prioritizes Forge-derived changes to Daedalus with emphasis on:
- performance and completion quality first
- UX and polish later
- minimizing rework by respecting dependency order

This roadmap assumes the current design docs under `Forge-Daedalus port/` are the active planning source of truth.

Live implementation status:
- `implementation-status.md` — current milestone progress, verification snapshot, and next-step recommendations

---

## Ranking logic

Items are ranked by the combination of:
1. expected impact on task completion / benchmark performance
2. how foundational the change is for later work
3. how much downstream rework it prevents
4. how strongly it compounds with the rest of the redesign

---

## Milestone 0 — Design Freeze for Current Prompt / Tool Direction

### Goal
Stabilize enough design decisions that implementation work does not churn.

### Includes
- Daedalus / Sage / Muse / Worker prompt set in reviewable shape
- todo redesign direction stable enough for implementation planning
- search tooling direction stable enough for implementation planning

### Why this comes first
Without this, downstream plumbing work may target the wrong role boundaries or tool assumptions.

### Exit criteria
- prompt family is review-ready
- todo API direction is accepted in principle
- `sem_search` / `fs_search` direction is accepted in principle

### Status
Mostly underway already

---

## Milestone 1 — Tool-Call Robustness Hardening

### Priority
Very High

### Why here
This is one of the few improvements that helps almost everything else immediately:
- new tools become safer to introduce
- malformed provider outputs waste fewer turns
- rollout risk drops for richer schemas like `todo_write`, `sem_search`, and `fs_search`

### Main work
- audit current Daedalus tool-call robustness
- add malformed/stringified argument tests
- implement safe coercion/repair where appropriate
- improve error classification and diagnostics

### Depends on
- none, beyond basic design direction

### Enables
- todo redesign
- search tooling redesign
- plan execution primitive
- better multi-provider reliability

### Suggested success metric
- measurable drop in recoverable tool-call failures under non-ideal models/providers

---

## Milestone 2 — Todo Redesign (`todo_read` / `todo_write`)

### Priority
Very High

### Why here
This is the core execution-state substrate for:
- unfinished-work enforcement
- plan execution
- better Worker/Muse progress discipline
- more explicit multi-step tracking

### Main work
- implement `todo_read`
- implement `todo_write`
- adopt structured item model with statuses
- keep legacy `todo` temporarily for migration
- update role docs and prompt assumptions as needed
- update UI rendering for richer states

### Depends on
- Milestone 0
- benefits strongly from Milestone 1

### Enables
- pending-work enforcement
- plan execution primitive
- plan-mode / todo convergence
- role-aware progress behavior

### Suggested success metric
- new todo model is usable in real sessions without depending on toggle semantics

---

## Milestone 3 — Search Tooling Redesign (`sem_search` + `fs_search` contracts)

### Priority
Very High

### Why here
This is the discovery substrate for the new role system:
- Sage needs better semantic discovery
- Muse needs planning-grade codebase discovery
- Daedalus needs cleaner search-tool doctrine

### Main work
- define and implement `sem_search`
- define and implement `fs_search`
- map current `grep` / `find` / `ls` overlap
- update prompt/tool doctrine to prefer semantic vs exact search appropriately
- defer hard deactivation of legacy tools until parity is proven

### Depends on
- Milestone 0
- benefits strongly from Milestone 1

### Enables
- semantic workspace lifecycle
- stronger Sage/Muse performance
- cleaner search behavior overall

### Suggested success metric
- Sage/Muse can reliably perform discovery with less fragmented tool use

---

## Milestone 4 — Pending-Work Enforcement

### Priority
Very High

### Why here
This is one of the clearest direct performance ports from Forge.
It attacks premature stopping, one of the highest-impact failure modes.

### Main work
- define active-work semantics from new todo model
- implement reminder / enforcement hook
- make behavior configurable
- deduplicate reminder spam
- integrate carefully with main-agent completion behavior

### Depends on
- Milestone 2
- informed by prompt/role redesign

### Enables
- stronger completion discipline
- better plan execution reliability
- stronger signals for doom-loop detection

### Suggested success metric
- fewer premature “done” outcomes while active work still exists

---

## Milestone 5 — Semantic Workspace Lifecycle

### Priority
Very High

### Why here
Porting `sem_search` alone is not enough. This makes semantic retrieval trustworthy.

### Main work
- workspace init/sync/status/info lifecycle
- readiness checks for semantic search
- stale index handling strategy
- role-aware use expectations for Daedalus/Sage/Muse

### Depends on
- Milestone 3
- benefits from Milestone 1

### Enables
- reliable semantic search performance
- less stale retrieval
- more confidence in semantically grounded planning/research

### Suggested success metric
- semantic search behaves like a dependable subsystem rather than a best-effort feature

---

## Milestone 6 — Doom-Loop Detection (Phase 1)

### Priority
High

### Why here
By now the system has better task-state and search-state signals, making anti-stall logic more meaningful.

### Main work
- define loop heuristics
- track no-progress / repeated-failure patterns
- inject anti-stall reminders or force re-plan behavior
- avoid excessive false positives early on

### Depends on
- Milestone 2
- Milestone 4
- benefits from Milestone 1

### Enables
- less wasted turn budget
- more recovery from repeated failure patterns

### Suggested success metric
- fewer repeated low-information loops in difficult tasks

---

## Milestone 7 — Plan Execution Primitive (`execute-plan` direction)

### Priority
High

### Why here
At this point:
- Muse exists conceptually
- todo state is stronger
- pending-work enforcement exists
So plan execution can become a real system primitive rather than just a prompt convention.

### Main work
- define plan artifact to todo-state mapping
- implement `execute-plan` primitive (skill/workflow/command or hybrid)
- update progress through `todo_write`
- check completion against remaining plan work

### Depends on
- Milestone 2
- Milestone 4
- informed by prompt/role redesign
- benefits from Milestone 1

### Enables
- tighter Muse -> execution pipeline
- stronger multi-step completion discipline
- easier resumption after interruptions

### Suggested success metric
- plans reliably drive execution instead of being discarded after creation

---

## Milestone 8 — Plan-Mode / Todo Convergence

### Priority
Medium-High

### Why here
This is a convergence/refinement phase after both sides are mature enough.

### Main work
- unify or interoperate plan-mode state with the new todo model
- remove awkward duplication between plan-mode execution tracking and general task state
- align Worker and Muse interactions with the converged model

### Depends on
- Milestone 2
- Milestone 7

### Enables
- cleaner execution-state architecture
- less duplicated logic
- stronger restart/resume behavior

### Suggested success metric
- one coherent mental model for plan state and execution state

---

## Milestone 9 — Role-Aware Performance Tuning

### Priority
Medium-High

### Why here
Only after the main systems exist should you optimize per-role behavior.

### Main work
- tune when Daedalus uses `sem_search` vs `fs_search`
- tune when Muse consults Sage
- tune when Worker reads/writes task state
- tune doom-loop thresholds by role
- tune model/runtime configuration by task type

### Depends on
- Milestones 2–7 in place at minimum

### Enables
- role-specific efficiency gains
- lower noise and better specialization

### Suggested success metric
- each role behaves more predictably and with less cross-role leakage

---

## Milestone 10 — Secondary Performance-Supporting Plumbing

### Priority
Medium

### Includes
- snapshot / undo plumbing improvements
- permission/policy hardening refinements
- compaction configuration ergonomics
- compaction trigger policy tuning
- task-specific model/runtime configuration

### Why later
These are meaningful, but they are not as central as the top substrate + control-loop work.

### Depends on
- broad stabilization of earlier milestones

### Suggested success metric
- system becomes safer and cheaper without undermining completion quality

---

## Milestone 11 — UX and Daily-Driver Pass (Later)

### Priority
Deferred by current strategy

### Includes
- shell integration polish
- commit/suggest UX
- conversation management polish
- session inspectability polish
- shell-native shortcuts

### Why deferred
Useful, but not core to current performance-first goals.

---

## Ranked top 10 implementation priorities

1. Tool-call robustness hardening
2. Todo redesign (`todo_read` / `todo_write`)
3. Search tooling redesign (`sem_search` + `fs_search`)
4. Pending-work enforcement
5. Semantic workspace lifecycle
6. Doom-loop detection (phase 1)
7. Plan execution primitive
8. Plan-mode / todo convergence
9. Role-aware performance tuning
10. Secondary plumbing refinements (undo, policy hardening, compaction ergonomics, task-specific model routing)

---

## Strongest roadmap insight

If you want the shortest possible version of the roadmap:

```text
First fix substrate and reliability.
Then add control loops.
Then connect planning to execution.
Then tune roles.
Then polish UX.
```

And more concretely:

```text
tool robustness
  -> todo/search substrate
    -> unfinished-work + semantic lifecycle
      -> doom-loop + execute-plan
        -> convergence + tuning
```

---

## Recommended next implementation-planning move

After this roadmap, the best next step is to create concrete implementation backlogs for the first three milestones:
1. tool-call robustness hardening
2. todo redesign
3. search tooling redesign

Those are the substrate layer and will determine how cleanly the later performance ports land.
