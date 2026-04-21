# Milestone 6 — Doom-Loop Detection (Phase 1)

Status: backlog draft

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

## Completion criteria
- Daedalus is less likely to burn turns repeating ineffective behavior
