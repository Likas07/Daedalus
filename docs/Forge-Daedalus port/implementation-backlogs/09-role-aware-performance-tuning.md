# Milestone 9 — Role-Aware Performance Tuning

Status: backlog draft

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

## Completion criteria
- each role behaves efficiently according to its intended lane
