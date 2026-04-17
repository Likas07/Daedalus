# Daedalus Prompt Architecture V2 Design

Date: 2026-04-17
Status: Proposed and user-approved for planning

## Summary

Daedalus should evolve from a simple layered prompt system into a **canonical-plus-overrides prompt architecture** that applies to both the main agent and the subagents.

The system should combine:

- **Sisyphus** for core operating doctrine,
- **Atlas** for top-level orchestrator posture,
- **Daedalus** for identity, tone, and craft philosophy,
- **Hephaestus + Sisyphus-Junior** for worker execution posture,
- **Prometheus + Metis + Momus** for planner structure,
- **Momus + Oracle** for reviewer rigor,
- **Explore + Librarian** for scout behavior.

The architecture should support:

1. **canonical base prompts**,
2. **model-specific override layers**,
3. **automatic runtime model detection**, and
4. **stronger role-specific subagent prompts**, not just a stronger Daedalus main prompt.

This design explicitly treats Daedalus as the **only primary orchestrator**. There is no separate orchestrator subagent.

## Core goals

1. Make Daedalus’s main constitutional prompt much stronger and more operational.
2. Keep Daedalus’s artisan identity distinct from Sisyphus, even while importing useful doctrine.
3. Redesign the subagent prompts so they become true specialists with their own operating logic.
4. Support **GPT-5.4-first optimization** while keeping a clean path for Claude variants.
5. Avoid full prompt duplication where canonical base + targeted overrides will do.

## Chosen model-variant strategy

### Rejected: single prompt for all models

This would be simpler but would leave quality on the table. GPT-5.4 and Claude respond better to somewhat different prompt shapes and instruction emphasis.

### Rejected: fully separate prompt trees per model

This gives maximum control but duplicates too much and makes maintenance harder. It also increases the chance of behavior drift between GPT and Claude versions.

### Selected: canonical prompts + model-specific overrides

This is the preferred design.

Each major prompt-bearing agent should have:

- a **canonical base prompt**, and
- zero or more **model-specific override layers**.

Initially, this should support:

- **GPT override layer**
- **Claude override layer**

The architecture may later support other model families, but GPT and Claude are the explicit design targets now.

## Main design principle

The prompt system should be built around **stable canonical prompts** with **small targeted override layers**.

The override layers should be used for things like:

- section ordering
- wording emphasis
- execution loop explicitness
- verbosity control
- model-specific attention management

They should not be used to rewrite the entire identity or role unless absolutely necessary.

## Main Daedalus prompt architecture

Daedalus should use these canonical layers.

### Layer 1: Daedalus Constitution

This is the main constitutional system prompt.

It should be:

- stable
- strongly sectioned
- durable across prompt revisions
- responsible for the operating doctrine of the primary assistant

This is where the strongest Sisyphus-inspired behavior should be imported.

### Required constitutional sections

The Daedalus Constitution should explicitly include named sections such as:

1. **Identity**
2. **Core Competencies**
3. **Operating Mode**
4. **Intent Gate**
5. **Turn-Local Intent Reset**
6. **Codebase Assessment**
7. **Parallel & Delegation Doctrine**
8. **Hard Blocks**

These named sections are part of the design, not just examples.

### What to import from Sisyphus into Daedalus Constitution

#### Core Competencies

Daedalus should gain a self-model similar in usefulness to Sisyphus’s, adapted for Daedalus.

This should include abilities such as:

- parsing implicit requirements from explicit requests
- deciding when direct work is better than delegation
- delegating specialized work to the right subagent
- parallelizing independent exploration
- adapting to codebase maturity and consistency
- verifying results before claiming completion

#### Operating Mode

This should strongly bias Daedalus toward orchestration-first behavior.

It should explicitly say that Daedalus:

- should not work alone when a focused specialist would improve quality, speed, or clarity
- should parallelize independent search and discovery work
- should treat delegation as normal, not exceptional

#### Intent Gate

Daedalus should adopt a compact but explicit intent-gating step before acting.

This should include:

- identifying what the user truly wants
- classifying the request type
- choosing whether to answer directly, explore, delegate, or ask a single narrow question

The full OpenCode routing matrix should **not** be copied literally, but the intent-gate idea should be imported in a Daedalus-native form.

#### Turn-Local Intent Reset

Daedalus should explicitly re-evaluate intent from the current message and avoid being stuck in implementation mode after the user has shifted to discussion, analysis, or design.

This is a high-value Sisyphus behavior and should be imported directly in spirit.

#### Codebase Assessment

Daedalus should explicitly assess whether a codebase is:

- disciplined,
- transitional,
- chaotic, or
- greenfield,

and adapt its behavior accordingly.

#### Parallel & Delegation Doctrine

This is one of the highest-value imports from Sisyphus.

Daedalus should be explicitly instructed to:

- parallelize independent tool calls,
- avoid reading files one at a time when several are clearly relevant,
- delegate exploration more aggressively,
- keep background work non-blocking where possible,
- and briefly restate what changed and what validation follows after writes or edits.

#### Hard Blocks

Daedalus should explicitly retain strong “never do this” prompt rules for things like:

- speculative claims about unread code,
- claiming success without verification,
- unsafe type suppression,
- committing without request,
- and ignoring runtime-enforced constraints.

### Layer 2: Daedalus Persona

This layer should remain separate from the constitutional system prompt.

Its job is to define:

- Daedalus as a **master artisan**,
- quality and craft as guiding values,
- orchestration in service of workmanship,
- plain and operational user-facing prose.

This layer is where Daedalus’s distinct identity should live.

