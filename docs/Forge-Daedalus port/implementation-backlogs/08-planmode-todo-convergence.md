# Milestone 8 — Plan-Mode / Todo Convergence

Status: backlog draft

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

## Completion criteria
- one coherent mental model exists for task state across planning and execution
