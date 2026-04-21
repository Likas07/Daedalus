# Forge Performance Plumbing Map for Daedalus

Status: reconnaissance draft
Purpose: identify Forge internals that are likely to affect agent performance, robustness, and task completion more than surface UX.

## Framing

This document focuses on plumbing that changes outcome quality, robustness, or efficiency, such as:
- compaction behavior
- unfinished-work enforcement
- semantic indexing lifecycle
- safety/policy systems that reduce derailment
- snapshot/undo behavior that enables safer autonomy
- task-specific model/runtime configuration

It intentionally deprioritizes pure UX affordances.

---

## 1. Pending-work enforcement

### Forge mechanism
Forge has a `PendingTodosHandler` that detects when the system tries to finish while there are still pending or in-progress todos and injects a reminder into context.

References:
- `harnesses/forgecode/crates/forge_app/src/hooks/pending_todos.rs`
- `harnesses/forgecode/crates/forge_config/src/config.rs` (`verify_todos`)

### Why it matters for performance
This likely improves:
- task completion rate
- resistance to premature stopping
- benchmark performance on multi-step tasks
- consistency between plan and execution

### Daedalus state
Daedalus currently has todo tooling and plan-mode execution tracking, but not an equivalent explicit unfinished-work completion guard in the same form.

### Port recommendation
Very High

### Suggested adaptation
Port the behavior, not the exact implementation:
- use new `todo_read` / `todo_write` state
- optionally integrate with plan-mode execution state
- make it configurable
- remind only when active work still exists (`pending` / `in_progress`)

---

## 2. Compaction configuration and strategy controls

### Forge mechanism
Forge exposes a configurable compaction model with:
- retention window
- eviction window
- token threshold
- turn threshold
- message threshold
- max tokens after compaction
- separate compaction model
- optional on-turn-end triggering

Reference:
- `harnesses/forgecode/crates/forge_config/src/compact.rs`

### Why it matters for performance
This affects:
- context survival under long sessions
- cost and latency
- ability to choose cheaper/faster compaction models
- predictability of when compaction occurs

### Daedalus state
Daedalus already has substantial compaction infrastructure, including:
- structured summarization prompts
- iterative summary update using previous summaries
- branch summary support
- branch-aware summarization and compaction

References:
- `Daedalus/packages/coding-agent/src/core/compaction/compaction.ts`
- `Daedalus/packages/coding-agent/src/core/compaction/branch-summarization.ts`
- `Daedalus/packages/coding-agent/src/core/compaction/utils.ts`

### Judgment
Daedalus may already be ahead of Forge in compaction sophistication, especially around iterative and branch-aware summaries.

### Port recommendation
Medium, but only for configuration ergonomics and trigger policy

### Suggested adaptation
Do not port Forge compaction wholesale.
Instead consider borrowing:
- easier user-facing threshold controls
- explicit compaction model selection
- optional on-turn-end trigger control

This is a refinement port, not a core algorithm port.

---

## 3. Compaction transformer pipeline / summary shaping

### Forge mechanism
Forge has a dedicated compactor service and summary transformation pipeline. It also removes droppable messages and preserves usage/reasoning details carefully through compaction.

Reference:
- `harnesses/forgecode/crates/forge_app/src/compact.rs`

### Why it matters for performance
Good summary shaping affects:
- model continuity after compaction
- reduced drift
- preservation of useful tool-call context
- lower summary noise

### Daedalus state
Daedalus already performs structured summarization and iterative update. It also has branch-aware summary mechanics.

### Port recommendation
Watch closely, but not an obvious direct port target yet

### Suggested adaptation
Compare Forge's notion of:
- droppable messages
- usage preservation
- reasoning preservation
against Daedalus internals.
This may reveal targeted improvements rather than a wholesale replacement.

---

## 4. Semantic workspace indexing lifecycle

### Forge mechanism
Forge treats semantic search as a full workspace lifecycle with:
- workspace init
- sync
- status
- info
- indexed workspace abstraction

References:
- `harnesses/forgecode/README.md`
- `harnesses/forgecode/crates/forge_app/src/services.rs`

### Why it matters for performance
This is not just UX.
It affects real performance because semantic search quality depends on:
- indexed readiness
- freshness of workspace data
- visible sync state
- ability to trust semantic search results

### Daedalus state
Daedalus is planning to port `sem_search`, but the surrounding lifecycle is not yet equally explicit.

### Port recommendation
Very High

### Suggested adaptation
Treat semantic search as a system, not a single tool:
- indexing lifecycle
- readiness checks
- sync/update strategy
- status visibility
- role-aware defaults for Sage/Muse/Daedalus

---

## 5. Policy / permission service

### Forge mechanism
Forge has a distinct policy service / permission surface.

Reference:
- `harnesses/forgecode/crates/forge_app/src/services.rs`

### Why it matters for performance
This affects performance indirectly but materially:
- fewer self-inflicted derailments
- less bad mutation behavior
- more stable execution loops
- safer autonomy allows stronger action without constant user interruption

### Daedalus state
Daedalus already has:
- permission gate
- protected paths
- dirty repo guard
- branch isolation concepts

References:
- `Daedalus/packages/coding-agent/src/extensions/daedalus/bundle.ts`
- `Daedalus/packages/coding-agent/src/extensions/daedalus/safety/protected-paths.ts`

