# Request-Level Intent Redesign Plan

Date: 2026-04-15
Status: proposed
Scope: `packages/coding-agent`
Related context:
- `plans/2026-04-15-intent-heuristic-learning.md`
- `plans/2026-04-15-intent-heuristic-learning-checklist.md`

## Goal

Redesign Intent Gate so it classifies **user requests**, not assistant execution substeps.

System should:
- classify intent once per user request
- keep that request intent stable across follow-up assistant turns for same request
- stop re-labeling same request based on mid-execution assistant behavior
- separate user-request intent from assistant turn-level execution mode
- ensure learning pipeline uses only request-level labels
- ensure policy enforcement uses request-level authorization, not drifting assistant self-orientation

## Problem statement

Current design stores intent at assistant-turn granularity.

That causes a semantic mismatch:
- persisted labels can reflect what assistant is doing *now* (`fix`, `investigation`, etc.)
- learning pipeline can interpret those labels as if they describe what user originally asked for
- extension-triggered turns with no fresh user message can be back-attributed to earlier user messages

Example failure mode:
1. user asks for planning
2. assistant emits `Intent: planning`
3. execution continues inside same request
4. assistant encounters issue and emits `Intent: fix`
5. learning collector ties later label back to earlier user request
6. stats now learn wrong phrase→intent mapping

Core flaw:
- system mixes **request intent** and **execution mode** into one per-turn artifact

## Design principles

- request intent and execution mode are not same thing
- request intent must be anchored to a user-originated request boundary
- request intent should remain stable unless a new request begins
- visible intent line should appear once per request, not once per assistant turn
- learning must only use request-linked labels
- policy should use request authorization, not assistant mid-flight mode drift
- extensions must explicitly declare when they start a new request
- ambiguous or unlinked intent records should be skipped, not guessed

## Target model

### 1. Request intent

Represents what user asked for.

Properties:
- one per user request
- anchored to a real or explicit synthetic user request boundary
- may be seeded provisionally from user text
- may be refined once from first assistant confirmation
- then locked for rest of request lifecycle

Suggested fields:
- `requestId`
- `userMessageId`
- `assistantMessageId?` (first confirming assistant response)
- `timestamp`
- `metadata`
  - `surfaceForm`
  - `trueIntent`
  - `approach`
  - `readOnly`
  - `mutationScope`
  - `planningArtifactKind`
  - `source`
  - `valid`
- `locked`

### 2. Turn mode

Represents what assistant is doing in a given assistant turn.

Properties:
- optional
- debug/runtime artifact only
- never source of truth for learning labels
- never allowed to overwrite request intent after request intent locked

Suggested fields:
- `requestId`
- `turnIndex`
- `mode`
- `reason`
- `source`

## Request boundary rules

### Starts a new request

New request begins only when one of these occurs:
- real user message (`role: user`)
- queued user follow-up or steer delivered as user message
- explicit extension action that semantically starts new user-level ask
- explicit synthetic request API usage from extension/runtime

### Does not start a new request

These must remain inside current request unless explicitly promoted:
- tool calls
- tool results
- retries
- compaction recovery
- branch summaries
- assistant follow-up turns
- extension custom messages
- execution nudges like “continue”, “execute step 1”, “fix encountered issue” unless marked as new request

## Visible intent contract

### Current issue

Current prompt says intent line appears on **every turn**.
That encourages repeated per-turn reclassification.

### New contract

Visible `Intent:` line should appear only on:
- first assistant turn after a new request begins

Visible `Intent:` line should not appear on:
- later assistant turns for same request
- tool loop follow-up turns
- execution continuation turns
- retry/recovery turns

### Runtime behavior

Harness should track whether current request still needs first-turn intent confirmation.

Proposed state:
- `activeRequestId`
- `currentRequestIntent`
- `requestIntentPendingConfirmation`

Flow:
1. new request created
2. provisional request intent seeded from user text
3. `requestIntentPendingConfirmation = true`
4. first assistant response for request may emit visible `Intent:` line
5. runtime parses line and locks request intent
6. `requestIntentPendingConfirmation = false`
7. later assistant turns ignore extra `Intent:` lines for request-level classification

## Policy model

Tool policy must use request intent.

Reason:
- user authorization belongs to request
- assistant substeps should not expand or shrink authorization mid-request

