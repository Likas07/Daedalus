# Request-Level Intent Redesign — Execution Checklist

Date: 2026-04-15
Status: proposed
Related plan: `plans/2026-04-15-request-level-intent-redesign.md`
Scope: `packages/coding-agent`

## Ship target

Redesign Intent Gate so:
- intent classification is **request-level**, not assistant-turn-level
- visible `Intent:` line appears **once per user request**, not once per turn
- policy enforcement uses **request intent**
- learning collector uses **request-linked request intent only**
- assistant execution-mode drift cannot relabel earlier user text

---

## Phase 1 — Request model and runtime state

### 1.1 Define request-level types

#### Files likely touched
- `packages/coding-agent/src/core/intent-gate.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- maybe new file if cleaner:
  - `packages/coding-agent/src/core/intent-request.ts`

#### Checklist
- [ ] Define `requestId` concept
- [ ] Define request-level metadata shape
- [ ] Add persisted entry type for request intent
- [ ] Optionally define separate turn-mode/debug type
- [ ] Keep request intent distinct from assistant execution mode

#### Expected types
- [ ] `RequestIntentEntry`
- [ ] request-level metadata/state interfaces
- [ ] active request runtime state shape

---

### 1.2 Track active request lifecycle in runtime

#### Files likely touched
- `packages/coding-agent/src/core/agent-session.ts`

#### Checklist
- [ ] Create new request on real user message
- [ ] Store `activeRequestId`
- [ ] Seed provisional request intent from user text
- [ ] Track `requestIntentPendingConfirmation`
- [ ] Lock request intent after first valid assistant confirmation
- [ ] Prevent later assistant turns from overwriting locked request intent

#### Important invariants
- [ ] one active request at a time
- [ ] one request intent record per request
- [ ] request intent may refine once before lock

---

## Phase 2 — First-turn-only visible intent contract

### 2.1 Update system prompt contract

#### Files touched
- `packages/coding-agent/src/core/intent-gate.ts`
- `packages/coding-agent/src/core/system-prompt.ts`

#### Checklist
- [ ] Replace “every turn” wording with “first assistant turn after new request” wording
- [ ] Tell assistant not to emit repeated `Intent:` lines for same request
- [ ] Ensure prompt remains brief and deterministic

---

### 2.2 Enforce first-turn-only parsing behavior

#### Files touched
- `packages/coding-agent/src/core/agent-session.ts`

#### Checklist
- [ ] Parse visible `Intent:` line only while request confirmation pending
- [ ] Lock request intent after first valid parsed line
- [ ] Ignore later `Intent:` lines for request classification
- [ ] Keep later repeated lines from mutating request authorization

#### Behavior expectations
- [ ] first assistant response after request may confirm intent
- [ ] later assistant responses for same request do not change request intent

---

## Phase 3 — Policy uses request intent

### 3.1 Switch policy source of truth

#### Files touched
- `packages/coding-agent/src/core/intent-policy.ts`
- `packages/coding-agent/src/core/agent-session.ts`

#### Checklist
- [ ] Tool policy evaluates request intent, not drifting per-turn assistant mode
- [ ] Explicit read-only override still wins
- [ ] Planning request stays docs-only through whole request lifecycle
- [ ] Research request remains non-mutating unless new request begins
- [ ] Implementation/fix requests remain code-allowed as appropriate

#### Regression cases
- [ ] planning request cannot self-upgrade into fix mid-request
- [ ] research request cannot self-upgrade into implementation mid-request
- [ ] implementation request can still investigate/fix internally without relabeling request

---

## Phase 4 — Collector and learner alignment

### 4.1 Move collector to request-level samples

#### Files touched
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/collect.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/filter.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/types.ts`

#### Checklist
- [ ] Collect one sample per request
- [ ] Use request-linked user text only
- [ ] Use locked request intent only
- [ ] Remove turn-level sample semantics from learning path
- [ ] Keep tool noise excluded

---

### 4.2 Remove ambiguous back-attribution in learning path

#### Files touched
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/filter.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/collect.ts`

#### Checklist
- [ ] Do not fall back to nearest previous user message for learning
- [ ] Skip sample when direct request linkage missing
- [ ] Ensure extension-triggered continuation turns do not become mislabeled user samples

#### Safety rule
- [ ] better skip uncertain sample than poison stats

---

## Phase 5 — Extension and SDK request semantics

### 5.1 Make new-request creation explicit for extensions

#### Files likely touched
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/extensions/*` runtime wiring

