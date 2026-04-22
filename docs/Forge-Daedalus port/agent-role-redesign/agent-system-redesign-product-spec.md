# Daedalus Agent System Redesign — Product Spec

Status: implemented product spec
Scope: whole-agent-system redesign, including role architecture, prompt architecture, subagent result transport, execution discipline, and the implemented runtime shape
Workspace target: `/home/likas/Research/Daedalus`

## Executive Summary

Daedalus redesigned its agent system from the older four-role bundled specialist model:
- Scout
- Planner
- Worker
- Reviewer

into the implemented Forge-informed architecture:
- Daedalus
- Sage
- Muse
- Worker

This redesign was not just a rename. It is a system change spanning:
- role ownership and delegation boundaries
- execution discipline and verification policy
- planning and research structure
- subagent result transport
- prompt architecture
- runtime migration strategy

The core thesis is now implemented:
- keep Daedalus as the governing artisan-orchestrator
- absorb Forge-grade execution discipline
- collapse redundant or overly mandatory roles
- make research, planning, and execution handoffs more structured
- improve parent/subagent interaction with explicit result envelopes and deferred output inspection

## Product Goals

- Simplify the agent mental model without losing useful specialist behavior.
- Keep Daedalus as the primary user-facing owner of work and final synthesis.
- Turn research, planning, and execution into clearer specialist lanes.
- Preserve and strengthen execution-state discipline for non-trivial work.
- Preserve explicit verification and anti-drift behavior after removing Reviewer as a mandatory runtime role.
- Make subagent returns structured, inspectable, and lightweight by default in parent context.
- Separate role identity from runtime execution contract through layered prompt architecture.

## Non-Goals

- Do not turn Daedalus into a passive router.
- Do not fully clone Forge's branding, tone, or exact top-level product identity.
- Do not automatically inject full raw child output back into parent context.
- Do not force role-specific outer result schemas for different subagent types.

## Current State

The redesign is implemented in runtime.

Already landed and verified:
- tool-call robustness hardening
- structured todo state (`todo_read` / `todo_write`)
- exact + semantic search (`fs_search`, `sem_search`)
- semantic workspace lifecycle
- pending-work enforcement
- doom-loop detection
- plan execution primitive (`execute_plan`)
- plan-mode / todo convergence
- role-aware tuning and migration of the bundled specialist system
- primary role mode switching for `daedalus`, `sage`, and `muse`
- delegated runtime prompt construction for subagents
- primary-mode prompt overlays for Sage and Muse
- delegated universal result-envelope + sidecar flow
- summary-first parent-visible subagent result references
- deferred full-output inspection through `read_agent_result_output(result_id)`
- continuation/resume wiring through `conversation_id`

No material redesign item remains unimplemented in runtime.

## Target Role Architecture

### 1. Daedalus
Primary user-facing master artisan and orchestrator.

Responsibilities:
- understand the user's real goal
- decide when to work directly vs delegate
- remain capable of direct implementation
- orchestrate Sage, Muse, and Worker lanes
- maintain todo / execution discipline
- own final synthesis and final user-facing answer
- own final completion and verification judgment

Not responsible for:
- becoming a passive dispatcher
- offloading all real work into subagents by default
- acting as a delegated subagent

### 2. Sage
Fused research + reconnaissance specialist.

Responsibilities:
- quick read-only reconnaissance
- deeper architectural investigation
- evidence-backed findings bundles
- minimal sufficient discovery for parent planning/execution
- optional audit/second-set-of-eyes role when read-only review helps
- usable both as a primary mode and a delegated role

Not responsible for:
- editing source files
- implementation diffs
- endless exploration without stop conditions

### 3. Muse
Planning specialist.

Responsibilities:
- turn requirements + Sage findings into executable plans
- create durable plan artifacts
- map dependencies and safe parallel lanes
- define verification criteria
- consult Sage when planning would otherwise become speculative
- synthesize research into plan structure rather than dumping raw research
- usable both as a primary mode and a delegated role

Not responsible for:
- direct code changes
- becoming a second top-level orchestrator
- pseudo-plans without executable structure

### 4. Worker
Scoped implementation lane.

Responsibilities:
- execute bounded implementation tasks
- act as an assisting pair of hands to Daedalus
- verify assigned work before claiming completion
- report blockers and uncertainty precisely
- stay within assigned lane and avoid re-orchestration

Not responsible for:
- broad research when Sage should do it
- planning when Muse or Daedalus should do it
- replacing Daedalus as primary user-facing owner

## Responsibility Reallocation

### Scout -> Sage
Preserved:
- breadth-first recon
- stop conditions
- minimal evidence bundles
- no source edits

### Planner -> Muse
Preserved:
- executable decomposition
- dependency mapping
- safe parallelism
- verification criteria
- explicit assumptions/blockers

