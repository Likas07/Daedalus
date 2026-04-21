# Milestone 4 — Pending-Work Enforcement

Status: backlog draft

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

## Completion criteria
- Daedalus no longer silently finishes with outstanding active tasks unless configured to allow it
