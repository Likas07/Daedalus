# Agent Harness Comparison Methodology

## Purpose

Compare agent harnesses as systems for delivering reliable coding work, not as feature checklists.

The goal is to answer a concrete product question for Daedalus, such as:

- What should Daedalus borrow?
- What should Daedalus avoid?
- Where should Daedalus intentionally differentiate?
- Which harness architecture is easier to evolve safely?
- Which harness behaves better under realistic coding tasks?

If the comparison is not tied to a decision, it will produce trivia instead of guidance.

## Core Principles

### 1. Start from a decision
Define the comparison question before reading code.

Good framing:

- Which harness handles long-lived coding sessions best?
- Which tool architecture leads to fewer incorrect edits?
- Which extension model is safest to maintain?

Bad framing:

- Which harness has more features?
- Which repo looks more sophisticated?

### 2. Compare behavior before architecture
Run the same task suite against each harness first.

Only inspect internals after observing how they behave. This prevents overvaluing a codebase that looks elegant internally but performs worse in practice.

### 3. Use identical scenarios
Every harness should be evaluated against the same tasks, constraints, and success criteria.

A comparison is only credible if the workloads are normalized.

### 4. Weight reliability above novelty
For a coding harness, the most important properties are:

- correctness
- failure honesty
- observability
- edit safety
- recoverability
- architectural clarity

Prompt cleverness and feature count matter less.

### 5. Compare seams, not just capabilities
The most meaningful differences are often at subsystem boundaries:

- CLI vs runtime separation
- TUI vs orchestration separation
- native tools vs shell dependence
- static prompt assets vs prompts embedded in code
- single-agent loop vs orchestration model
- semantic tools vs regex-heavy workflows

These seams determine how safely the harness can evolve.

## Recommended Workflow

## Phase 1: Define the evaluation target
Write down:

- the decision to support
- the harnesses being compared
- the intended audience
- the weighting of criteria

Example:

- Decision: identify the best ideas to adapt into Daedalus
- Candidates: Daedalus plus the relevant peer harnesses in scope, for example Codex, OpenCode, Oh My Pi, Claw Code, ForgeCode, and Free Code
- Audience: Daedalus maintainers
- Priority: reliability and maintainability over breadth of features

## Phase 2: Build a common task suite
Use the same realistic coding tasks for every harness.

Recommended baseline suite:

1. Cold start on a medium-sized repo
2. Locate and explain a symbol
3. Implement a small multi-file change
4. Fix a failing test
5. Recover from an incorrect initial assumption
6. Use tools under uncertainty
7. Handle a long-running command or tool call
8. Resume after interruption

For each scenario, define:

- prompt or operator instruction
- repo and branch state
- expected result
- allowed tools and constraints
- verification method

Keep the tasks small enough to reproduce, but realistic enough to surface design tradeoffs.

## Phase 3: Run black-box evaluations
Execute the task suite and capture evidence.

For each run, record:

- full transcript
- tool calls
- resulting diff
- verification output
- failure modes
- retries or recovery behavior
- operator interventions required

Questions to answer:

- Did the harness choose the right tools?
- Did it scope the problem correctly?
- Did it fail honestly when wrong?
- Did it verify before claiming completion?
- Did it recover cleanly from mistakes?

This phase judges what the harness does, not how it is implemented.

## Phase 4: Run white-box architecture review
After behavior is observed, inspect each codebase to explain why the results happened.

Review areas:

- package and module boundaries
- runtime architecture
- tool abstraction layer
- state/session model
- prompt/template system
- extension or plugin model
- observability and tracing
- test strategy
- concurrency or subagent model
- sandboxing and approval boundaries

Focus on causal explanations, not code-tour trivia.

Example questions:

- Why did one harness recover better from tool failure?
- Why did another make edits safely but move more slowly?
- Why did the TUI expose state clearly or hide it?

## Phase 5: Score with explicit weighting
Use a scorecard with named criteria and explicit weights.

Recommended dimensions:

### A. Operator UX
- setup friction
- configuration ergonomics
- visibility into state, plan, and tool activity
- interruption and resume quality
- approval flow
- transcript readability

### B. Agent execution quality
- chooses appropriate tools
- scopes searches effectively
- handles ambiguity without flailing
- updates plans coherently
- fails honestly
- verifies claims before completion

### C. Harness architecture
- clear ownership boundaries
- reusable runtime design
- tool abstraction quality
- prompt system maintainability
- extension surface quality
- session/state model clarity
- concurrency model clarity

### D. Reliability under stress
- stale context handling
- tool failure handling
- partial failure recovery
- large repo behavior
- conflicting edit behavior
- non-happy-path robustness

### E. Cost to own
- package layout
- testability
- dependency weight
- runtime complexity
- portability
- ease of making safe changes

Use weights that reflect the decision being made. Do not pretend every criterion matters equally.

## Phase 6: Synthesize as decisions
Do not end with a generic winner/loser ranking.

Use this format instead:

### Borrow
Patterns Daedalus should adapt.

### Avoid
Patterns that introduce complexity, fragility, or poor UX.

### Differentiate
Areas where Daedalus should intentionally diverge.

This produces actionable product guidance instead of a shallow leaderboard.

## Evidence Requirements

A comparison is weak unless it includes evidence.

Minimum evidence per harness:

- scenario list
- transcripts or summarized run logs
- representative tool traces
- resulting code diffs where applicable
- verification artifacts
- notes on operator intervention
- architecture references for any internal claims

When making a code-architecture claim, cite the actual module, package, or file path.

When making a behavior claim, cite the actual run that demonstrated it.

## Recommended Output Template

```md
# Harness Comparison: <candidate set>

## Decision
What decision this comparison is intended to support.

## Candidates
The harnesses compared.

## Weights
How evaluation criteria were prioritized.

## Task Suite
The common scenarios used for evaluation.

## Results by Scenario
Observed behavior for each harness.

## Architecture Notes
Why each harness behaved the way it did.

## Scorecard
Weighted comparison across major dimensions.

## Borrow
Ideas worth adapting into Daedalus.

## Avoid
Patterns not worth carrying forward.

## Differentiate
Areas where Daedalus should be intentionally distinct.

## Final Recommendation
A concrete decision, not a vague summary.
```

## Common Failure Modes

Avoid these mistakes:

- comparing README claims instead of real behavior
- comparing feature lists without task execution
- comparing internals before running scenarios
- treating all criteria as equally important
- evaluating on vague "vibe"
- choosing a single winner when the real output should be selective borrowing
- ignoring failure handling and recoverability
- ignoring the cost of changing the harness later

## Suggested Daedalus-Specific Focus Areas

When comparing against peer harnesses in this workspace or outside it, pay special attention to:

- where agent logic actually lives
- how much logic is trapped in CLI glue vs reusable runtime
- how native search/edit capabilities are exposed
- how TUI concerns are separated from orchestration
- how observability is first-class or bolted on
- how sessions, planning, and recovery are represented
- how multi-agent or delegated work is structured

These are usually more important than surface-level parity.

## Short Version

1. Define the decision.
2. Run the same task suite on every harness.
3. Compare observed behavior first.
4. Inspect architecture second.
5. Use explicit weights.
6. Synthesize as Borrow / Avoid / Differentiate.
7. Recommend what Daedalus should actually do.
