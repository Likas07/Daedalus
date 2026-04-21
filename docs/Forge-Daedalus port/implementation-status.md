# Forge -> Daedalus Implementation Status

Status: live status tracker
Purpose: track milestone-by-milestone implementation progress, verification state, and next steps in one place.

## Current summary

Completed in first implementation pass:
- Milestone 1 — Tool-Call Robustness Hardening
- Milestone 2 — Todo Redesign (`todo_read` / `todo_write`)
- Milestone 3 — Search Tooling Redesign (`sem_search` + `fs_search`)
- Milestone 4 — Pending-Work Enforcement
- Milestone 5 — Semantic Workspace Lifecycle
- Milestone 6 — Doom-Loop Detection (Phase 1)
- Milestone 7 — Plan Execution Primitive (`execute-plan` direction)
- Milestone 8 — Plan-Mode / Todo Convergence
- Milestone 9 — Role-Aware Performance Tuning
- Milestone 10 — Secondary Plumbing Refinements
- Milestone 11 — UX / Daily-Driver Pass

Planning/design docs exist for:
- Milestones 0 through 11

Important caveat:
- targeted milestone tests are passing
- repo-wide `bun run check` is not fully green because of pre-existing unrelated typecheck issues outside this implementation slice

## Milestone table

| Milestone | Title | Status | Notes |
|---|---|---|---|
| 0 | Design Freeze for Current Prompt / Tool Direction | planned / mostly stabilized | roadmap and backlog docs exist; implementation not tracked as a distinct code milestone |
| 1 | Tool-Call Robustness Hardening | implemented (first pass) | repair/normalization layer added; regression tests added |
| 2 | Todo Redesign (`todo_read` / `todo_write`) | implemented (first pass) | structured todo model, merge/replace semantics, legacy compatibility, UI updates |
| 3 | Search Tooling Redesign (`sem_search` + `fs_search`) | implemented (first pass) | new tools added, bundled, and prompt guidance updated |
| 4 | Pending-Work Enforcement | implemented (first pass) | reminder hook, dedupe logic, settings toggle, tests added |
| 5 | Semantic Workspace Lifecycle | implemented (first pass) | workspace init/sync/status/info lifecycle added; sem_search is now readiness-aware |
| 6 | Doom-Loop Detection (Phase 1) | implemented (first pass) | repeated completion attempts with active work now trigger soft anti-stall intervention |
| 7 | Plan Execution Primitive (`execute-plan` direction) | implemented (first pass) | execute_plan added with resumable plan-state initialization from markdown artifacts |
| 8 | Plan-Mode / Todo Convergence | implemented (first pass) | plan-mode now persists and exposes structured shared task state |
| 9 | Role-Aware Performance Tuning | implemented (first pass) | specialist roles now have tuned search/task-state capabilities and doctrine |
| 10 | Secondary Plumbing Refinements | implemented (first pass) | compaction/branch-summary settings ergonomics improved |
| 11 | UX / Daily-Driver Pass (Deferred) | implemented (first pass) | status dashboard and /status command added for daily-driver inspectability |

## Implemented milestones: details

### Milestone 1 — Tool-Call Robustness Hardening

Status: implemented (first pass)

What landed:
- safe tool-argument repair/normalization in `packages/ai/src/utils/validation.ts`
- support for:
  - stringified JSON arguments
  - partial JSON recovery
  - enum case normalization where unambiguous
  - singleton-to-array coercion for array-typed fields
- better diagnostics when validation still fails after repairs

Primary files:
- `packages/ai/src/utils/validation.ts`
- `packages/ai/test/validation.test.ts`

Verification:
- targeted validation tests passing

### Milestone 2 — Todo Redesign (`todo_read` / `todo_write`)

Status: implemented (first pass)

What landed:
- new canonical todo state model with:
  - `id`
  - `content`
  - `status`
- statuses supported:
  - `pending`
  - `in_progress`
  - `completed`
  - `cancelled`
- new tools:
  - `todo_read`
  - `todo_write`
- merge/replace write semantics
- legacy `todo` compatibility wrapper retained
- deterministic migration from legacy numeric-id / boolean-done state
- richer `/todos` UI rendering

