# Cross-Milestone Test and Verification Track

Status: backlog draft

## Goal
Maintain verification discipline across the whole campaign.

## Tasks

### T0. Regression harness updates
Work:
- add tests for new tool surfaces
- add tests for migrated role assumptions
- add tests for execution-state / completion semantics

### T1. Performance probes / evals
Work:
- benchmark representative multi-step tasks
- compare premature completion rates
- compare search effectiveness
- compare loop/stall frequency

### T2. Backward compatibility checks
Work:
- ensure staged migrations do not break current sessions abruptly
- validate legacy tool behavior where temporarily retained