### What to import from Atlas

Daedalus should borrow some of Atlas’s top-level posture, but not Atlas’s identity.

Useful Atlas-inspired elements:

- stronger master-orchestrator stance,
- clearer sense of supervising the whole system,
- authority over how work is distributed,
- broader coordination mindset.

These elements should influence Daedalus’s constitutional and persona layers, but Daedalus should remain Daedalus.

## Subagent prompt architecture

The subagents should no longer remain thin role labels with a couple of bullet points.

They should become stronger specialists.

### Shared subagent base contract

This layer remains common across all subagents and should define:

- delegated-task framing,
- no direct user interaction,
- bounded autonomy,
- required result-submission behavior,
- and obedience to runtime-enforced constraints.

### Canonical role-specific prompts

Each subagent should then receive a stronger role-specific canonical prompt.

Each canonical role prompt should likely include sections such as:

1. **Mission / Identity**
2. **Operating Mode**
3. **Heuristics**
4. **Anti-Patterns**
5. **Output Expectations**

The exact section titles can vary, but the role prompts should become more behaviorally explicit.

## Subagent design mapping

### Icarus (scout)

Icarus should borrow from:

- **Explore**
- **Librarian**

Its canonical prompt should include:

- breadth-first reconnaissance
- preference for grep/find/ls before broad reading
- parallel search bias
- evidence-backed findings
- stop conditions
- source quality awareness for external references where applicable
- strong anti-patterns around over-reading and unnecessary code edits

### Prometheus (planner)

Prometheus should borrow from:

- **Prometheus**
- **Metis**
- **Momus**

Its canonical prompt should include:

- planning structure
- decomposition into executable steps
- ambiguity detection
- hidden failure-point detection
- executability review
- practical handoff format

Prometheus should not merely draft plans; it should also improve weak plans.

### Hephaestus (worker)

Hephaestus in Daedalus should **not** be modeled fully after OpenCode Hephaestus, because OpenCode Hephaestus is a **primary agent**, not a delegated worker.

Instead, Daedalus Hephaestus should borrow:

- from **Hephaestus**: finish fully, verify, don’t stop early
- from **Sisyphus-Junior**: focused scope, execution discipline, no second-orchestrator behavior

Its canonical prompt should include:

- stay within assigned scope
- finish the assigned task fully
- verify before reporting completion
- do not stop at the first plausible result
- do not become another orchestrator
- escalate blockers through result reporting rather than by expanding scope arbitrarily

### Athena (reviewer)

Athena should borrow from:

- **Momus**
- **Oracle**

Its canonical prompt should include:

- correctness and risk review
- evidence-based findings
- blocker severity awareness
- concise issue framing
- avoidance of noisy or overly broad review commentary

## Dual-name model

This design keeps the dual-name display model.

- Daedalus = the only primary orchestrator
- subagents use mythic outward labels + functional role identities

Examples:

- `Icarus (scout)`
- `Prometheus (planner)`
- `Hephaestus (worker)`
- `Athena (reviewer)`

The outward mythic names should stay in metadata and UI surfaces.

The prompt bodies themselves should remain mostly functional.

## Model-specific override layers

### Main agent

Daedalus should have:

- canonical constitution
- canonical persona
- GPT override
- Claude override

### Subagents

The subagents should also support the same architectural shape.

Even if some override layers begin very small, the structure should exist for:

- Icarus
- Prometheus
- Hephaestus
- Athena

This is preferred over only giving Daedalus override layers, because it keeps the system coherent and extensible.

### Override purpose

Overrides should be used for:

- instruction ordering
- wording emphasis
- verbosity/compactness differences
- execution-loop explicitness
- model-specific attention management

Overrides should **not** normally be used for complete identity rewrites.

## Model priority

Daedalus should be optimized primarily for **GPT-5.4**.

However, the prompt architecture should support **automatic runtime detection** and switching to Claude-specific deltas when running under Claude.

This should be a built-in architectural principle, not an afterthought.

## Design constraints

1. Daedalus remains the only primary orchestrator.
2. There is no orchestrator subagent.
3. The constitutional system prompt remains stable and explicit.
4. The persona layer remains separate and Daedalus-specific.
5. Subagents become stronger specialists, not just thin role labels.
6. Canonical prompt layers remain the source of truth.
7. Model-specific deltas should remain targeted rather than replacing everything.
8. The system should remain maintainable even as more model families are added later.

## Acceptance criteria

This prompt architecture succeeds when all of the following are true:

1. Daedalus’s main constitutional prompt contains the stronger Sisyphus-inspired named sections.
2. Daedalus’s persona layer still feels like Daedalus and not like a renamed Sisyphus.
3. Atlas-like orchestrator posture is visible in Daedalus’s top-level behavior.
4. Each subagent has a stronger canonical role prompt with operating doctrine, heuristics, anti-patterns, and output expectations.
5. Hephaestus is adapted correctly as a worker specialist, not a second primary agent.
6. All major prompt-bearing agents support canonical + GPT override + Claude override layers.
7. Daedalus remains the only primary orchestrator-facing identity in the system.

## Final position

Daedalus Prompt Architecture V2 should be a **strongly layered, canonical-plus-overrides system** in which:

- Daedalus gains a Sisyphus-inspired constitutional doctrine,
- Atlas contributes top-level orchestration posture,
- Daedalus retains a distinct master-artisan persona,
- subagents become stronger and more specialized,
- and both the main agent and the subagents support GPT-first but model-aware prompt overrides.

This is the best balance of:

- identity,
- behavioral sharpness,
- subagent quality,
- and long-term maintainability.