#### Checklist
- [ ] Distinguish continuation turn vs new request in extension-triggered prompts
- [ ] Add explicit option for synthetic request start if needed
- [ ] Keep `sendUserMessage(...)` as clear new-request boundary
- [ ] Default custom triggered turns to continuation semantics

---

### 5.2 Update built-in workflows to use explicit request semantics

#### Files likely touched
- `packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
- any other workflow that uses `triggerTurn: true`

#### Checklist
- [ ] Audit all extension-triggered turns
- [ ] Mark true new requests explicitly
- [ ] Leave pure continuation turns inside current request
- [ ] Verify plan execution flow no longer relabels planning request as fix mid-run

---

## Phase 6 — Docs

### Files likely touched
- `packages/coding-agent/README.md`
- `packages/coding-agent/docs/intent-gate.md`
- `packages/coding-agent/docs/sdk.md`
- maybe `packages/coding-agent/docs/extensions.md`

### Checklist
- [ ] Document request-level intent model
- [ ] Document visible `Intent:` line as once-per-request
- [ ] Document separation of request intent vs execution mode
- [ ] Document extension semantics for synthetic requests
- [ ] Document learning collector as request-level only

---

## Tests to add/update

### Runtime intent behavior
#### New/updated tests
- [ ] `packages/coding-agent/test/intent-request-runtime.test.ts`
- [ ] update `packages/coding-agent/test/intent-gate.test.ts`
- [ ] update `packages/coding-agent/test/intent-session-entry.test.ts`

#### Checklist
- [ ] request intent created on user message
- [ ] first assistant turn locks request intent
- [ ] later assistant turns do not overwrite locked request intent
- [ ] repeated visible `Intent:` lines ignored after lock

---

### Policy behavior
#### New/updated tests
- [ ] update `packages/coding-agent/test/intent-policy.test.ts`

#### Checklist
- [ ] planning request remains docs-only through continuation turns
- [ ] research request remains non-mutating through continuation turns
- [ ] implementation request remains code-allowed without request relabeling
- [ ] explicit read-only override still takes precedence

---

### Learning behavior
#### New/updated tests
- [ ] update `packages/coding-agent/test/intent-learning-collect.test.ts`
- [ ] add request-level collector test file if cleaner

#### Checklist
- [ ] one request produces one sample
- [ ] continuation turns do not produce extra learning samples
- [ ] no nearest-user fallback in uncertain cases
- [ ] extension-triggered continuation turns do not relabel prior user request

---

### Extension workflow behavior
#### New/updated tests
- [ ] plan-mode execution regression test
- [ ] any extension-triggered turn regression tests needed

#### Checklist
- [ ] execute-plan flow does not create unintended request relabeling
- [ ] synthetic new-request path works only when explicit

---

## Tight execution order

### Step 1
- [ ] define request-level entry/types/state
- [ ] wire active request tracking in runtime

### Step 2
- [ ] change prompt contract to once-per-request
- [ ] parse + lock first assistant confirmation only

### Step 3
- [ ] switch policy to request intent
- [ ] verify read-only/planning/code scopes still work

### Step 4
- [ ] update collector to request-level samples
- [ ] remove ambiguous fallback behavior

### Step 5
- [ ] add explicit extension request semantics
- [ ] patch built-in workflows using `triggerTurn: true`

### Step 6
- [ ] docs updates
- [ ] regression tests

---

## Definition of done

### Request semantics
- [ ] one user request → one request intent
- [ ] request intent stable across same-request assistant turns
- [ ] visible `Intent:` line appears once per request only

### Policy
- [ ] policy uses request intent, not per-turn drift
- [ ] assistant cannot silently self-upgrade authorization mid-request

### Learning
- [ ] learner uses request-linked labels only
- [ ] no back-attribution from continuation turns to old user messages
- [ ] no per-turn label drift in aggregate stats

### Extensions
- [ ] extension-triggered continuation turns stay in same request by default
- [ ] explicit synthetic request start exists for workflows that truly need new request boundary

### Documentation
- [ ] docs describe request-level model clearly
- [ ] docs no longer describe visible intent as every-turn behavior
