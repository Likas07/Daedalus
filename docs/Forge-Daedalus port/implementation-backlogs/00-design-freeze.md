# Milestone 0 — Design Freeze for Current Prompt / Tool Direction

Status: backlog draft

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

## Completion criteria
- prompt family is stable enough to code against
- todo API is stable enough to implement
- search API direction is stable enough to implement
