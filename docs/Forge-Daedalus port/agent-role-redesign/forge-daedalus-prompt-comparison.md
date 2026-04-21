# Forge -> Daedalus Prompt Comparison

Status: review artifact
Purpose: side-by-side design reference for reviewing how closely each proposed Daedalus prompt mirrors its Forge counterpart and where it intentionally diverges.

## How to use this document

For each role below:
- "Forge baseline" identifies the source prompt or closest conceptual source in Forge
- "Daedalus-New target" identifies the proposed Daedalus prompt
- "What was copied structurally" describes similarities in organization and behavioral scaffolding
- "What was adapted" explains Daedalus-specific changes
- "Why the adaptation exists" explains the design intent

This is not a literal diff.
It is a design-level comparison meant to support prompt review and iteration.

---

## 1. Main Agent: Forge vs Daedalus

### Forge baseline
- `harnesses/forgecode/crates/forge_repo/src/agents/forge.md`

### Daedalus-New target
- `agent-role-redesign/Daedalus-New/Daedalus.md`

### Relationship
This is not a direct one-to-one port.
Daedalus is intentionally not a clone of Forge.
Instead, Daedalus absorbs Forge's strongest execution discipline while keeping a different top-level identity.

### What was copied structurally
- explicit identity section
- explicit task-discipline section
- explicit verification doctrine
- explicit tool-selection doctrine
- strong emphasis on tracked execution
- strong emphasis on verification before completion
- semantic-search-first discovery language

### What was adapted
- Daedalus remains the master artisan and primary orchestrator
- Daedalus owns delegation judgment and final synthesis
- Daedalus references Sage, Muse, and Worker explicitly
- Daedalus frames todo/plan discipline as craftsmanship rather than bureaucracy
- Daedalus uses `todo_read` / `todo_write` as explicit execution-state tools

### Why the adaptation exists
Forge is an implementation-first assistant.
Daedalus is intended to be an artisan-orchestrator that can implement directly but also governs a small specialist role system.
So the behavioral discipline is ported, but the identity and orchestration sovereignty are retained.

---

## 2. Research Specialist: Forge Sage vs Daedalus Sage

### Forge baseline
- `harnesses/forgecode/crates/forge_repo/src/agents/sage.md`

### Daedalus-New target
- `agent-role-redesign/Daedalus-New/Sage.md`

### Relationship
This is a close structural port.
Daedalus Sage now mirrors Forge Sage much more directly than before.

### What was copied structurally
- expert research/exploration assistant framing
- core principles section
- research capabilities section
- investigation methodology section
- response structure section
- investigation best practices section
- limitations and boundaries section
- strong read-only identity

### What was adapted
- Sage can be both:
  - a user-facing analysis agent
  - a delegated subagent
- Sage incorporates fused Scout behavior:
  - quick reconnaissance
  - minimum sufficient evidence gathering
  - explicit stop conditions
- delegated mode prefers compact findings bundles over long essays
- handoff language references Daedalus / Muse / Worker instead of Forge-specific agent transitions

### Why the adaptation exists
The Daedalus redesign intentionally fuses the old Scout role into Sage.
So Sage had to remain Forge-like as a research specialist while also taking on lightweight reconnaissance responsibilities.

---

## 3. Planning Specialist: Forge Muse vs Daedalus Muse

### Forge baseline
- `harnesses/forgecode/crates/forge_repo/src/agents/muse.md`

### Daedalus-New target
- `agent-role-redesign/Daedalus-New/Muse.md`

### Relationship
This is also a close structural port.
Daedalus Muse now mirrors Forge Muse heavily, with targeted adaptations for the Daedalus role system.

### What was copied structurally
- expert strategic planning assistant framing
- core principles section
- strategic analysis capabilities section
- planning methodology section
- detailed markdown action-plan format section
- planning best practices section
- boundaries and limitations section
- collaboration and handoff section
- checkbox-oriented planning discipline

### What was adapted
- Muse can consult Sage for targeted read-only research
- Muse emphasizes explicit parallel lanes and serialization boundaries
- Muse creates durable plan artifacts under `plans/`
- Muse is integrated into a Daedalus-first orchestration model
- Muse hands plans to Daedalus or Worker rather than a Forge-only execution path
- Muse explicitly avoids becoming a general orchestration peer to Daedalus
- Muse is expected to use `todo_write` when establishing or rewriting plan-derived execution state

### Why the adaptation exists
The desired Daedalus architecture keeps Daedalus as the top-level orchestrator.
So Muse must remain a planner, not become another top-level workflow governor.
At the same time, the Forge Muse -> Sage consultation relationship was intentionally copied over.

---

## 4. Implementation Lane: Forge vs Daedalus Worker

### Forge baseline
- `harnesses/forgecode/crates/forge_repo/src/agents/forge.md`

### Daedalus-New target
- `agent-role-redesign/Daedalus-New/Worker.md`

### Relationship
This is not a direct role-name match, but it is a strong behavioral adaptation.
Worker now mirrors much of Forge's implementation-assistant structure while remaining subordinate to Daedalus.

### What was copied structurally
- expert software engineering assistant framing
- core principles section
- task management section
- technical capabilities section
- implementation methodology section
- tool-selection section
- code output guidelines section
- explicit verification-before-completion behavior

### What was adapted
- Worker is framed as a bounded execution lane, not the primary assistant
- Worker is explicitly not a replacement orchestrator
- Worker is scoped to assigned task packets
- Worker uses `todo_read` / `todo_write` in lane-scoped ways
- Worker escalates back to Daedalus when broader judgment is needed
- Worker is warned not to become a planner or broad research lane

### Why the adaptation exists
In Forge, the main implementation agent is also the primary assistant.
In Daedalus, Worker is intentionally subordinate to Daedalus and exists to enable safe parallel execution.
So the implementation discipline is ported, but authority is reduced and scope is tightened.

---

## 5. Overall System Comparison

### Forge system shape
- Forge = primary implementation-oriented assistant
- Sage = read-only research specialist
- Muse = planning specialist

### Daedalus-New system shape
- Daedalus = primary artisan-orchestrator
- Sage = research specialist + scout fusion
- Muse = planning specialist with Sage consultation
- Worker = Forge-like implementation lane subordinate to Daedalus

### Key design thesis
The Daedalus redesign does not aim to clone Forge exactly.
It aims to:
- preserve Daedalus as the governing identity
- make Sage/Muse/Worker much more Forge-like structurally
- import Forge's discipline around todos, discovery, and verification
- keep Daedalus's orchestration role and craftsmanship framing

---

## 6. Review checklist

Questions to ask while reviewing the prompts:

1. Does Daedalus still feel like Daedalus at the top level?
2. Do Sage and Muse now mirror Forge closely enough to gain the intended behavioral benefits?
3. Is Worker close enough to Forge's implementation discipline without becoming a second Daedalus?
4. Are `todo_read` / `todo_write` consistently reflected across the prompt family?
5. Are there any remaining mismatches where a prompt still assumes the old Daedalus role model?
6. Is any adaptation preserving necessary Daedalus identity, or just adding unnecessary divergence?

---

## 7. Current judgment

At this stage, the prompt family can be summarized as:
- Daedalus = Daedalus identity + Forge-grade discipline
- Sage = near-ported Forge Sage + Scout fusion
- Muse = near-ported Forge Muse + Daedalus-first orchestration integration
- Worker = Forge-like implementation assistant adapted into a bounded execution lane

That is the current target design.
