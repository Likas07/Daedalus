# Milestone 5 — Semantic Workspace Lifecycle

Status: backlog draft

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

## Completion criteria
- `sem_search` is supported by a coherent lifecycle rather than existing as a blind retrieval tool
