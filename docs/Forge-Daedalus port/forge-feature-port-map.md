# Forge Feature Port Map for Daedalus

Status: reconnaissance draft
Purpose: identify additional Forge features that may be worth porting into Daedalus beyond prompts, search tooling, and todo redesign.

## How to read this document

For each feature area below:
- "Forge feature" describes the capability visible in Forge
- "Value to Daedalus" explains why it might matter
- "Port recommendation" classifies it as:
  - High
  - Medium
  - Low
  - Watchlist
- "Suggested adaptation" explains how it should be translated into Daedalus rather than copied blindly

This document is intentionally strategic rather than implementation-level.

---

## 1. Conversation Management as a First-Class UX Surface

### Forge feature
Forge exposes unusually rich conversation management:
- interactive conversation switching
- resume by id
- previous-conversation toggle
- clone/branch conversation
- rename conversation
- dump/export conversation
- compact conversation

Visible in:
- `harnesses/forgecode/README.md`
- sections around conversation management and CLI subcommands

### Value to Daedalus
High.
If Daedalus is becoming more orchestrator-centric and plan-driven, stronger conversation/thread management is useful for:
- trying alternate implementation directions
- preserving exploratory branches
- creating clean handoff threads
- revisiting prior investigations and plans

### Port recommendation
High

### Suggested adaptation
Daedalus should not copy Forge's exact command surface, but it should strengthen:
- branch/fork session ergonomics
- resume/switch discoverability
- lightweight export/inspectability
- explicit support for branching exploratory work

---

## 2. Conversation Cloning / Branching as a Routine Workflow

### Forge feature
Forge treats cloning/branching conversations as a normal workflow action.

### Value to Daedalus
High.
This is especially aligned with Daedalus's artisan-orchestrator identity:
- test a new direction without losing the old one
- explore alternative plans safely
- compare approaches after a handoff or planning fork

### Port recommendation
High

### Suggested adaptation
Integrate with Daedalus's existing handoff / branching model rather than adding a separate disconnected feature.

---

## 3. Worktree / Sandbox Start Flow

### Forge feature
Forge exposes:
- `forge --sandbox <name>`
which creates an isolated git worktree + branch and starts there.

### Value to Daedalus
High.
This aligns strongly with:
- safe experimentation
- branch isolation for risky changes
- subagent lane isolation
- benchmark-friendly safe mutation patterns

### Port recommendation
High

### Suggested adaptation
Daedalus already has branch-isolation ideas in subagents. The opportunity is to make isolation a more visible top-level UX primitive, not just a subagent runtime setting.

---

## 4. Provider-Specific Task Models (session / commit / suggest)

### Forge feature
Forge distinguishes model/provider configuration for:
- session work
- commit generation
- command suggestion generation

Visible in README and service/config surfaces.

### Value to Daedalus
Medium to High.
Different tasks often want different model qualities:
- coding / orchestration
- commit summarization
- shell suggestion
- maybe research/planning

### Port recommendation
Medium-High

### Suggested adaptation
Daedalus could adopt role/task-specific model routing more explicitly, especially for:
- Daedalus main session
- Muse planning
- commit-message generation if added
- shell suggestion / command translation if added

---

## 5. Natural-Language Shell Suggestion (`suggest`)

### Forge feature
Forge supports translating natural language into a shell command:
- CLI command
- shell-buffer / zsh integration

### Value to Daedalus
Medium.
Useful for developer ergonomics, especially if Daedalus wants to become a more daily-driver coding shell.
Less important than search/todo/subagent discipline for benchmark behavior.

### Port recommendation
Medium

### Suggested adaptation
Could be added as a focused utility flow rather than a core orchestration primitive.
Useful, but not essential to the main Daedalus research/planning/execution stack.

---

## 6. AI Commit Workflow

### Forge feature
Forge has a dedicated commit workflow:
- immediate commit generation
- preview-before-commit mode
- separate model config for commit generation

### Value to Daedalus
Medium.
This is strong product polish for a coding agent and could improve end-to-end workflow satisfaction.
Not central to the current architecture redesign, but worthwhile later.

### Port recommendation
Medium

### Suggested adaptation
Prefer preview-first and explicit user approval. Frame it as a craftsmanship aid rather than automatic repo mutation.

---

## 7. Zsh `:` Prefix Shell Integration

### Forge feature
Forge deeply integrates with the shell via `:` commands.

### Value to Daedalus
Medium to Low, depending on product direction.
Great ergonomics for a personal daily-driver tool.
Probably not central to benchmark performance or prompt architecture.

### Port recommendation
Watchlist

### Suggested adaptation
Only port if Daedalus wants to become a shell-native daily-driver. Otherwise this risks becoming attractive distraction work.

---

## 8. Skills as a Highly Visible User Feature

### Forge feature
Forge prominently exposes skills:
- built-in skills
- project-local vs global skills
- skill creation workflow
- explicit skill listing and invocation

### Value to Daedalus
High.
Daedalus already has skills as a concept, but Forge shows how to make them feel more user-visible and operational.
This pairs well with Daedalus's artisan identity and plan-driven redesign.

### Port recommendation
High

### Suggested adaptation
Focus on:
- making skills easier to discover
- distinguishing project-local vs global usage
- creating stronger “plan execution” and “workflow memory” affordances
- exposing skill scaffolding / creation ergonomics

---

## 9. Built-In `execute-plan` Skill as a Product Primitive

### Forge feature
Forge includes an `execute-plan` skill that turns a plan artifact into tracked execution.