Primary files:
- `packages/coding-agent/src/extensions/daedalus/tools/todo-state.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- `packages/coding-agent/test/todo-tools.test.ts`

Verification:
- todo lifecycle tests passing
- migration tests passing

### Milestone 3 — Search Tooling Redesign (`sem_search` + `fs_search`)

Status: implemented (first pass)

What landed:
- `fs_search` added for exact filesystem/content discovery
- `sem_search` added for fuzzy semantic-style discovery
- both tools bundled into Daedalus default extension set
- system prompt guidance updated to prefer them when available

Primary files:
- `packages/coding-agent/src/extensions/daedalus/tools/fs-search.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts`
- `packages/coding-agent/src/extensions/daedalus/bundle.ts`
- `packages/coding-agent/src/extensions/daedalus/index.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/test/search-redesign-tools.test.ts`

Verification:
- targeted search tool tests passing
- prompt tests passing

### Milestone 4 — Pending-Work Enforcement

Status: implemented (first pass)

What landed:
- active-work semantics based on todo state
- completion-boundary reminder logic in `AgentSession`
- deduplication for unchanged active todo sets
- settings toggle:
  - `settings.pendingWork.enabled`
- reminder rendering integrated with todo tooling

Primary files:
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- `packages/coding-agent/test/pending-work-enforcement.test.ts`

Verification:
- pending-work enforcement tests passing

### Milestone 5 — Semantic Workspace Lifecycle

Status: implemented (first pass)

What landed:
- semantic workspace persistence under project-local `.daedalus/semantic-workspace.json`
- lifecycle tools:
  - `sem_workspace_init`
  - `sem_workspace_sync`
  - `sem_workspace_status`
  - `sem_workspace_info`
- explicit readiness states:
  - `uninitialized`
  - `initialized`
  - `ready`
  - `stale`
- sem_search now requires a ready index and fails clearly when workspace state is not ready
- stale index detection based on workspace fingerprint changes

Primary files:
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts`
- `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`

Verification:
- lifecycle tests passing
- broader search regression tests passing

### Milestone 6 — Doom-Loop Detection (Phase 1)

Status: implemented (first pass)

What landed:
- extended loop detector with completion-attempt tracking
- doom-loop soft intervention when the assistant repeatedly attempts completion while active todo work remains unchanged
- integration with real todo state signatures rather than text-only state
- negative coverage for healthy long tasks and changed-active-work cases
- doom-loop reminder rendering in UI

Primary files:
- `packages/coding-agent/src/core/control-plane/loop-detector.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- `packages/coding-agent/test/control-plane-loop-detector.test.ts`
- `packages/coding-agent/test/doom-loop-detection.test.ts`

Verification:
- loop-detector tests passing
- doom-loop integration tests passing

### Milestone 7 — Plan Execution Primitive (`execute-plan` direction)

Status: implemented (first pass)

What landed:
- shared markdown plan artifact parser with stable numbered-step format
- support for optional lane metadata and verification criteria in plan artifacts
- new `execute_plan` primitive for initializing tracked execution state from a markdown artifact
- resumable plan-state initialization against existing tracked todos
- `/execute-plan` command for user-triggered plan activation

Primary files:
- `packages/coding-agent/src/extensions/daedalus/workflow/plan-execution/shared.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/plan-execution/index.ts`
- `packages/coding-agent/test/plan-execution-primitive.test.ts`

Verification:
- execute_plan tests passing
- stable plan-metadata parsing tests passing

### Milestone 8 — Plan-Mode / Todo Convergence

Status: implemented (first pass)

What landed:
- plan-mode rewritten to persist and operate on structured shared task state
- plan-mode now emits `plan-execution-state` custom entries that the shared todo substrate can reconstruct
- unified normal-mode toolset includes todo_read/todo_write/execute_plan
- todo reconstruction and pending-work enforcement now recognize plan execution custom state

Primary files:
- `packages/coding-agent/src/extensions/daedalus/workflow/plan-mode/index.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/todo-state.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/todo.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/test/planmode-todo-convergence.test.ts`
- `packages/coding-agent/test/tool-state-migration.test.ts`

Verification:
- plan/todo convergence tests passing
- plan-mode tool restoration regression tests passing

### Milestone 9 — Role-Aware Performance Tuning

Status: implemented (first pass)

What landed:
- scout/planner/worker/reviewer tool policies tuned for role-specific search and task-state access
- semantic roles now have semantic workspace readiness tools where needed
- scout/reviewer bash leak removed from role policy
- bundled role prompts updated with role-specific doctrine for sem_search/fs_search/todo_write/execute_plan usage
- bundled agent metadata updated to reflect runtime policy more accurately

Primary files:
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/scout.md`
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/planner.md`
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/worker.md`
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/reviewer.md`
- `packages/coding-agent/test/role-aware-performance-tuning.test.ts`

Verification:
- role-aware tuning tests passing
- related starter-pack, prompt override, and subagent system-prompt regressions passing

### Milestone 10 — Secondary Plumbing Refinements

Status: implemented (first pass)

What landed:
- compaction settings ergonomics improved with explicit setters for:
  - compaction reserve tokens
  - compaction keep-recent tokens
  - branch-summary reserve tokens
  - branch-summary skip-prompt behavior
- settings-manager tests now cover the new persistence and retrieval paths

Primary files:
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/test/settings-manager.test.ts`

