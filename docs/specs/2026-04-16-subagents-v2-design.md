# Daedalus Subagents V2 — Orchestrator-First Design

Date: 2026-04-16
Status: Proposed and user-approved for planning

## Summary

Daedalus should evolve from a coding agent with subagent support into an **orchestrator-native system** where the top-level assistant is always the orchestrator.

V2 should make Daedalus feel closer to **oh-my-openagent / OpenCode** in its orchestration model while preserving and extending the strongest parts of Daedalus's current runtime and the session-backed execution discipline inspired by oh-my-pi.

The resulting system should have these defining properties:

- **One primary user-facing agent**: Daedalus is always the orchestrator.
- **First-class internal specialist agents**: exploration, planning, implementation, review, and future specialists run as structured child workers.
- **A real control plane**: scheduling, task state, routing, notifications, observability, background execution, and guardrails are explicit subsystems.
- **Strong runtime contracts**: compact task packets, enforced policies, structured result submission, output validation, and rich persisted metadata remain mandatory.
- **Branch-based hard isolation**: risky mutation work can execute on dedicated child branches instead of worktrees.

The goal is not to add more "agent modes." The goal is to make Daedalus itself into a robust, inspectable, delegation-native orchestrator.

## Reference direction

### What to borrow more strongly from OpenCode

OpenCode is the main reference for the **top-level interaction model** and the **control-plane design**.

What is worth borrowing directly:

- a single primary orchestrator persona as the user's main point of contact
- metadata-driven specialist agents instead of prompt-only routing
- both **foreground** and **background** delegated execution paths
- explicit task lifecycle and task history
- notifications and completion reporting back to the parent session
- stronger recursion, concurrency, and loop protection
- evented observability and a more operational subagent system

What should not be copied directly:

- OpenCode-specific category/model infrastructure where it does not fit Daedalus
- features that assume an external platform or distributed control layer
- a role catalog that grows faster than Daedalus can support with strong contracts

### What to keep from Daedalus / Pi-inspired runtime design

What should remain central:

- child subagents as real session-backed executions
- compact task packets instead of inheriting full parent transcript state
- explicit `submit_result` contract
- runtime-enforced tool, path, spawn, and depth policy
- persisted transcripts and result artifacts
- inspectable child runs linked to the parent session

What should change:

- subagents should stop being an opt-in orchestration mode
- the system needs a real control plane around the runner
- persisted metadata should become richer and more operationally useful

## Goals

### Primary goals

1. Make Daedalus itself the orchestrator by default.
2. Make subagents first-class internal workers with explicit metadata and routing rules.
3. Add a control plane that manages task state, scheduling, notifications, observability, and background work.
4. Preserve strict runtime contracts for safety, correctness, and token efficiency.
5. Support branch-based hard isolation for risky mutating work.
6. Keep delegated work inspectable both during and after execution.
7. Optimize the system for ambitious end-to-end execution by AI agents rather than for human micromanagement.

### Non-goals

1. Supporting multiple co-equal primary personas for the user.
2. Keeping a separate "standard mode" that behaves as a non-orchestrating Daedalus.
3. Worktree-based isolation.
4. Distributed or multi-machine orchestration.
5. Requiring external dashboards, remote supervisors, or platform services.
6. Shipping a large marketplace of bundled roles before the control plane is solid.

## Chosen product model

### Rejected: keep standard Daedalus plus optional orchestrator mode

This keeps the user model fragmented and makes orchestration feel secondary. It also pushes core architectural decisions into settings and UI toggles instead of the system's primary design.

### Rejected: Pi-first executor with orchestration as a later layer

This would improve safety but undershoot the product direction. The user wants Daedalus to become more like OpenCode in how the system feels and operates.

### Selected: orchestrator-first Daedalus

Daedalus should always be the top-level orchestrator.

That means:

- the user always talks to one primary Daedalus assistant
- delegation is a built-in behavior, not a mode
- specialist agents are internal workers, not alternate user-facing primaries
- settings tune delegation behavior, not whether orchestration exists

## User experience

### Top-level behavior

From the user's perspective, Daedalus becomes an orchestrator-native coding agent.

Expected behavior:

- Daedalus may solve simple tasks directly.
- Daedalus may delegate focused subtasks to internal specialists.
- Daedalus may run background research, review, or inspection in parallel when useful.
- Daedalus reports compact task progress inline without overwhelming the main conversation.
- Daedalus surfaces enough operational detail to remain inspectable and trustworthy.

### Commands and inspection

V2 should make delegated work a first-class operational feature.

Recommended command surface:

- `/agents` — list built-in and discovered specialist agents, their purpose, and key constraints
- `/subagents` — inspect active, queued, background, completed, failed, and cancelled runs for the current parent session
- `/subagents <run>` — open detailed inspection view for a specific run and its artifacts

`/orchestrator` should no longer be a mode switch. If retained at all, it should be diagnostic or configuration-oriented, not the entry point for enabling orchestration.

