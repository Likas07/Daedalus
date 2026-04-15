# Intent Heuristic Learning — Implementation Checklist

Date: 2026-04-15
Status: proposed
Related plan: `plans/2026-04-15-intent-heuristic-learning.md`
Scope: `packages/coding-agent`

## Ship target

Implement two explicit commands:
- `/intent-collect` — deterministic session-to-stats collector
- `/intent-review` — model-assisted reviewer over aggregated stats only

Defaults:
- collector analyzes **current branch only**
- collector uses **user messages + final intent entries only**
- stats store is global: `~/.daedalus/agent/intent-stats.json`
- learned preferences default global: `~/.daedalus/agent/intent-heuristics.json`
- optional project override: `.daedalus/intent-heuristics.json`
- examples are **capped + sanitized**
- project-local learning is **opt-in**, not default

---

## Phase 1 — Deterministic collector (`/intent-collect`)

### 1.1 Define collector data types

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/types.ts`

#### Checklist
- [ ] Define turn-sample types
- [ ] Define aggregate stats types
- [ ] Define per-feature counts/confidence shape
- [ ] Define compact sanitized example shape
- [ ] Define file version markers for future migrations

#### Expected types
- `IntentTurnSample`
- `IntentFeatureStats`
- `IntentStatsFile`
- `IntentExampleSnippet`
- maybe `IntentCollectSummary`

---

### 1.2 Add deterministic turn-sample extractor

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/collect.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/filter.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/normalize.ts`

#### Existing files likely touched
- `packages/coding-agent/src/core/session-manager.ts` (only if helper accessors are missing)

#### Checklist
- [ ] Walk current branch entries only
- [ ] Pair user message entries with final `intent` entries by turn ordering / message ids
- [ ] Exclude all tool calls, tool results, bash output, summaries, and unrelated custom entries
- [ ] Produce one compact sample per labeled turn
- [ ] Skip unlabeled or malformed turns safely
- [ ] Add sanitization helpers for example snippets
- [ ] Cap stored examples to 2–3 per feature/intent bucket

#### Input contract
Include only:
- user message text
- final intent metadata
- session/project/timestamp metadata

Exclude:
- tool noise
- assistant prose beyond persisted intent metadata

---

### 1.3 Add feature extraction + aggregation

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/features.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/aggregate.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/confidence.ts`

#### Checklist
- [ ] Extract leading 1–3 word phrases
- [ ] Extract explicit phrase variants first (`how does`, `how do`, `why does`, `can you add`, etc.)
- [ ] Count by final intent
- [ ] Track total count
- [ ] Track distinct session count
- [ ] Track mismatch count where available
- [ ] Compute dominant intent + confidence
- [ ] Flag ambiguous features deterministically
- [ ] Record current heuristic guess for later comparison/reporting

#### First-pass feature set
- [ ] Leading 1-gram
- [ ] Leading 2-gram
- [ ] Leading 3-gram
- [ ] Exact key phrase map for known high-signal patterns

---

### 1.4 Add stats storage layer

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/storage.ts`

#### Existing files likely touched
- `packages/coding-agent/src/config.ts` (if you want dedicated helper for `intent-stats.json` path)

#### Checklist
- [ ] Read/write global stats file at `~/.daedalus/agent/intent-stats.json`
- [ ] Make writes atomic or at least consistent with existing storage patterns
- [ ] Add schema version field
- [ ] Merge new collection results into existing stats file
- [ ] Ensure repeated collector runs do not corrupt store
- [ ] Decide dedupe strategy per session/turn so reruns do not double-count

#### Important decision to implement now
- collector must be **idempotent enough** for manual reruns
- likely need stored per-turn sample ids or per-session collected checkpoints

---