### Reviewer -> Daedalus + Worker + optional Sage audit
Preserved:
- no completion claims without verification
- evidence-backed correctness checks
- concise blocker-oriented review
- severity-aware issue framing

### Worker -> Worker (retained, repositioned)
Preserved:
- narrow-scope implementation
- minimal intentional diff
- verify before completion
- anti-orchestrator posture

## Behavioral Policies That Must Survive

### Todo discipline
Multi-step work must use tracked execution state.

Primary owners:
- Daedalus
- Worker for delegated lanes
- Muse when establishing or rewriting plan-derived execution state

### Verification discipline
No success claims without evidence.

Desired properties:
- narrowest relevant validation after changes
- failed validation becomes explicit remaining work
- final completion judgment stays with Daedalus

### Planning as artifact
Plans should be durable, reviewable, and executable.

Desired properties:
- artifact-first planning
- checkbox-oriented execution structure
- verification criteria
- explicit dependencies and parallel lanes
- targeted planning-time consultation with Sage

### Research as read-only
Research should stay read-only and bounded.

Desired properties:
- no source edits from Sage
- stop when enough evidence exists
- compact findings by default when delegated

### Parallelism as explicit structure
Parallelism should be deliberate, not accidental.

Desired properties:
- parallelize only independent lanes
- avoid duplicate effort between subagents
- mark serialization boundaries clearly

## Prompt Architecture

This redesign separates:
- static role identity
- runtime execution contract

### Runtime prompt source of truth
Canonical runtime prompt sources now live in code-owned assets:
- `packages/coding-agent/src/core/prompts/` for Daedalus primary
- `packages/coding-agent/src/extensions/daedalus/workflow/primary-role/prompts/` for Sage/Muse primary overlays
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/` for delegated Sage/Muse/Worker prompts

The files under:
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/`

remain review/reference artifacts, not live runtime prompt assets.

### Static prompt files contain
- role identity and philosophy
- responsibilities and boundaries
- methodology
- role-specific discipline
- role-specific structure for the contents of the result body

### Runtime overlays contain
- execution-mode-specific contract text
- delegated result-envelope rules
- summary-vs-output semantics
- parent-consumption guidance
- delegated task packet injection
- model-specific overrides where needed

## Subagent Result Transport

The redesign uses a universal structured result envelope for delegated runs.

Required envelope:

```json
{
  "task": "string",
  "status": "completed | partial | blocked",
  "summary": "string",
  "output": "string"
}
```

Semantics:
- `summary` is the short parent-facing / card-facing conclusion
- `output` is the fuller deferred body
- the parent does not receive full `output` by default
- the parent receives a lightweight reference containing:
  - `result_id`
  - `conversation_id`
  - `task`
  - `status`
  - `summary`
  - note directing the parent to `read_agent_result_output(result_id)` for deeper detail

The full record is stored as a sidecar artifact keyed by `result_id`.

## Continuation / Resume Behavior

The redesign now includes functional continuation wiring.

Implemented behavior:
- subagent result references carry `conversation_id`
- later runs may reuse `conversation_id` to continue the child session
- persisted run metadata retains the linkage
- inspector/runtime surfaces can follow the child-session relationship
- primary role mode persists/restores across resume as session-local state

## Runtime Interpretation Rules

### Parent-side rule
Daedalus should consume subagent `summary` first.
Only inspect deferred `output` through `read_agent_result_output(result_id)` when the summary is insufficient.
Do not blindly relay raw child output to the user.

### Delegated-side rule
Delegated Sage / Muse / Worker runs must complete via `submit_result` exactly once using the universal envelope.

### Primary-mode rule
Primary Sage and primary Muse are not delegated subagents and therefore do not inherit delegated completion rules.

## Verification Status

Verified in `packages/coding-agent`:
- `bun run check`
- `bun test`

Relevant runtime coverage includes:
- `test/system-prompt.test.ts`
- `test/prompt-model-overrides.test.ts`
- `test/subagent-system-prompt.test.ts`
- `test/subagents-runtime-config.test.ts`
- `test/subagents-runner.test.ts`
- `test/subagents-starter-pack.test.ts`
- `test/subagents-discovery.test.ts`
- `test/subagents-extension-api.test.ts`
- `test/subagent-deliverable-contract.test.ts`
- `test/subagents-result-validation.test.ts`
- `test/agent-result-store.test.ts`
- `test/primary-role-mode.test.ts`

## Bottom line

The Daedalus agent system redesign is implemented.

It now consists of:
- Daedalus primary orchestration
- Sage read-only research/recon
- Muse planning
- Worker bounded execution
- layered runtime prompt construction
- summary-first subagent result transport
- sidecar deferred output inspection
- functional child-session continuation