### Parent conversation behavior

The main conversation should remain concise.

Delegation records shown inline should include:

- agent name
- short task summary
- execution mode (foreground or background)
- current lifecycle state
- latest meaningful activity
- completion summary
- branch-isolation status when relevant

Detailed inspection belongs in `/subagents`, not in the main transcript.

## System architecture

Daedalus V2 should be structured as three explicit layers.

### 1. Runtime layer

The runtime layer owns one subagent execution from setup through completion.

Responsibilities:

- resolve the effective agent definition
- resolve effective model, thinking level, and policy
- build the compact task packet and spillover context artifacts
- create the child session
- enforce tool/path/spawn/depth rules at runtime
- enforce result submission contract
- validate structured outputs
- persist transcript, context, result, and metadata artifacts
- classify failures and final state

This layer extends the current `core/subagents/*` runtime rather than replacing it.

### 2. Control-plane layer

The control plane manages all delegated work across the lifetime of the parent session.

Responsibilities:

- routing decisions
- task scheduling
- task lifecycle state transitions
- resource reservation and rollback
- concurrency budgeting
- descendant and depth accounting
- background execution management
- task history and notifications
- loop detection and guardrail enforcement
- event publishing and observability

This is the most important missing subsystem in the current Daedalus implementation.

### 3. Workflow layer

The workflow layer is the orchestrator-facing UX and starter-pack role layer.

Responsibilities:

- the top-level Daedalus orchestrator prompt and behavior
- built-in role pack
- command integration
- settings integration
- live activity views
- run inspection and artifact viewing

This layer should be replaceable and extensible, but the default Daedalus experience should ship with a strong first-party implementation.

## Agent model

Subagents should move from being primarily prompt files with light frontmatter to being **metadata-backed capabilities**.

Each agent definition should include:

- `name`
- `description`
- `systemPrompt`
- `purpose` or `category`
- `tools` / tool policy
- `spawns` / spawn policy
- `model` default
- `thinkingLevel` default
- `outputSchema`
- `executionModePreference` (`foreground`, `background`, `either`)
- `isolationPreference` (`shared-branch`, `child-branch`, `either`)
- `costClass` or effort class
- `useWhen`
- `avoidWhen`
- observability tags / labels

The orchestrator should use this metadata in routing decisions instead of relying only on prompt text.

## Built-in specialist roles

V2 should keep a compact built-in specialist set, but make it more operationally real.

Initial built-in roles:

- `explore` or `scout` — codebase reconnaissance and structure discovery
- `planner` — compact executable planning and task decomposition
- `worker` — implementation and mutation specialist
- `reviewer` — correctness, risk, and validation review

Possible later roles if they map cleanly to Daedalus internals:

- `librarian`-style external reference research
- `oracle`-style read-only reasoning specialist

These remain internal specialists. They are not alternate user-facing primaries.

## Task execution model

### Foreground execution

The parent waits for the delegated run to complete before continuing.

Use this when:

- the next parent step depends directly on the result
- the delegated task is short and tightly coupled to the user's active request
- deterministic handoff is more important than concurrency

### Background execution

The parent launches the delegated run and continues working.

Use this when:

- multiple investigations can run in parallel
- the parent can proceed on non-overlapping work
- the task is long-running or exploratory
- the system should notify the parent on completion

This should become a first-class execution path, not an afterthought.

## Control-plane design

### Task lifecycle

Daedalus should define explicit task states.

Recommended state family:

- `queued`
- `reserved`
- `starting`
- `running`
- `completing`
- `completed`
- `failed`
- `cancelled`
- `interrupted`

The control plane should own valid transitions and reject invalid ones.

### Scheduling and budgeting

The scheduler should manage:

- maximum child depth
- maximum concurrent descendants per root session
- per-role concurrency
- per-model concurrency
- branch-isolated task limits
- reservation before start and rollback on failed launch

This gives the system explicit back-pressure and prevents runaway delegation.

### Loop protection

The control plane should detect and stop pathological behavior such as:

- repetitive tool loops
- spawn chains that exceed safe limits
- repeated failure/retry cycles without new information
- mutually recursive role patterns

### Task history and notifications

The parent session should maintain structured task history.

History records should include:

- task id
- parent id
- root id
- agent name
- summary
- execution mode
- current/final status
- started/completed timestamps
- branch-isolation status

Background completion should notify the parent with compact summaries and links into `/subagents`.

## Runtime contracts

### Compact task packets

Child sessions should continue to receive compact task packets rather than inheriting the full parent transcript.

Each packet should contain:

- goal
- assignment
- compact context
- explicit constraints
- output contract
- parent linkage metadata

If context exceeds the inline threshold, the runtime may spill the overflow to a context artifact and reference it from the packet.

### Structured result submission

All subagents should still finish via `submit_result`.

The result contract should support:

- success summary
- structured data payload
- explicit failure summary
- failure classification
- warnings or review findings