### 1.5 Add `/intent-collect` command

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-collect.ts`

#### Existing files touched
- `packages/coding-agent/src/extensions/daedalus/bundle.ts`

#### Checklist
- [ ] Register `/intent-collect`
- [ ] Run deterministic collection on current session branch
- [ ] Merge into global stats store
- [ ] Return compact summary to user
- [ ] Show:
  - turns processed
  - features updated
  - strong candidates emerging
  - ambiguous features skipped
- [ ] Avoid model calls entirely

#### Output expectations
Keep output compact and evidence-oriented.

---

## Phase 2 — Cross-session reporting polish

### 2.1 Add deterministic reports over aggregate stats

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/report.ts`

#### Checklist
- [ ] Sort features by confidence/support
- [ ] Separate strong candidates from ambiguous phrases
- [ ] Compute mismatch hotspots against current heuristic guess
- [ ] Provide deterministic “top patterns” summary
- [ ] Keep report input model-free and transcript-free

#### Report sections
- [ ] strong candidates
- [ ] ambiguous phrases
- [ ] high-mismatch phrases
- [ ] already-covered / low-value phrases

---

## Phase 3 — Model-assisted reviewer (`/intent-review`)

### 3.1 Build compact reviewer input

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/review-prompt.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/review-format.ts`

#### Existing helpers reused
- `packages/coding-agent/src/extensions/daedalus/shared/model-auth.ts`
- patterns from:
  - `packages/coding-agent/src/extensions/daedalus/workflow/handoff.ts`
  - `packages/coding-agent/src/extensions/daedalus/workflow/qna.ts`

#### Checklist
- [ ] Build reviewer input from aggregate stats only
- [ ] Do not pass raw full transcript
- [ ] Include only compact evidence:
  - phrase
  - counts by intent
  - total count
  - session count
  - confidence
  - mismatch rate
  - capped sanitized examples
- [ ] Provide clear output format request for model

---

### 3.2 Add `/intent-review` command

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-review.ts`

#### Existing files touched
- `packages/coding-agent/src/extensions/daedalus/bundle.ts`

#### Checklist
- [ ] Register `/intent-review`
- [ ] Require UI/model similarly to existing review-style commands if needed
- [ ] Load aggregate stats file
- [ ] Refuse to run if not enough evidence collected
- [ ] Send compact stats to model
- [ ] Render suggestions clearly:
  - add candidate rule
  - strengthen candidate rule
  - ambiguous, do not add
  - global vs project-local suggestion
- [ ] No auto-apply in this phase

---

## Phase 4 — Learned heuristic preferences

### 4.1 Define learned preferences file format

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/preferences.ts`

#### Existing files likely touched
- `packages/coding-agent/src/config.ts` (optional helper for preferences path)
- `packages/coding-agent/src/core/intent-gate.ts`

#### Checklist
- [ ] Define global learned preferences format
- [ ] Define optional project-local override format
- [ ] Add version field
- [ ] Keep structure inspectable and hand-editable

#### File targets
- global: `~/.daedalus/agent/intent-heuristics.json`
- project-local opt-in: `.daedalus/intent-heuristics.json`

---

### 4.2 Add approval/apply workflow

#### New files
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-learning/apply.ts`

#### Existing files likely touched
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-review.ts`

#### Checklist
- [ ] Add explicit accept/apply flow for reviewer suggestions
- [ ] Support writing to global preferences by default
- [ ] Support project-local write as explicit option only
- [ ] Do not silently mutate shipped heuristics source

---

### 4.3 Load learned preferences into runtime heuristic inference

#### Existing files touched
- `packages/coding-agent/src/core/intent-gate.ts`
- `packages/coding-agent/src/core/sdk.ts` (if loader/runtime wiring needed)
- possibly `packages/coding-agent/src/core/resource-loader.ts` or nearby bootstrapping path if that is best place to source preferences

#### Checklist
- [ ] Load global learned preferences at startup/session creation
- [ ] Optionally merge project-local overrides when present
- [ ] Apply precedence:
  1. explicit read-only override
  2. learned preferences
  3. built-in defaults
  4. fallback behavior
- [ ] Keep matching deterministic and debuggable

---

## Phase 5 — Optional polish

### 5.1 Scope controls

#### Existing/new files possibly touched
- `packages/coding-agent/src/core/settings-manager.ts` (only if settings toggle added)
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-collect.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/intent-review.ts`

