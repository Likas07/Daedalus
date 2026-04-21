# Deep Dive: Doom-Loop Detection

Status: deep-dive draft
Priority: Very High

## Why this matters

Agents often waste significant budget repeating ineffective behavior:
- retrying the same failed command with no new information
- repeatedly inspecting the same area without progressing
- oscillating between equivalent states
- claiming intent to continue without state change

A doom-loop detector is one of the clearest plumbing features that can improve real completion rate.

## Forge mechanism

Forge references `DoomLoopDetector` in app wiring/orchestration paths.

Key references:
- `harnesses/forgecode/crates/forge_app/src/app.rs`
- `harnesses/forgecode/crates/forge_app/src/orch_spec/orch_runner.rs`

Observed takeaway:
- Forge explicitly models stall/loop risk as part of orchestration
- this is likely treated as a runtime safeguard, not a prompt-only heuristic

## Why it likely improves performance

This affects:
- effective turn budget
- resistance to local minima
- ability to recover from failure
- lower wasted tool-call volume
- better multi-step completion under bounded turns

## Current Daedalus state

Daedalus already has:
- todo/plan structures emerging
- subagent orchestration
- compaction and branch summaries
- safety constraints

But the design set does not yet clearly specify a first-class doom-loop detector.

## Port thesis

Daedalus should gain an explicit anti-stall mechanism.
This should be treated as runtime control logic, not merely prompt wording.

## Candidate loop signals

Potential signals to detect:
- repeated identical or near-identical failed commands
- no task-state changes across many turns
- repeated revisiting of same files with no mutation or conclusion
- repeated summary text with low information gain
- repeated subagent delegations yielding no new actionable result
- repeated attempts to conclude while unfinished work remains

## Candidate responses

1. Soft reflection prompt
- inject reminder that progress has stalled
- ask the model to change strategy

2. Forced re-plan
- require plan update / todo rewrite before continuing

3. Tool restriction / intervention
- block repeating same failing action pattern

4. Escalation to alternate lane
- invoke Sage, Muse, or another role when current lane is stuck

Recommended first pass:
- soft reflection + forced re-plan triggers

## Design questions

1. Should doom-loop detection be global or role-specific?
2. Should Daedalus and Worker have different stall thresholds?
3. Should repeated failed commands count more heavily than repeated reads?
4. Should the detector integrate with pending-work enforcement and todo stagnation?
5. Should loop state itself be visible in diagnostics/UI?

## Recommended implementation phases

### Phase 1
- define loop heuristics
- record simple progress indicators across turns

### Phase 2
- inject anti-stall reminders / force re-plan behavior
- connect to todo stagnation and repeated failure patterns

### Phase 3
- add role-specific tuning and better diagnostics

## Success criteria

- fewer wasted turns on repeated ineffective actions
- more strategy changes after failure
- better completion on tasks that currently stall or oscillate
- less silent budget burn in long sessions
