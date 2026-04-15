# Intent Heuristic Learning Plan

Date: 2026-04-15
Status: proposed
Scope: `packages/coding-agent`

## Goal

Add a user-controlled workflow that improves heuristic intent detection over time from real Daedalus usage, without relying on full raw conversation replay or frequent model calls.

System should:
- learn from repeated user phrasing across sessions
- use turn-level intent labels already captured by Intent Gate v2
- ignore tool noise and most assistant output
- keep deterministic data collection separate from model-assisted suggestion review
- make learned behavior inspectable and approval-based

## Core idea

Split feature into two layers:

1. **Deterministic collector / aggregator**
   - cheap, frequent
   - extracts compact turn-level intent samples
   - aggregates phrase statistics across sessions
   - stores evidence only

2. **Model-assisted reviewer**
   - occasional, explicit
   - consumes aggregated stats only
   - proposes heuristic additions/adjustments
   - does not edit heuristics automatically without explicit user approval

## Why this shape

Benefits:
- avoids feeding tool calls, tool results, bash output, and long assistant prose into analysis
- keeps cost low
- reduces noise and improves signal quality
- gives transparent, reviewable evidence before heuristic changes
- allows future local/deterministic analysis even if model review is skipped

## Relevant existing primitives

Existing code already provides key pieces:
- turn-level intent metadata persistence via `intent` session entries
  - `packages/coding-agent/src/core/session-manager.ts`
- current/last intent access in runtime and extensions
  - `packages/coding-agent/src/core/agent-session.ts`
  - `packages/coding-agent/src/core/extensions/types.ts`
