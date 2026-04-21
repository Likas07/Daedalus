# Milestone 10 — Secondary Plumbing Refinements

Status: backlog draft

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

## Completion criteria
- substrate is stronger and more tunable without destabilizing earlier gains