### Port recommendation
Medium-High

### Suggested adaptation
Again, not a replacement port.
Focus on tightening policy coherence and making policies role-aware and execution-aware.

---

## 6. Snapshot / undo plumbing

### Forge mechanism
Forge has snapshot creation and undo plumbing for file operations.

References:
- `harnesses/forgecode/crates/forge_snaps/src/service.rs`
- `harnesses/forgecode/crates/forge_app/src/services.rs`

### Why it matters for performance
Safer rollback affects performance because it changes agent willingness to act:
- safer autonomy
- easier recovery from bad edits
- lower penalty for experimentation
- less hesitation around multi-step refactors

### Daedalus state
Daedalus has some safety and branch isolation mechanisms, but this specific snapshot/undo recovery model is worth comparison.

### Port recommendation
Medium-High

### Suggested adaptation
Port if Daedalus's current rollback story is weaker than Forge's in day-to-day mutation recovery.
This is performance-relevant because safer mutation loops often improve completion rate.

---

## 7. Task-specific model/runtime configuration

### Forge mechanism
Forge supports specialized configuration for:
- session work
- commit work
- suggest work
- compaction model selection
- reasoning effort configuration

References:
- `harnesses/forgecode/crates/forge_app/src/services.rs`
- `harnesses/forgecode/crates/forge_config/src/reasoning.rs`
- `harnesses/forgecode/crates/forge_config/src/compact.rs`

### Why it matters for performance
This affects:
- cost/performance tradeoffs
- using cheaper models for side tasks
- using stronger models for planning or hard reasoning
- more efficient plumbing around support tasks

### Daedalus state
Daedalus already has some model-specific and subagent-specific configuration ideas, but there may be room to make these more explicit and task-oriented.

### Port recommendation
Medium-High

### Suggested adaptation
Especially useful for:
- compaction model
- Muse planning model
- maybe Worker execution model
- maybe semantic search support model if needed

---

## 8. Doom-loop / anti-stall mechanisms

### Forge mechanism
Forge app wiring references `DoomLoopDetector`.

Reference:
- `harnesses/forgecode/crates/forge_app/src/app.rs`
- `harnesses/forgecode/crates/forge_app/src/orch_spec/orch_runner.rs`

### Why it matters for performance
Potentially very important:
- reduces wasted turns
- prevents repeating failed behaviors
- improves effective completion rate under bounded iteration budgets

### Daedalus state
Daedalus likely has some related safeguards, but this should be explicitly compared.

### Port recommendation
High

### Suggested adaptation
Investigate Forge's exact doom-loop conditions and compare with Daedalus behavior. This may be one of the most performance-relevant ports after unfinished-work enforcement.

---

## 9. Tool-call robustness / schema coercion

### Forge mechanism
Forge has explicit tests and logic around stringified tool call arguments and schema coercion.

References:
- `harnesses/forgecode/crates/forge_domain/tests/test_stringified_tool_calls.rs`
- `harnesses/forgecode/crates/forge_json_repair/...`

### Why it matters for performance
Very practical:
- fewer failed tool calls
- less turn waste
- more robust behavior on weaker providers/models
- better completion under messy model outputs

### Daedalus state
Worth auditing. Even if Daedalus is strong here already, this is exactly the kind of plumbing that changes real task success rates.

### Port recommendation
High

### Suggested adaptation
Investigate as robustness hardening, especially if Daedalus wants broader provider/model flexibility.

---

## 10. Plan creation as a service, not just prompt behavior

### Forge mechanism
Forge has plan creation in services and an `execute-plan` skill.

References:
- `harnesses/forgecode/crates/forge_app/src/services.rs`
- `harnesses/forgecode/crates/forge_repo/src/skills/execute-plan/SKILL.md`

### Why it matters for performance
This is structural, not merely UX:
- better plan artifact consistency
- easier plan execution loops
- stronger coupling between planning and completion discipline

### Daedalus state
You are already moving strongly in this direction with Muse + todo redesign.

### Port recommendation
Very High

### Suggested adaptation
Treat this as a core performance feature, not just a workflow nicety.
A plan execution service/skill can reduce drift and improve completion significantly.

---

## Priority ranking for performance-focused ports

### Highest-value candidates
1. Pending-work enforcement (`PendingTodosHandler`-style behavior)
2. Semantic workspace/indexing lifecycle around `sem_search`
3. Doom-loop / anti-stall detection
4. Tool-call robustness / schema coercion hardening
5. Plan execution as a real system primitive (`execute-plan` direction)

### Strong secondary candidates
6. Task-specific model/runtime configuration
7. Snapshot / undo plumbing
8. Policy/permission hardening as execution stabilizer

### Lower-priority / refinement ports
9. Compaction configuration ergonomics
10. Compaction transformer refinements, but only after careful comparison because Daedalus may already be stronger here

---

## Bottom line

If you care primarily about performance rather than UX, the most promising Forge plumbing ports are probably not shell integration or command ergonomics.
They are the mechanisms that:
- keep the agent from stopping too early
- keep it from searching blindly
- keep it from looping uselessly
- keep tool calls from failing
- keep planning tightly coupled to execution

That is where the next performance-focused Forge -> Daedalus gains are most likely to come from.
