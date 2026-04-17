# Daedalus Prompt Architecture Design

Date: 2026-04-16
Status: Proposed and user-approved for planning

## Summary

Daedalus should adopt a layered prompt architecture that clearly separates:

1. the **main constitutional system prompt**,
2. the **Daedalus orchestrator persona layer**,
3. the **shared subagent base contract**, and
4. the **role-specific subagent prompts**.

The design should take inspiration from:

- **OpenCode / oh-my-openagent** for strong named agent identity, orchestration philosophy, and memorable agent naming,
- **oh-my-pi** for prompt layering, shared contracts, and clean separation between reusable prompt rules and role-specific instructions,
- **Forgecode** for template discipline and keeping prompt content externalized rather than scattering inline prompt strings through code.

The resulting system should make the primary assistant feel unmistakably like **Daedalus**, while keeping subagent prompts and safety constraints operational, maintainable, and low-drama.

## Core design goals

1. Make **Daedalus** the clear primary user-facing agent identity.
2. Keep the **main system prompt** stable, constitutional, and not over-dependent on theatrical flavor.
3. Put most of Daedalus's identity and style into a separate **orchestrator persona layer**.
4. Keep **subagent prompts mostly functional**, even when outward naming is mythic.
5. Separate **persona text** from **runtime-enforced policy**.
6. Support a naming model where subagents have **mythic display names** and **functional role identities** at the same time.
7. Keep the user-facing prose plain and operational rather than theatrical.

## Naming philosophy

### Daedalus identity

Daedalus should be framed as a **master artisan**, not primarily as a builder or architect.

The identity should encode:

- skilled craft
- intentional making
- careful judgment
- adaptation to material and constraint
- coordination of specialized labor without losing authorship or taste

Daedalus is not merely a dispatcher. Daedalus is the craft-bearing primary intelligence that decides when to work directly and when to hand focused work to specialists.

This matters because the main agent identity should imply:

- discernment rather than generic helpfulness
- craftsmanship rather than procedural bureaucracy
- orchestration in service of quality, not orchestration as spectacle

### Subagent naming philosophy

Subagents should use **dual naming**:

- **outward display name**: mythic, memorable, product-facing
- **functional role**: operational, plain, implementation-facing

Examples:

- `Hephaestus (worker)`
- `Prometheus (planner)`
- `Athena (reviewer)`
- `Icarus (scout)` or another chosen research/scouting name

The mythic name exists for:

- labels
- `/agents`
- `/subagents`
- status surfaces
- run inspection and logs intended for human reading

The functional role exists for:

- routing logic
- internal reasoning about capability boundaries
- prompt discipline
- implementation clarity

### Important constraint

The prompts themselves should **not** become mythic roleplay scripts.

The design explicitly rejects heavy theatrical language inside the working prompt text. The system should be memorable in naming but operational in execution.

## Prompt layering model

Daedalus should use four explicit prompt layers.

### Layer 1: Main constitutional system prompt

This is the durable top-level instruction layer for the primary assistant.

It should define:

- core mission
- communication principles
- tool-use philosophy
- verification expectations
- safety constraints
- how delegated work relates to direct work

It should **not** carry most of the mythic branding. It may acknowledge that the assistant is Daedalus, but its main job is to define the invariant operating constitution.

This layer should be:

- stable
- reusable
- low-flavor
- easy to revise without rewriting persona text

### Layer 2: Daedalus persona / orchestrator layer

This layer should define the primary assistant as **Daedalus**.

It should encode:

- the Daedalus identity as a master artisan
- orchestration philosophy
- delegation heuristics
- how Daedalus speaks about delegated work
- the expectation that Daedalus is the primary point of contact

This is where the system should say, in effect:

- who Daedalus is
- how Daedalus chooses to delegate
- what Daedalus optimizes for when delegating versus acting directly

This layer is the best place to make Daedalus feel distinct without contaminating the core constitutional prompt with too much style.

### Layer 3: Shared subagent base contract

Every subagent should receive the same shared contract before role-specific instructions.

This base contract should define:

- you are operating on a delegated task
- you do not speak directly to the user
- you stay within runtime constraints
- you use only the tools and access granted
- you return through the required result mechanism
- you do not improvise outside your assignment

This layer should remain concise and highly reusable.

### Layer 4: Role-specific prompt files

Each subagent role should then receive its own role-specific prompt.

Each role prompt should answer:

- what this role is for
- what it should optimize for
- what it should avoid
- what a successful completion looks like

These prompts should stay mostly functional.

The role file may contain outward metadata such as display name and description, but the behavioral instructions should stay pragmatic rather than theatrical.

## Separation of concerns

This design depends on a strict separation of concerns.

### Persona layer responsibilities

Persona layers define:

