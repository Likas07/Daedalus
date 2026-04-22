# Agent Role Redesign — Current State

Status: implemented runtime status note
Scope: clarify what has landed in Daedalus for the agent-role redesign and what now counts as runtime truth
Workspace target: `/home/likas/Research/Daedalus`

## Executive summary

The Daedalus agent-role redesign is now implemented in runtime.

The system is no longer best described as “tooling is implemented but the redesign is still mostly docs.”
That was true during the migration bridge phase, but it is no longer the right description.

The current runtime now includes:
- Daedalus as the primary orchestrator identity
- Sage as a read-only research/recon role
- Muse as a planning role
- Worker as the bounded execution lane
- runtime-built delegated overlays for subagent execution contract
- summary-first subagent result transport with sidecar result storage
- deferred full-output inspection via `read_agent_result_output(result_id)`
- functional `conversation_id` continuation for resumed child sessions
- primary role modes for:
  - `daedalus`
  - `sage`
  - `muse`
- persisted primary-role restore on resume

So the practical answer to “has the role redesign been implemented?” is now:

Yes.

More precise version:
- the foundational tooling/workflow substrate is implemented
- the runtime role architecture has been migrated to Daedalus / Sage / Muse / Worker
- the redesigned subagent result transport is implemented
- the continuation path is wired
- the redesign docs should now be read as describing implemented runtime behavior, not just proposed direction

## What is now implemented

### 1. Runtime role architecture
The bundled delegated runtime role set is now:
- Sage
- Muse
- Worker

Reviewer is no longer a mandatory bundled runtime role.
Reviewer behavior survives as policy and verification discipline distributed across:
- Daedalus final synthesis / completion judgment
- Worker lane-level verification before claiming completion
- optional Sage audit behavior when read-only review helps

Daedalus remains the primary user-facing orchestrator and is not exposed as a delegated subagent.

### 2. Prompt/runtime source-of-truth decision
The runtime prompt source of truth is now explicit:

#### Canonical runtime prompt sources
- Daedalus primary:
  - `packages/coding-agent/src/core/prompts/daedalus-constitution.md`
  - `packages/coding-agent/src/core/prompts/daedalus-persona.md`
  - `packages/coding-agent/src/core/prompts/daedalus-overrides-claude.md`
  - `packages/coding-agent/src/core/prompts/daedalus-overrides-gpt.md`
- Sage delegated:
  - `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage.md`
  - model overrides alongside it
- Muse delegated:
  - `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse.md`
  - model overrides alongside it
- Worker delegated:
  - `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/worker.md`
  - model overrides alongside it
- Sage primary:
  - `packages/coding-agent/src/extensions/daedalus/workflow/primary-role/prompts/sage-primary.md`
- Muse primary:
  - `packages/coding-agent/src/extensions/daedalus/workflow/primary-role/prompts/muse-primary.md`

#### Review/reference artifacts
The files under:
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/`

remain design/reference artifacts, not the live runtime prompt source.
They are now best treated as review snapshots and comparative design references.

This resolves the earlier ambiguity.
Runtime truth lives in runtime-owned prompt assets under `packages/coding-agent/src/...`.
The redesign docs describe and justify that runtime shape, but they are not the executable prompt source.

### 3. Mode-aware overlay architecture
The runtime now uses an explicit layered model rather than relying on a single static prompt per role.

Implemented layers include:
- shared delegated base contract
- role prompt
- model override prompt
- runtime-built delegated execution overlay
- delegated task packet
- primary-role overlays for Sage and Muse

This means:
- delegated roles get the result-envelope / summary-first contract automatically at runtime
- primary Sage and Muse do not inherit delegated completion rules incorrectly
- prompt assembly is mode-aware rather than pretending one static prompt file covers every execution context

### 4. Daedalus primary migration
Daedalus primary has now been aligned with the redesign architecture in the practical sense that matters:
- Daedalus remains the governing primary identity
- Daedalus prompt sources were updated to reflect the redesigned role boundaries
- Daedalus parent/orchestrator guidance is summary-first and redesign-aware
- Daedalus remains outside the delegated subagent role registry

Daedalus primary still uses the main-agent prompt assembly path because Daedalus is the main agent.
That is no longer treated as an unresolved migration problem.
It is the intentional architecture.

### 5. Result transport and parent/subagent interaction
The redesigned result transport is implemented.

Current runtime behavior:
- delegated subagents finish by calling `submit_result` once
- the accepted structured result uses the universal envelope:
  - `task`
  - `status`
  - `summary`
  - `output`
- the full result is stored as a sidecar artifact keyed by `result_id`
- the parent receives only a lightweight reference by default
- the parent is instructed to use `summary` first
- the parent may inspect full deferred output only through `read_agent_result_output(result_id)` when needed

This is now runtime truth, not just a product-spec aspiration.

### 6. Continuation / resume semantics
Continuation is now wired functionally.

Implemented behavior:
- subagent runs persist `conversation_id`
- a later run can pass that `conversation_id` to continue the same child session file
- persisted run/result metadata retains the continuation handle
- inspector/runtime surfaces can follow the child session linkage
- primary role mode also persists and restores on resume

The redesign therefore now has actual continuation semantics instead of passive future-proofing metadata only.

### 7. Runtime/UI/settings/documentation coherence
The runtime and tests now consistently speak in terms of:
- Daedalus
- Sage
- Muse
- Worker

Key surfaces updated or covered include:
- bundled agent discovery
- starter-pack behavior
- orchestrator guidance
- primary role mode switching
- result transport references
- settings/tests around role-aware behavior

The remaining documentation task is not implementation work anymore.
It is simply keeping status notes accurate.

## Practical interpretation

If someone asks “what remains before the redesign is real?”, the accurate answer is now:

Nothing material in runtime.

The redesign is implemented.
Any remaining work would be ordinary iteration or refinement, not completion of a missing architectural migration.

## Verification status

Verified in `packages/coding-agent`:
- `bun run check` — passing
- `bun test` — passing

Most relevant redesign coverage includes:
- `test/system-prompt.test.ts`
- `test/prompt-model-overrides.test.ts`
- `test/subagent-system-prompt.test.ts`
- `test/subagents-runtime-config.test.ts`
- `test/subagents-runner.test.ts`
- `test/subagents-starter-pack.test.ts`
- `test/subagents-discovery.test.ts`
- `test/subagents-extension-api.test.ts`
- `test/role-aware-performance-tuning.test.ts`
- `test/subagent-deliverable-contract.test.ts`
- `test/subagents-result-validation.test.ts`
- `test/agent-result-store.test.ts`
- `test/primary-role-mode.test.ts`

## Bottom line

The correct state is now:
- tooling/workflow substrate: implemented
- agent-role redesign runtime: implemented
- result transport redesign: implemented
- continuation wiring: implemented
- docs should stop speaking about the redesign as mainly pending