Verification:
- compaction ergonomics tests passing

### Milestone 11 — UX / Daily-Driver Pass

Status: implemented (first pass)

What landed:
- new `status_overview` tool for compact session/workspace inspectability
- new `/status` command for a daily-driver dashboard message
- status view includes:
  - cwd
  - active model
  - pending-message presence
  - semantic workspace readiness
  - todo summary when present
- status dashboard renderer added to the default bundle

Primary files:
- `packages/coding-agent/src/extensions/daedalus/ui/status-dashboard.ts`
- `packages/coding-agent/src/extensions/daedalus/bundle.ts`
- `packages/coding-agent/src/extensions/daedalus/index.ts`
- `packages/coding-agent/test/status-dashboard.test.ts`

Verification:
- status dashboard tool and command tests passing

## Verification snapshot

Targeted passing suite from the implementation pass included:
- `packages/ai/test/validation.test.ts`
- `packages/coding-agent/test/tool-state-migration.test.ts`
- `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`
- `packages/coding-agent/test/todo-tools.test.ts`
- `packages/coding-agent/test/pending-work-enforcement.test.ts`
- `packages/coding-agent/test/search-redesign-tools.test.ts`
- `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
- `packages/coding-agent/test/control-plane-loop-detector.test.ts`
- `packages/coding-agent/test/doom-loop-detection.test.ts`
- `packages/coding-agent/test/plan-execution-primitive.test.ts`
- `packages/coding-agent/test/planmode-todo-convergence.test.ts`
- `packages/coding-agent/test/role-aware-performance-tuning.test.ts`
- `packages/coding-agent/test/subagents-starter-pack.test.ts`
- `packages/coding-agent/test/prompt-model-overrides.test.ts`
- `packages/coding-agent/test/subagent-system-prompt.test.ts`
- `packages/coding-agent/test/status-dashboard.test.ts`
- `packages/coding-agent/test/settings-manager.test.ts`
- `packages/coding-agent/test/system-prompt.test.ts`

Observed result during implementation pass:
- 93 passing
- 0 failing

## Open caveats

### Repo-wide check status

`bun run check` in `packages/coding-agent` is not fully green yet.

Reason:
- there are pre-existing unrelated typecheck failures in other parts of the repo, especially outside the milestone 1–4 implementation slice
- the milestone work was verified with targeted tests rather than by first fixing the unrelated repo-wide check debt

### Interpretation of “implemented”

For milestones 1–11, “implemented” currently means:
- core intended functionality exists
- targeted tests exist and pass
- first-pass integration is in place
- broader hardening / follow-on refinement may still be useful

## Recommended next steps

Highest-value options from here:

1. Clean up remaining unrelated repo-wide typecheck failures
- goal: make `bun run check` green again
- benefit: restores stronger integration confidence now that the milestone campaign is functionally complete

2. Do a consolidation pass on milestones 1–11
- add more end-to-end coverage
- refine prompt doctrine around the new tools, roles, and dashboards
- reduce legacy surface area where appropriate

3. Decide whether to harden or productize specific areas next
- examples: mutation snapshots/undo, login polish, broader dashboards, shell-native workflows

## Related docs

Primary roadmap:
- `implementation-roadmap.md`

Per-milestone backlog set:
- `implementation-backlogs/README.md`
- `implementation-backlogs/00-design-freeze.md`
- `implementation-backlogs/01-tool-call-robustness.md`
- `implementation-backlogs/02-todo-redesign.md`
- `implementation-backlogs/03-search-tooling-redesign.md`
- `implementation-backlogs/04-pending-work-enforcement.md`
- `implementation-backlogs/05-semantic-workspace-lifecycle.md`
- `implementation-backlogs/06-doom-loop-detection.md`
- `implementation-backlogs/07-plan-execution-primitive.md`
- `implementation-backlogs/08-planmode-todo-convergence.md`
- `implementation-backlogs/09-role-aware-performance-tuning.md`
- `implementation-backlogs/10-secondary-plumbing-refinements.md`
- `implementation-backlogs/11-ux-daily-driver-pass.md`