- identity
- tone
- communication style
- orchestration philosophy
- how the agent conceptualizes its role

### Behavioral contract responsibilities

Behavioral contract layers define:

- what to do
- what not to do
- completion expectations
- verification rules
- delegation rules

### Runtime policy responsibilities

Runtime policy should remain authoritative for:

- tool restrictions
- writable/readable paths
- spawn restrictions
- depth/concurrency constraints
- result submission enforcement

Prompts may mention these rules, but they should not be the source of truth.

This follows the best lesson from the current Daedalus runtime and from Pi: prompts describe behavior, but the runtime enforces boundaries.

## User experience implications

### Main user-facing identity

The user should always feel they are talking to **Daedalus**.

The main conversation should not refer to “switching into orchestrator mode” or “turning on the orchestrator.”

Daedalus is simply the assistant.

### Subagent naming in the UI

The user-facing UX should use **dual display names**.

Examples:

- `Delegating implementation to Hephaestus (worker).`
- `Prometheus (planner) returned a 4-step plan.`
- `Athena (reviewer) found one high-risk issue.`

### User-facing prose style

Even though the names are mythic, the prose should remain plain.

Good:

- concise
- direct
- operational

Bad:

- roleplay-heavy
- theatrical narration
- over-symbolic wording in routine status updates

The design goal is **mythic identity, plain UX prose**.

## Comparison to reference systems

### OpenCode / oh-my-openagent

What to borrow:

- strong named primary identity
- clear agent specialization
- memorable subagent naming
- orchestration-first behavior

What not to borrow wholesale:

- prompt density that tightly couples identity, orchestration, and constraints into one giant prompt
- excessive reliance on mythology inside working prompt text

### oh-my-pi

What to borrow:

- shared subagent contract
- layered prompt composition
- prompt architecture discipline
- keeping reusable contract text separate from role text

What not to borrow wholesale:

- a more protocol-heavy tone than Daedalus needs for its user-facing primary identity

### Forgecode

What to borrow:

- externalized templates / markdown prompt files
- keeping prompt content maintainable and inspectable
- dynamic context injection separated from static prompt content

What not to borrow wholesale:

- an overly dry or generic identity model that would weaken Daedalus’s distinct brand

## Chosen architecture

### Rejected: fully in-character top-level system prompt

This would make Daedalus’s constitutional layer too dependent on the current brand voice. It would also make safety and orchestration rules harder to evolve cleanly.

### Rejected: purely functional prompt system with no strong naming layer

This would make the system cleaner on paper but would discard too much of the identity value the user explicitly wants.

### Selected: constitutional core + Daedalus persona overlay + functional subagent prompts

This is the preferred design.

It gives Daedalus:

- a strong and memorable primary identity
- clean operational boundaries
- maintainable prompt composition
- functional subagent behavior
- room to evolve routing and subagent taxonomy without rewriting the entire system voice

## File architecture direction

The future prompt stack should likely evolve toward explicit prompt files or templates for each layer.

Recommended prompt content units:

- `daedalus-constitution.md`
- `daedalus-persona.md`
- `subagent-base-contract.md`
- one file per role prompt

Possible supporting metadata structure for each role:

- display mythic name
- functional role name
- description
- routing hints
- tool policy references
- execution mode/isolation preferences

The exact file names can change, but the design should preserve the conceptual split between:

- constitutional layer
- persona layer
- shared subagent contract
- role prompt layer

## Constraints for the design

1. The main system prompt must remain understandable even if the Daedalus persona layer changes later.
2. Runtime safety must not depend on prompt wording.
3. Subagent prompts must remain functional, concise, and role-bounded.
4. Mythic naming must primarily live in metadata, labels, and display surfaces.
5. User-facing prose should stay plain rather than theatrical.
6. Daedalus should remain the primary named identity, not merely one persona among many.

## Acceptance criteria

The prompt architecture succeeds when all of the following are true:

1. The primary assistant clearly feels like **Daedalus**.
2. The main constitutional system prompt is still stable and low-flavor.
3. Daedalus’s artisan identity is carried mainly by the persona/orchestrator layer.
4. Subagents can appear as `Mythic Name (functional-role)` in the UI.
5. Subagent prompts still read like practical role instructions rather than mythic roleplay.
6. Prompt identity and runtime policy are cleanly separated.
7. The architecture is maintainable enough to evolve with future subagent and routing changes.

## Final position

Daedalus should use a **layered prompt architecture** in which:

- the **main system prompt** is constitutional and stable,
- the **Daedalus persona layer** carries the identity of a master artisan,
- the **shared subagent base contract** defines common delegated-task behavior,
- and the **role prompts** stay mostly functional even when the UI presents mythic names.

This gives Daedalus the strongest balance of:

- identity,
- clarity,
- maintainability,
- and operational correctness.