### Value to Daedalus
Very High.
This is one of the most structurally aligned features with your current redesign work:
- Muse writes plans
- Daedalus / Worker execute
- todo discipline tracks execution

### Port recommendation
Very High

### Suggested adaptation
This should likely become one of the earliest skill-level ports after the prompt/tool redesign stabilizes.

---

## 10. Workspace Indexing / Semantic Search Workflow UX

### Forge feature
Forge doesn't just have semantic search internally; it has a workspace UX around it:
- workspace init
- sync
- status
- info
- indexed workspace concept

### Value to Daedalus
High.
If Daedalus ports `sem_search`, the surrounding lifecycle matters too.
A semantic tool without indexing lifecycle UX is weaker as a real product feature.

### Port recommendation
High

### Suggested adaptation
Do not stop at the tool. Design:
- indexing lifecycle
- readiness/status visibility
- re-sync/update behavior
- workspace-scoped mental model for Sage/Muse/Daedalus

---

## 11. MCP Configuration / Management Surface

### Forge feature
Forge exposes MCP configuration clearly in docs and services.

### Value to Daedalus
Medium-High.
MCP becomes more valuable as Daedalus grows role/task specialization.
External tools can feed Sage, Muse, or Daedalus main agent differently.

### Port recommendation
Medium-High

### Suggested adaptation
Focus on making MCP configuration understandable and role-compatible, not merely adding raw transport support.

---

## 12. Permission / Policy Service Surface

### Forge feature
Forge has a fairly explicit policy/permission service model.

### Value to Daedalus
High.
Given Daedalus's emphasis on careful delegation, branch isolation, and safe execution, this is deeply aligned.

### Port recommendation
High

### Suggested adaptation
Tie it to:
- destructive command confirmation
- sandbox/worktree flows
- role-specific allowances (Sage read-only, Worker bounded write, etc.)

---

## 13. Undo / Snapshot-Oriented File Recovery

### Forge feature
Forge exposes undo/file snapshot services.

### Value to Daedalus
Medium-High.
This improves safety and supports more confident execution.
Especially useful if Daedalus is going to be more autonomous and benchmark-aggressive.

### Port recommendation
Medium-High

### Suggested adaptation
If Daedalus already has related capabilities, consider making them more visible and workflow-friendly rather than inventing another mechanism.

---

## 14. AGENTS.md as a Strong Customization Surface

### Forge feature
Forge prominently documents AGENTS.md as a persistent instruction surface and automatically reads it.

### Value to Daedalus
High.
You have already been thinking in these terms. Stronger AGENTS.md/project-instruction integration is aligned with Daedalus's role system and project-specific craftsmanship identity.

### Port recommendation
High

### Suggested adaptation
Make project instruction loading:
- explicit
- inspectable
- consistent across Daedalus / Sage / Muse / Worker

---

## 15. Agent Registry / Custom Agent Overrides

### Forge feature
Forge has a visible agent registry model with built-in, global, and project-local agents.

### Value to Daedalus
High.
This strongly supports your evolving role system and experimentation workflow.

### Port recommendation
High

### Suggested adaptation
Daedalus should likely formalize:
- built-in role prompts
- project-local overrides
- maybe global role/agent overrides
- precedence rules

This is especially useful since you're actively iterating on prompt families.

---

## 16. Rich Workspace / Semantic Server Lifecycle

### Forge feature
Forge has explicit workspace server and indexing lifecycle concepts behind semantic search.

### Value to Daedalus
Medium-High.
Important if semantic search becomes central.

### Port recommendation
Medium-High

### Suggested adaptation
This may end up being part of the `sem_search` productization effort rather than a separate feature.

---

## 17. Better Provider Login / Credential UX

### Forge feature
Forge has visible provider login/configuration flows.

### Value to Daedalus
Medium.
Important for product polish, especially if Daedalus broadens provider/task specialization.
Not central to the current architecture redesign.

### Port recommendation
Medium

### Suggested adaptation
Treat as product polish after core role/tooling shifts stabilize.

---

## 18. Shell-First Session Commands and Inspectability

### Forge feature
Forge exposes a lot of discoverable session commands:
- info
- tools
- skill
- conversation controls
- provider/config switches

### Value to Daedalus
Medium-High.
As Daedalus grows role sophistication, inspectability becomes more important.
Users need to see:
- current role
- current plan/task state
- active tools
- active model/provider
- current branch/session state

### Port recommendation
Medium-High

### Suggested adaptation
Lean into inspectability over novelty.
This likely pairs well with your artisan-orchestrator identity.

---

## Priority shortlist

### Highest-value candidates beyond current work
1. `execute-plan` style plan execution skill
2. workspace/indexing lifecycle UX around semantic search
3. worktree/sandbox top-level UX
4. stronger AGENTS.md / project instruction integration
5. agent registry / project-local override model
6. permission/policy surface hardening
7. richer conversation branching/resume UX
8. stronger skills discoverability / creation UX

### Medium-value candidates
9. undo / snapshot recovery UX improvements
10. provider/task-specific model routing
11. MCP management UX
12. session inspectability commands
13. commit workflow
14. suggest workflow

### Watchlist / optional
15. zsh `:` prefix shell integration

---

## Design thesis

The useful Forge features are mostly not about aesthetics.
They cluster around four themes:
- execution discipline
- safe experimentation
- inspectable state
- user-visible workflow primitives

That suggests the next wave of Forge -> Daedalus ports should prioritize features that:
- improve state clarity
- improve safe autonomy
- improve plan/research/execution transitions
- reduce hidden workflow friction

Those are the Forge strengths most likely to compound with the role redesign already underway.