The runtime should validate the submitted data against the effective schema.

### Policy enforcement

Runtime policy remains mandatory.

The effective policy should govern:

- allowed tools
- readable paths
- writable paths
- allowed spawns
- maximum depth
- branch-isolation eligibility

Prompt text may reinforce the policy, but the runtime remains authoritative.

## Isolation model

### Default: shared-branch execution

Most delegated work should run on the current branch under normal runtime guardrails.

This is appropriate for:

- exploration
- planning
- review
- small, low-risk mutations

### Hard isolation: child-branch execution

When the orchestrator judges a task to be risky, broad, or structurally invasive, it may execute the task on a **dedicated child branch**.

This replaces the previously considered worktree-based model.

The branch-isolation model should define:

- branch naming convention
- parent/root branch linkage
- allowed depth of branch-isolated descendants
- whether child-branch runs can spawn more mutating children
- cleanup rules for discarded child branches
- inspection and adoption flow for successful runs

The parent orchestrator remains responsible for deciding how to adopt the result:

- inspect only
- cherry-pick
- merge
- replay manually
- discard

## Event and observability model

Daedalus should add a typed event bus for subagent operations.

Recommended event families:

- task lifecycle events
- routing decision events
- reservation/scheduler events
- child session creation/destruction events
- tool activity events
- result submission/validation events
- policy rejection events
- branch-isolation events
- notification events

This event stream should power:

- live `/subagents` views
- parent inline task summaries
- debugging and structured logs
- metrics and instrumentation hooks
- richer automated tests

## Persistence model

Per subagent run, Daedalus should persist more than transcript and result.

Recommended persisted artifacts:

- child transcript
- structured result artifact
- context artifact
- metadata artifact
- lifecycle history or final lifecycle snapshot
- effective runtime configuration snapshot
- failure details when applicable

Metadata should be rich enough to reconstruct meaningful run state after reload without relying on fragile transcript parsing.

Recommended metadata contents:

- run id
- agent name
- parent id / root id
- status
- summary
- started/completed timestamps
- effective model
- effective thinking level
- effective policy snapshot
- execution mode
- isolation mode
- branch metadata when used
- artifact paths
- failure classification

## Settings model

Since Daedalus is always the orchestrator, settings should tune behavior rather than enable/disable the entire orchestration model.

Recommended settings areas:

- delegation aggressiveness
- maximum depth
- maximum concurrency
- default background behavior for some role classes
- per-role model overrides
- per-role thinking overrides
- branch-isolation thresholds or preferences

Settings should not treat orchestration as a separate product mode.

## Discovery and validation

Validation should happen in two phases.

### Discovery-time validation

Validate:

- malformed agent metadata
- unknown fields
- invalid tool references
- invalid spawn targets
- invalid output schema definitions
- circular or unsafe spawn graph shapes

### Runtime validation

Validate:

- policy compliance
- depth and concurrency limits
- result submission shape
- branch-isolation eligibility
- repeated loop behavior
- persistence success for critical artifacts

This should make the system stricter and easier to trust.

## UX for `/subagents`

`/subagents` should evolve into a true operational view.

It should show:

- queued tasks
- running tasks
- completed tasks
- failed tasks
- cancelled/interrupted tasks
- background tasks by status
- effective role/model/isolation summary
- latest activity
- available artifacts

Detailed run inspection should support:

- transcript viewing
- context packet viewing
- result viewing
- metadata viewing
- branch metadata viewing when present

## Acceptance criteria

Daedalus V2 succeeds when all of the following are true:

1. The user interacts with one orchestrator-native Daedalus by default.
2. Specialist subagents are routed using explicit metadata plus orchestrator judgment.
3. Delegated work supports both foreground and background execution.
4. A control plane tracks task state, scheduling, notifications, and history.
5. Runtime contracts remain enforced and inspectable.
6. Riskier mutation tasks can use dedicated child branches instead of worktrees.
7. `/subagents` provides meaningful operational inspection during and after execution.
8. The system is robust enough for ambitious AI-agent-driven end-to-end work inside Daedalus itself.

## Implementation implications

This design implies the next implementation plan should cover, at minimum:

- promotion of the orchestrator into the default top-level Daedalus behavior
- expansion of agent definition metadata
- creation of a control-plane subsystem
- support for foreground and background task execution
- typed event bus and richer observability
- richer task persistence and metadata
- branch-isolation support for risky mutating runs
- settings and UI updates consistent with an orchestrator-native product model

## Final position

Daedalus should evolve into an **OpenCode-like orchestrator-native agent system** with:

- one primary orchestrator-facing user experience
- metadata-driven internal specialist agents
- a first-class control plane
- strong runtime contracts and structured outputs
- rich observability and persisted inspection
- branch-based hard isolation for risky work

This is intentionally ambitious. The system is being designed for end-to-end execution by AI agents, not for a narrow human-paced feature slice.