#### Checklist
- [ ] Add opt-in project-local apply option
- [ ] Consider `--all-branches` later, not in v1 default
- [ ] Consider pruning stale/low-value learned rules later

---

## Docs to update

### Existing docs likely touched
- `packages/coding-agent/README.md`
- `packages/coding-agent/docs/sdk.md`
- `packages/coding-agent/docs/intent-gate.md`
- maybe `packages/coding-agent/docs/extensions.md` if slash command docs belong there

### Checklist
- [ ] Document `/intent-collect`
- [ ] Document `/intent-review`
- [ ] Document filtered-input design (no tool noise)
- [ ] Document storage files and scopes
- [ ] Document approval-based learned preferences

---

## Tests to add

### Deterministic collector
#### New test files
- `packages/coding-agent/test/intent-learning-collect.test.ts`
- `packages/coding-agent/test/intent-learning-features.test.ts`
- `packages/coding-agent/test/intent-learning-storage.test.ts`

#### Checklist
- [ ] pairs user turns with final intent entries correctly
- [ ] ignores tool noise completely
- [ ] extracts expected phrases
- [ ] computes counts/confidence correctly
- [ ] stores capped sanitized examples
- [ ] rerun/merge behavior is safe

### Reviewer prep
#### New test files
- `packages/coding-agent/test/intent-learning-review-input.test.ts`

#### Checklist
- [ ] reviewer payload excludes raw transcript/tool noise
- [ ] reviewer payload contains compact evidence only
- [ ] insufficient-data cases handled cleanly

### Learned preferences
#### New test files
- `packages/coding-agent/test/intent-learning-preferences.test.ts`

#### Checklist
- [ ] global preferences load correctly
- [ ] project-local override merges correctly
- [ ] precedence over built-in heuristics works as expected

---

## Tight implementation order

### Step 1
- [ ] `intent-learning/types.ts`
- [ ] `intent-learning/filter.ts`
- [ ] `intent-learning/normalize.ts`
- [ ] `intent-learning/collect.ts`

### Step 2
- [ ] `intent-learning/features.ts`
- [ ] `intent-learning/aggregate.ts`
- [ ] `intent-learning/confidence.ts`
- [ ] `intent-learning/storage.ts`

### Step 3
- [ ] `intent-collect.ts`
- [ ] register in `extensions/daedalus/bundle.ts`
- [ ] tests for deterministic collection

### Step 4
- [ ] `intent-learning/report.ts`
- [ ] deterministic stats summary polish

### Step 5
- [ ] `intent-learning/review-prompt.ts`
- [ ] `intent-learning/review-format.ts`
- [ ] `intent-review.ts`
- [ ] register in `extensions/daedalus/bundle.ts`
- [ ] tests for compact reviewer input

### Step 6
- [ ] `intent-learning/preferences.ts`
- [ ] `intent-learning/apply.ts`
- [ ] runtime merge into `core/intent-gate.ts`
- [ ] tests for learned preference precedence

### Step 7
- [ ] docs updates
- [ ] final command UX cleanup

---

## Definition of done

### `/intent-collect`
- [ ] deterministic only
- [ ] current branch only by default
- [ ] tool noise excluded
- [ ] updates global stats file
- [ ] outputs compact useful summary

### `/intent-review`
- [ ] consumes aggregate stats only
- [ ] suggests repeated/high-confidence patterns only
- [ ] highlights ambiguous phrases instead of learning them
- [ ] does not auto-apply changes

### Runtime heuristics integration
- [ ] approved learned rules load cleanly
- [ ] global default + project-local opt-in works
- [ ] behavior remains transparent and reversible
