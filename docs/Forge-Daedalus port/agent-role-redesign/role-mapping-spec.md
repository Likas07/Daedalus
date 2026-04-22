# Daedalus Role Mapping Spec

Status: implemented architecture spec
Scope: role architecture and its implemented runtime mapping
Workspace target: `/home/likas/Research/Daedalus`

Related status note:
- `current-state-and-next-steps.md` — current runtime state of the role redesign and the runtime source-of-truth decision

## Goal

Replace the old four-subagent delegated model:
- Scout
- Planner
- Worker
- Reviewer

with the implemented role model:
- Daedalus (main agent)
- Sage
- Muse
- Worker

This redesign simplifies the user-facing mental model without losing:
- fast reconnaissance
- executable planning
- verification discipline
- parallel execution capacity

## Implemented Target Roles

### 1. Daedalus
Primary user-facing master artisan.

Responsibilities:
- own final synthesis and final answer
- decide when to work directly vs delegate
- remain capable of direct implementation
- orchestrate Sage, Muse, and Worker lanes
- maintain todo / execution discipline
- enforce completion and verification contracts

Not responsible for:
- becoming a passive router that never works directly
- offloading all implementation into subagents by default
- acting as a delegated subagent

### 2. Sage
Fused research + reconnaissance specialist.

Responsibilities:
- quick read-only reconnaissance
- deep architectural investigation
- minimal evidence gathering for the parent
- scoped codebase explanation with citations/evidence
- usable both as a primary user mode and a delegatable subagent

Not responsible for:
- editing source files
- producing implementation diffs
- drifting into endless exploratory reading

### 3. Muse
Planning specialist.

Responsibilities:
- convert requirements + Sage findings into executable plans
- create durable plan artifacts
- identify dependency edges and safe parallel lanes
- define verification criteria
- delegate to Sage when additional read-only evidence is needed to elaborate the plan
- synthesize Sage findings back into the plan instead of dumping raw research
- hand off cleanly to Daedalus / Worker execution
- usable both as a primary user mode and a delegatable subagent

Not responsible for:
- direct code changes
- pseudo-plans that lack execution or verification structure
- becoming a general orchestration peer to Daedalus

### 4. Worker
Implementation assistant / parallel execution lane.

Responsibilities:
- execute narrowly scoped implementation tasks
- act as an assisting pair of hands to Daedalus
- verify assigned work before reporting completion
- report blockers and uncertainty precisely
- avoid re-orchestrating the task

Not responsible for:
- becoming another planner
- broad codebase exploration when Sage should do it
- replacing Daedalus as the primary user-facing agent

## Old -> New Responsibility Mapping

### Old: Scout
New owner:
- Sage

Behaviors preserved:
- breadth-first exploration before deep reading
- minimal sufficient evidence rather than broad tours
- clear stop conditions
- concise findings bundle for the parent
- no source edits

Behaviors dropped:
- separate standalone Scout identity
- duplication with a deeper research role

Implemented runtime interpretation:
- Sage supports read-only recon/research doctrine and tool restrictions
- Sage is available as both a primary mode and delegated role

### Old: Planner
New owner:
- Muse

Behaviors preserved:
- executable step decomposition
- explicit dependency / serialization boundaries
- handoffs that an implementation agent can follow directly
- explicit assumptions and blockers
- preference for safe parallel execution

Behaviors dropped:
- planner as a separate low-level orchestration identity
- purely internal planning jargon

Implemented runtime interpretation:
- Muse is planning-oriented
- Muse can operate as a delegated role and as a primary planning mode
- Muse has execution-state and planning surfaces appropriate for plan production

### Old: Reviewer
New owner:
- Daedalus + Worker verification protocol
- optional Sage audit pass when read-only review is useful

Behaviors preserved:
- no completion claims without verification
- severity-aware issue framing
- evidence-backed correctness checks
- concise blocker-oriented review

Behaviors dropped:
- reviewer as a mandatory dedicated role on every task
- a separate review identity when the task is small or verification is straightforward

Implemented runtime interpretation:
- review behavior is preserved as policy, not as a mandatory bundled role
- Daedalus keeps final synthesis / completion judgment
- Worker verifies assigned changes before claiming completion
- Sage may be used for targeted read-only audit work

### Old: Worker
New owner:
- Worker (retained, repositioned)

Behaviors preserved:
- stay within scope
- minimal intentional diff
- verify before reporting completion
- clear blocker reporting
- avoid becoming an orchestrator

Behavior changed:
- Worker is now more explicitly an execution lane for Daedalus rather than a rival orchestrator identity

## Main-Agent Behavior Reallocation

Because Planner and Reviewer were removed as mandatory named runtime roles, their functions moved upward.

### Daedalus absorbs
- orchestration judgment
- delegation judgment
- completion contract enforcement
- final risk / correctness synthesis
- todo discipline
- benchmark-oriented execution discipline

### Muse absorbs
- executable decomposition
- planning artifact generation
- dependency mapping
- safe parallel-lane design
- targeted delegation to Sage for missing read-only evidence during plan elaboration

### Sage absorbs
- fast recon
- deeper investigation
- architecture explanation
- read-only evidence collection

### Worker absorbs
- narrow-scope execution
- narrow-scope verification
- explicit blocker surfacing

## Behavioral Policies That Survive The Redesign

These remain more important than the role names.

### 1. Todo discipline survives
The system keeps the policy that multi-step work should use tracked execution state.

Owner:
- Daedalus primarily
- Worker secondarily for delegated lanes
- Muse when establishing or rewriting plan-derived execution state

### 2. Verification survives
Desired policy:
- no success claims without tool-backed verification
- after code changes, run the narrowest relevant validation
- if validation fails, turn failures into explicit remaining work

Owner:
- Worker for assigned lane verification
- Daedalus for final completion judgment

### 3. Planning becomes artifact-first
Desired policy:
- plans are durable artifacts, not ephemeral chat prose
- plans should be reviewable and executable
- plans should include verification criteria and dependency structure

Owner:
- Muse by specialization
- Daedalus when planning directly

### 4. Research remains read-only
Desired policy:
- Sage should stay read-only
- Sage should stop when enough evidence exists
- Sage should return compact, useful findings by default when delegated

### 5. Parallelism remains explicit
Desired policy:
- parallelize only independent lanes
- avoid duplicate effort across subagents
- mark serialization boundaries clearly

## Runtime Source-of-Truth Note

This document describes the implemented architecture.
It is not the live runtime prompt source.

Canonical runtime prompt sources live under:
- `packages/coding-agent/src/core/prompts/` for Daedalus primary
- `packages/coding-agent/src/extensions/daedalus/workflow/primary-role/prompts/` for Sage/Muse primary overlays
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/` for delegated Sage/Muse/Worker prompts

The `Daedalus-New/` docs remain review/reference artifacts.

## Bottom line

The runtime role mapping is now:
- Daedalus primary orchestrator
- Sage read-only research/recon lane
- Muse planning lane
- Worker bounded implementation lane

Reviewer behavior survives as policy rather than as a mandatory dedicated bundled role.
