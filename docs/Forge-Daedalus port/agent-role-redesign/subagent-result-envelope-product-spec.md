# Subagent Result Envelope — Product Spec

Status: proposed design spec  
Scope: subagent result transport, parent consumption, runtime prompt overlays, and UI behavior for the Daedalus agent-system redesign  
Workspace target: `/home/likas/Research/Daedalus`

## Purpose

Redesign subagent result handling so Daedalus gains the advantages of Forge-style wrapped subagent returns without inheriting Forge's weakness of flattening child output back into ordinary parent-context text.

The target system should:
- keep subagent returns structured
- keep parent context lightweight by default
- let the parent inspect full subagent output on demand
- support future subagent resumeability cleanly
- separate static role identity from runtime execution-contract rules

## Problem Statement

The current redesign work wants stronger, more predictable subagent handoffs.

The key issue is not only prompt wording. It is the boundary between:
- what the subagent returns
- what the parent automatically sees
- what the UI shows
- what can be inspected later

Forge provides a useful reference point:
- parent agents launch specialists via a task tool
- the child does not call a dedicated result-submission tool
- the runtime wraps the child result in an envelope

But Forge also has an undesirable fallback behavior:
- in some paths, child output is flattened back into plain text in parent context

This redesign explicitly aims to improve on that.

## Product Goals

- Make subagent returns predictable and machine-readable.
- Prevent raw full child output from being automatically reinjected into parent context.
- Let the parent synthesize from concise summaries first.
- Preserve a clean inspection path for deeper child output when needed.
- Keep subagent cards compact and readable in the UI.
- Preserve enough metadata for future session continuation and tracing.
- Avoid prompt bloat by moving execution-contract details into runtime-built overlays.

## Non-Goals

- Do not introduce role-specific outer payload schemas such as separate research-plan-worker top-level result types.
- Do not require Daedalus to act as a subagent.
- Do not make full child output visible by default in UI cards.
- Do not rely solely on static prompt prose to communicate whether an agent is running as a primary or delegated actor.

## Core Design

### 1. Universal subagent result envelope

All delegated subagents return the same final JSON envelope:

```json
{
  "task": "string",
  "status": "completed | partial | blocked",
  "summary": "string",
  "output": "string"
}
```

Field intent:
- `task`: the delegated task as understood by the subagent
- `status`: explicit completion state
- `summary`: short parent-facing and UI-facing synthesis
- `output`: the full bounded result body

This envelope is intentionally generic and does not vary by subagent type.

### 2. Sidecar artifact storage

When a subagent completes, runtime stores the full result as a sidecar artifact keyed by `result_id`.

Stored record:

```json
{
  "result_id": "string",
  "agent_id": "string",
  "conversation_id": "string",
  "task": "string",
  "status": "completed | partial | blocked",
  "summary": "string",
  "output": "string"
}
```

This sidecar artifact should be persisted in the conversation/session storage layer rather than treated as a normal user-facing file.

### 3. Lightweight parent-visible injected reference

The parent does not receive the full `output` by default.

Instead, it receives only a lightweight reference record:

```json
{
  "result_id": "string",
  "agent_id": "string",
  "conversation_id": "string",
  "task": "string",
  "status": "completed | partial | blocked",
  "summary": "string",
  "note": "If you want the full output, use read_agent_result_output(<result_id>)."
}
```

This record is what gets injected into normal parent context after subagent completion.

### 4. Explicit narrow output-inspection tool

The parent can inspect the deferred result body via a narrow explicit lookup path:

```text
read_agent_result_output(result_id)
```

Return shape:

```json
{
  "result_id": "string",
  "conversation_id": "string",
  "status": "completed | partial | blocked",
  "output": "string"
}
```

This tool is intentionally narrow:
- it fetches the deferred full body
- it includes `conversation_id` for future continuation use
- it avoids returning unnecessary metadata beyond what the parent needs for drill-down

## Parent Consumption Model

The parent should consume subagent returns in two stages.

### Default stage
Use only:
- `task`
- `status`
- `summary`
- reference metadata

### Conditional stage
Only call `read_agent_result_output(result_id)` when the parent needs:
- deeper synthesis
- detailed verification evidence
- richer follow-up planning
- clarification of blocked or partial work
- detailed implementation specifics from a worker lane

### Parent policy
The parent should:
- reason from `summary` first
- inspect `output` only when needed
- avoid blindly relaying child `output` to the user
- remain the synthesizer rather than becoming a relay for subordinate text