Examples:
- planning request stays docs-only even if assistant internally wants to “fix” something during plan execution
- research request remains non-mutating even if assistant discovers bug
- implementation request may still investigate/fix within authorized code-allowed scope without changing request label

## Learning model

Learning pipeline must consume only request-level labels.

### Collector input

Include only:
- request-linked user text
- locked request intent metadata
- request/session/project ids
- request timestamp

Exclude:
- turn mode
- assistant visible intent text
- tool calls/results
- internal continuation turns
- extension custom messages unless explicitly marked as request text

### Sample unit

Use one sample per request.

Not:
- one sample per assistant turn
- one sample per persisted intent entry

### Pairing rule

Collector should only accept directly linked request intent records.
If link missing or ambiguous, skip sample.

## Extension/runtime API design

Need explicit API distinction between:
- starting a new request
- continuing existing request

### Existing behavior to preserve semantically
- `sendUserMessage(...)` starts new request

### Proposed explicit extension controls

Add request-aware options for extension-triggered turns, for example:
- `startsRequest: boolean`
- `requestText?: string`
- or dedicated API for synthetic user requests

Default should be conservative:
- custom triggered turn does **not** start new request unless explicitly requested

If extension wants new request semantics:
- it must either send actual user message
- or explicitly create synthetic request with request text

## Session persistence design

### Preferred persisted entries

Add new entry type:
- `request_intent`

Optional debug entry:
- `turn_mode`

### `request_intent` responsibilities
- represent stable request-level classification
- be directly linked to request boundary
- be learner source of truth
- remain inspectable in session history

### `turn_mode` responsibilities
- optional operational/debug trace
- may explain what assistant did inside request
- never used as request label for learning

## Prompt/system prompt changes

### Change Intent Gate wording

Replace “every turn” framing with request-scoped framing.

Desired meaning:
- on first assistant turn after new user request, emit one visible intent line
- do not emit intent line again for same request

### Harness-assisted control

Runtime should know whether intent line expected for current request.
Prompt and/or per-turn injected context should reflect that.

Possible runtime behavior:
- when request needs confirmation, include rule telling model to emit intent line
- once request locked, omit that rule or explicitly tell model not to emit another intent line

## Acceptance criteria

### Request-level semantics
- one user request maps to one request intent record
- request intent does not drift across later assistant turns within same request
- request intent may be refined once, then locks

### Visible behavior
- first assistant turn after request shows one visible `Intent:` line
- later assistant turns in same request do not show another intent line
- repeated lines, if emitted anyway, do not overwrite request intent

### Learning safety
- collector produces one sample per request
- collector never falls back to nearest earlier user message for ambiguous records
- assistant operational substeps do not relabel earlier user text

### Policy safety
- policy evaluates against request intent
- assistant cannot self-upgrade request from planning/research into fix/implementation mid-request
- explicit read-only override still wins

### Extension behavior
- extension-triggered continuation turns do not silently become new requests
- extensions can explicitly start synthetic request when intended
- request boundaries remain inspectable and deterministic

## Implementation phases

### Phase 1 — request model and state
- define request-level types and persistence shape
- add runtime state for active request + pending confirmation
- create request boundary handling on new user message

### Phase 2 — first-turn-only visible intent
- update prompt contract from per-turn to per-request
- parse/lock first assistant intent line for request
- ignore repeated intent lines for same request classification

### Phase 3 — policy integration
- switch tool policy to request intent source of truth
- ensure locked request intent governs whole request lifecycle
- preserve explicit read-only override precedence

### Phase 4 — collector/learner alignment
- switch collector to request-level samples only
- require direct request linkage
- remove turn-level fallback behavior from learning path

### Phase 5 — extension API polish
- add explicit extension controls for starting synthetic requests
- document difference between continuation turns and new requests
- update plan-mode and similar workflows to use explicit request semantics where needed

### Phase 6 — docs and tests
- update intent-gate docs
- update SDK docs
- add request-level regression tests for learning/policy/runtime behavior

## Non-goals

Do not:
- redesign heuristic phrase extraction itself
- redesign confidence thresholds
- redesign all session history primitives outside intent/request boundary needs
- add migration work in this plan

## Recommended next step

Implement Phase 1 and Phase 2 first.

Those phases remove main semantic bug:
- request intent becomes stable
- visible line becomes once-per-request
- later phases can then safely update policy and learning on top of correct model