- slash command registration and persistence patterns
  - `packages/coding-agent/src/extensions/daedalus/workflow/handoff.ts`
  - `packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
  - `packages/coding-agent/src/extensions/daedalus/tools/tools.ts`

This means feature should operate primarily on:
- user message entries
- paired `intent` entries
- optionally session/project metadata

## Non-goals

Do not:
- analyze full raw transcripts by default
- read tool call / tool result content into learning dataset
- auto-apply heuristic changes silently
- let one session overwrite heuristics directly
- depend on a model for routine data collection

## Data model

### Turn sample

Create a compact turn-level record derived from session history.

Suggested fields:
- `sessionId`
- `cwd` or project fingerprint
- `timestamp`
- `userText`
- `surfaceForm`
- `finalIntent`
- `mutationScope`
- `readOnly`
- `intentSource` (`assistant-line`, maybe inferred/debug if useful)
- `mismatch` (whether provisional inferred intent differed from final visible intent)

Important: this record should be built from paired user-message + final intent metadata only.

### Aggregated phrase stats

Collector should aggregate interpretable features, for example:
- normalized leading phrases
- n-grams (likely 1-3 words)
- explicit stems/patterns
- counts per intent
- session count
- mismatch count
- confidence score

Suggested aggregate shape:
- `feature`
- `countsByIntent`
- `totalCount`
- `sessionCount`
- `mismatchCount`
- `currentHeuristicGuess`
- `topIntent`
- `confidence`
- `examples` (small capped sample)

## Input filtering rules

Collector should include only relevant session parts.

Include:
- user message entries
- final persisted `intent` entries
- maybe session/project ids and timestamps

Exclude:
- tool calls
- tool results
- bash execution output
- compaction summaries
- branch summaries
- long assistant responses except final `Intent:` label already persisted in `intent` metadata

This filtered pipeline is mandatory for accuracy and cost control.

## Command design

### Command A — deterministic collector

Purpose:
- collect current session’s turn-level intent-language evidence
- merge it into cross-session stats store

Characteristics:
- no model
- fast enough to run often
- can be invoked at session end or manually

Suggested responsibilities:
- walk session branch
- pair user turns with final intent entries
- extract normalized features from user text only
- update aggregate stats store
- report summary:
  - turns processed
  - new features observed
  - strong candidates emerging
  - ambiguous phrases skipped

Chosen command name:
- `/intent-collect`

Rationale:
- short
- obvious
- consistent with reviewer command
- avoids vague or overly long alternatives

### Command B — model-assisted reviewer

Purpose:
- read compact aggregated stats only
- propose heuristic additions/adjustments
- rank by confidence and value

Characteristics:
- explicit, occasional
- model-backed
- no raw full transcript input

Suggested output:
- strong candidate phrases to add
- phrases to strengthen/reweight
- ambiguous phrases to avoid
- mismatch hotspots
- global vs project-local suggestions

Chosen command name:
- `/intent-review`

Rationale:
- short
- obvious
- clearly paired with `/intent-collect`
- better than longer or vaguer alternatives

## Storage design

Use separate storage layers.

### Layer 1 — aggregate stats store

Purpose:
- deterministic evidence accumulation

Chosen default location:
- global stats: `~/.daedalus/agent/intent-stats.json`

Likely contents:
- phrase/feature counts
- confidence metrics
- example snippets
- project/global scope metadata

Reasoning:
- stats are most useful when aggregated across many sessions globally
- one global store keeps v1 simple
- avoids fragmenting evidence too early

### Layer 2 — learned heuristic preferences

Purpose:
- approved user- or project-specific heuristic overrides

This should be separate from base shipped heuristics.

Chosen default locations:
- global learned prefs: `~/.daedalus/agent/intent-heuristics.json`
- optional project-local learned prefs: `.daedalus/intent-heuristics.json`

Recommended scopes:
- global user preferences by default
- optional project-local preferences when explicitly requested

Reason:
- speech patterns differ by repo/context
- keeps defaults clean
- keeps learned behavior inspectable and reversible
- allows local overrides without forcing local stats stores in v1

## Suggestion thresholds

Model review should only propose changes when evidence is strong.

Recommended thresholds for candidate rules:
- minimum occurrences: at least 5
- minimum distinct sessions: at least 2 or 3
- dominant intent confidence: at least 75–80%
- preferably non-trivial mismatch impact against current heuristic baseline

Suggested ranking signal:
- confidence
- support count
- number of sessions
- mismatch reduction potential

High-value candidate example:
- phrase seen often
- dominant intent clear
- current heuristics misclassify it often

Low-value candidate example:
- phrase already handled correctly by defaults
- or phrase highly ambiguous

## Deterministic analysis first

Collector/aggregator should do most work without a model:
- tokenization / normalization
- phrase extraction
- counts per intent
- confidence computation
- ambiguity detection
- mismatch hotspot detection

Model should only help with:
- summarizing candidate changes
- grouping related phrases
- explaining proposed heuristic edits
- ranking or framing recommendations for user review

## Heuristic application model

Do not directly mutate source heuristics from review output.

Preferred flow:
1. deterministic collector updates stats
2. reviewer proposes changes
3. user approves selected changes
4. approved changes are written into learned heuristic preferences
5. runtime loads base heuristics + learned overrides

## Feature extraction guidance

Start simple and interpretable.

Strong initial features:
- leading 1-3 word phrases
- exact phrase variants like:
  - `how does`
  - `how do`
  - `why does`
  - `can you add`
  - `what do you think`
  - `look into`
- maybe normalized stem groups later

Avoid over-engineering early:
- no embeddings first
- no opaque clustering first
- no full semantic model dependence first

## Runtime integration target

Longer-term result should feed heuristic intent inference layer, not replace it entirely.

Recommended precedence:
1. explicit read-only/no-change override
2. learned local/global heuristic preferences
3. built-in default heuristics
4. fallback behavior

This keeps system deterministic and inspectable while still improving over time.

## Implementation phases

### Phase 1 — deterministic collection pipeline
- define turn-sample extraction from session data
- define aggregate stats file format
- add command to collect/update stats from current session
- add summary output for what was learned

### Phase 2 — cross-session aggregation and reporting
- aggregate across sessions
- add support/session-count/confidence calculations
- report strong vs ambiguous candidates deterministically
- expose mismatch metrics against current heuristics

### Phase 3 — model-assisted review command
- build compact reviewer input from aggregate stats only
- add slash command to request heuristic suggestions
- render suggested additions/strengthenings/ambiguities cleanly

### Phase 4 — approval + learned preferences
- define learned heuristic preference file format
- add user approval/apply workflow
- merge learned preferences into runtime heuristic inference

### Phase 5 — project/global scoping polish
- allow global-only or project-only learning/review
- improve ranking and candidate de-duplication
- add maintenance tools for pruning bad/old learned rules

## Acceptance criteria

### Collector command
- processes current branch session history without model calls by default
- ignores tool noise completely
- produces stable aggregate stats
- can be run repeatedly without corrupting data

### Reviewer command
- consumes only aggregate stats, not full raw transcript
- suggests only repeated, threshold-clearing patterns
- clearly marks ambiguous patterns as non-candidates
- distinguishes high-value suggestions from low-value obvious ones

### Learned preferences
- remain separate from base heuristics
- are inspectable and reversible
- default to global scope
- support project-local overrides as explicit opt-in

## Risks

### Overfitting
Mitigation:
- thresholding
- multi-session requirement
- approval-based application

### Bad labels from noisy turns
Mitigation:
- use final persisted intent entries only
- ignore turns without trustworthy final labels

### Ambiguous phrases
Mitigation:
- keep them as reports, not learned rules

### Hidden complexity
Mitigation:
- deterministic first
- interpretable features first
- no silent auto-learning

## Recommended defaults

### Collector scope
- default to current branch only
- do not analyze whole session tree by default
- consider `--all-branches` later if needed

Reason:
- current branch best reflects actual user path taken
- avoids abandoned branch noise and duplication

### Example storage policy
- store capped, sanitized examples only
- keep at most 2–3 examples per phrase/intent bucket
- trim long text
- strip obvious code/tool noise
- avoid unlimited raw example retention

Reason:
- reduces privacy and storage risk
- keeps examples useful for reviewer command
- avoids noisy phrase pollution

### Project-local learning default
- global learning on by default
- project-local learned overrides opt-in only

Reason:
- user speaking style usually generalizes across repos
- project-local-by-default would fragment learning too early

## Recommended next step

Implement Phase 1 first:
- deterministic turn-sample extractor
- session-end/manual collector slash command
- aggregate stats persistence
- compact stats report

That gives real data before any model-assisted review work begins.
