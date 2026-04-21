# Milestone 7 — Plan Execution Primitive (`execute-plan` direction)

Status: backlog draft

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

## Completion criteria
- Muse-produced plans can reliably drive execution
