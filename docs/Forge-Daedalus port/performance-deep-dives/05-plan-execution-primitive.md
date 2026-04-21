# Deep Dive: Plan Execution as a System Primitive

Status: deep-dive draft
Priority: Very High

## Why this matters

Planning only helps performance if plans reliably translate into execution.
Many agents can produce plans, but fail to use them as durable operational state.
An `execute-plan` primitive closes that gap.

## Forge mechanism

Forge includes an `execute-plan` skill and a service-oriented planning substrate.

Key references:
- `harnesses/forgecode/crates/forge_repo/src/skills/execute-plan/SKILL.md`
- `harnesses/forgecode/crates/forge_app/src/services.rs` (`create_plan`)

Observed properties:
- plans are durable artifacts
- execution is expected to proceed step-by-step until completion
- task state is updated through execution
- completion is verified by re-reading the plan and checking remaining work

## Why it likely improves performance

This improves:
- fidelity between planning and doing
- reduced drift after plan creation
- stronger multi-step completion discipline
- easier resumption after interruption
- better coordination with todo state

## Current Daedalus state

Daedalus already has strong ingredients:
- plan-mode
- extracted todo items from plans
- execution-mode transition
- plan progress tracking
- Muse planning role
- todo redesign direction

Relevant references:
- `Daedalus/packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
- agent-role redesign docs
- todo redesign docs

## Port thesis

Daedalus should treat plan execution as a first-class primitive, not just a prompt convention.

This likely means:
- durable plan artifacts
- an execution engine or execution skill that consumes them
- explicit synchronization with todo state
- completion checks tied to plan state and verification

## Candidate design directions

### Option A: skill-centric
- port an `execute-plan` skill directly into Daedalus's skill system
- use it as the canonical path from Muse plans to execution

### Option B: workflow-native
- evolve current plan-mode into a more durable plan execution system
- make execution state and todo state converge

### Option C: hybrid
- keep workflow-native plan mode
- also expose `execute-plan` as an explicit skill/command for durable artifacts

Recommended direction:
- hybrid

## Required integrations

A real plan execution primitive should integrate with:
- Muse plan artifacts
- `todo_read` / `todo_write`
- pending-work enforcement
- Worker delegated execution lanes
- maybe doom-loop detection (stalled plan steps)

## Design questions

1. Should plan execution be a skill, a command, a workflow mode, or all three?
2. Should plan items map directly to todo items one-to-one?
3. How should subagent lanes report completion back into the plan?
4. Should execution be strictly sequential by default, with explicit parallel lanes only?
5. How should partial failure be represented in the plan artifact?

## Recommended implementation phases

### Phase 1
- stabilize Muse plan format
- stabilize todo redesign
- define mapping between plan steps and todo state

### Phase 2
- create `execute-plan` primitive
- update progress through explicit task-state writes
- add completion verification against remaining plan work

### Phase 3
- integrate with Worker lanes and stalled-step handling

## Success criteria

- plans reliably drive execution rather than being discarded after creation
- interrupted sessions can resume plan execution with minimal confusion
- task completion improves on long multi-step tasks
- Muse + Daedalus + Worker behave like one coherent planning/execution system