## UI Behavior

Subagent cards should render from the lightweight injected reference only.

Default visible fields:
- agent name
- task
- status
- summary

Default hidden field:
- output

This keeps subagent cards compact and readable while preserving full inspectability through explicit tooling.

## Resumeability and Continuation

Two identifiers serve different purposes:
- `result_id`: inspect the stored subagent result sidecar
- `conversation_id`: resume or continue the actual subagent session in the future

Important current-state note:
- subagent continuation should not be assumed to already exist in Daedalus runtime
- continuation wiring must be implemented explicitly as part of this redesign track

The presence of `conversation_id` in both the injected reference and the narrow read-tool response is therefore intentional future-proofing.

## Prompt Architecture Decision

This redesign distinguishes between:
- static role identity
- runtime execution contract

### Static prompt files should contain
- role identity and philosophy
- responsibilities and scope boundaries
- methodology
- role-specific discipline
- role-specific structure for the *contents* of `output`

Examples:
- Sage: research-report style content inside `output`
- Muse: plan content inside `output`
- Worker: implementation report inside `output`

### Runtime-built overlays should contain
- whether the agent is running in delegated-subagent mode
- the universal result-envelope requirement
- sidecar/result-id semantics
- summary-vs-output rules
- deferred-output inspection instructions
- resumed-subagent semantics when applicable
- execution-context-specific tool/runtime constraints if needed

This hybrid architecture is preferred over bloating static prompt files with many mode-specific conditional instructions.

## Prompt-Family Implications

### Daedalus
Daedalus is primary-only and never a subagent.

Its prompt/runtime contract should therefore be updated only for:
- consuming lightweight subagent references
- understanding that full child output is deferred
- using `read_agent_result_output(result_id)` when needed
- synthesizing from summary first

### Sage, Muse, Worker
These should remain reviewable as base role prompts, but delegated-mode envelope behavior should be supplied by runtime overlay rather than inlined entirely into the prompt file.

Their base prompts should still support role-specific result content inside `output`.

## Runtime Lifecycle

### On delegated subagent completion
1. Runtime captures the subagent's final result body.
2. Runtime parses/repairs the universal JSON envelope.
3. Runtime assigns a new `result_id`.
4. Runtime stores the full sidecar record in session/conversation persistence.
5. Runtime injects only the lightweight reference into parent context.
6. Runtime renders the UI card from that lightweight reference.

### On parent drill-down
1. Parent calls `read_agent_result_output(result_id)`.
2. Runtime resolves `result_id` against the sidecar store.
3. Runtime returns `result_id`, `conversation_id`, `status`, and `output`.

### On parse failure
If the child result is malformed:
- runtime should attempt repair/coercion
- if repair still fails, runtime should preserve the result in degraded form rather than dropping it
- degraded fallback should still produce a stored sidecar and a parent-visible reference, likely with `status` set to `partial` or `blocked`

## Design Rationale

This design is chosen because it:
- preserves the good part of Forge's result-envelope idea
- avoids Forge's raw-text fallback weakness
- keeps parent context lean
- improves UI clarity
- creates a clear future path for resumable subagent sessions
- avoids over-typing the result format too early
- avoids depending on the model to perfectly understand execution mode from static prompt prose alone

## Success Criteria

The redesign is successful if:
- delegated subagents return the universal envelope reliably
- parent context contains summary-first references rather than full raw child output
- UI subagent cards show summary without dumping the full body
- the parent can inspect deferred full output by `result_id`
- result sidecars are persisted and stable enough to support future continuation work
- static prompt files remain reviewable and role-focused
- runtime overlays carry delegated-mode contract details cleanly

## Open Implementation Tracks

The following still need concrete implementation design and planning:
- exact parser/coercion behavior for malformed subagent envelopes
- storage integration details in Daedalus's session/conversation model
- concrete `read_agent_result_output` tool design and registration
- prompt overlay injection mechanism for delegated mode
- subagent continuation wiring using `conversation_id`
- tests for no-auto-reinjection, sidecar creation, UI rendering, and explicit output drill-down

## Bottom Line

The redesigned Daedalus agent system should treat subagent returns as structured, deferred, inspectable artifacts.

The parent should see:
- what the child did
- whether it succeeded
- the short conclusion
- how to inspect more

The parent should not automatically inherit the child's full body text.

That is the central product decision of this redesign slice.
