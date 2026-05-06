# Daedalus t3code Adapter Implementation Plan

> Durable planning artifact for the Daedalus/t3code adapter effort.
> This is intentionally **not** a Daedalus `execute_plan` artifact and does not use `docs/plans` task metadata.
> When implementation starts, a separate executable `docs/plans/...` artifact can be generated for Phase 1.

## Audited context
| Repository | Role |
| --- | --- |
| `/home/likas/Research/Daedalus` | Source of truth for Daedalus execution, tools, approvals, safety, sessions, and future native GUI direction. |
| `/home/likas/Research/gui-inspiration/t3code` | Host GUI/server shell: provider selection, project/thread UI, server provider drivers, and text generation plumbing. |

## Strategy
Use a hybrid plan:

- **Phase 1 is detailed now.** It proves the adapter seam with the minimum useful provider: selectable, RPC-backed, cwd/session-bound, streaming, cancellable, and observable.
- **Phase 2 and Phase 3 stay as roadmaps.** Their final shape depends on real Phase 1 findings about t3code provider contracts, Daedalus event fidelity, and process/session behavior.
- **Replan after every phase.** Do not execute Phase 2/3 from today’s assumptions; convert them into fresh implementation plans after the preceding phase lands.
- **Prefer adapter over fork.** t3code should remain the project/thread GUI shell. Daedalus should remain the execution engine.
- **Avoid state duplication.** t3code can persist UI metadata; Daedalus remains authoritative for execution state, approvals, tools, and sessions.

The first milestone should be small enough to build and verify quickly, but complete enough to support a real chat turn from the t3code UI.

## Source-of-truth boundary
Design principle: **t3code hosts; Daedalus executes.**

| Area | Owner | Boundary rule |
| --- | --- | --- |
| Provider shell and selection | t3code | Daedalus appears as a selectable provider through t3code conventions. |
| Project/thread UI | t3code | t3code hosts visible projects, threads, messages, settings, and stop controls. |
| Agent execution loop | Daedalus | t3code must not reimplement agent turns, steering, tool scheduling, or prompts. |
| Tools and safety | Daedalus | t3code displays tool activity; Daedalus decides available tools and execution policy. |
| Approvals | Daedalus | t3code may render prompts later, but Daedalus owns policy, defaults, and enforcement. |
| Session semantics | Daedalus | t3code maps project/thread identity to Daedalus sessions; it does not become transcript authority. |
| GUI persistence | t3code | Persist UI metadata and stream artifacts only; avoid derived copies of Daedalus runtime state. |
| Protocol adaptation | Adapter layer | Translate events explicitly, type them, and test translation drift. |

The adapter should bind a t3code project/thread to a cwd-backed Daedalus session, forward user turns, translate streamed Daedalus events, and surface status without forking Daedalus behavior.

## Phase 1 — Minimum Useful Daedalus Provider
### Goal
Add a selectable Daedalus provider to t3code that can start/connect to Daedalus, bind project/thread cwd, send and stream chat turns, show basic activity, cancel active turns, report errors, and expose a provider snapshot.
### Phase 1 scope
Included:

- Selectable Daedalus provider in t3code provider/settings surfaces.
- RPC-backed Daedalus process or connection managed by the t3code server provider layer.
- Project/thread cwd binding into a stable Daedalus session identity.
- Send/stream chat turn lifecycle for normal user prompts.
- Basic tool activity/status display in the t3code thread.
- Cancel/interrupt for the active turn.
- Structured provider and turn errors.
- Provider snapshot with availability and basic capabilities.

Not included:

- Full approvals UI.
- Rich diff/file-edit panels.
- Worktree dashboards.
- Plan or subagent timeline visualization.
- Rollback/checkpoint flows.
- Native Daedalus GUI architecture decisions.
### Likely t3code files
| File | Expected role |
| --- | --- |
| `apps/server/src/provider/Drivers/DaedalusDriver.ts` | New provider driver: metadata, settings, generation entrypoint, cancellation, snapshot. |
| `apps/server/src/provider/Layers/DaedalusAdapter.ts` | Event/status translator between Daedalus RPC/process events and t3code stream artifacts. |
| `apps/server/src/provider/Layers/DaedalusProvider.ts` | Runtime layer for process lifecycle, session mapping, RPC calls, and provider state. |
| `apps/server/src/textGeneration/DaedalusTextGeneration.ts` | Optional text-generation bridge if t3code separates stream assembly from provider drivers. |
| `packages/contracts/src/settings.ts` | Settings/schema additions for selecting/configuring Daedalus. |
| `apps/server/src/provider/builtInDrivers.ts` | Register Daedalus as a built-in provider option. |

If reconnaissance finds different t3code naming or layering, preserve these responsibilities and update the Phase 1 executable plan before implementation.
### Phase 1 architecture sketch
```text
t3code project/thread UI
  -> t3code server provider driver
  -> DaedalusDriver
  -> DaedalusProvider process/session manager
  -> DaedalusAdapter event translator
  -> Daedalus RPC/process/SDK boundary
  -> Daedalus agent execution, tools, approvals, safety, sessions
```

Keep the adapter narrow:

- Driver integrates with t3code provider conventions.
- Provider owns Daedalus process/session lifecycle.
- Adapter translates Daedalus events into t3code-compatible stream/status events.
- Daedalus remains the authority for execution and safety.
### Detailed Phase 1 work areas
| Work area | Concrete outcome |
| --- | --- |
| Provider registration | Daedalus appears in provider selection with minimal settings and capability metadata. |
| RPC process manager | t3code can start/connect to Daedalus, detect readiness, fail clearly, and shut down cleanly. |
| Session/thread mapping | Project cwd and thread id produce stable Daedalus session/resume identity. |
| Turn lifecycle | User prompt becomes a Daedalus turn; assistant text and lifecycle events stream back. |
| Event translation | Assistant/tool/status/error events become t3code-compatible stream artifacts. |
| Cancellation | Stop action interrupts the active Daedalus turn and releases active-turn state. |
| Error handling | Missing command, invalid cwd, RPC loss, turn failure, and cancellation are distinguishable. |
| Provider snapshot | t3code can display Daedalus availability and honest Phase 1 capabilities. |
| Verification | Targeted unit tests plus manual t3code project/thread smoke. |

## Phase 1 implementation task list
Use this checklist as the source for a future executable Phase 1 plan. Commands are verification ideas for implementation time, not commands run while writing this document.
### P1.1 — Reconnaissance and contract map
- [ ] Read existing t3code provider drivers and identify the smallest comparable pattern.
- [ ] Trace project/thread/provider/model/text-generation flow through `apps/server` and `packages/contracts`.
- [ ] Confirm cancellation entrypoints, stream terminal states, and provider snapshot shape.
- [ ] Inspect Daedalus process/SDK/RPC options and choose the least invasive Phase 1 boundary.
- [ ] Record exact event shapes that need translation before writing adapter code.

Outcome: implementation can name exact t3code interfaces and the Daedalus boundary.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && rg "builtInDrivers|Provider|Driver|textGeneration|cancel|snapshot" apps/server packages/contracts`.
### P1.2 — Driver, settings, and schema
- [ ] Add Phase 1 Daedalus settings in `packages/contracts/src/settings.ts`: enabled/provider choice, optional command/binary path, optional args, and optional env passthrough only if t3code already supports it.
- [ ] Avoid duplicating Daedalus model/auth configuration unless the field is display-only or pass-through.
- [ ] Create `apps/server/src/provider/Drivers/DaedalusDriver.ts` using the existing driver contract.
- [ ] Register the driver in `apps/server/src/provider/builtInDrivers.ts`.
- [ ] Verify Daedalus can be selected without custom one-off UI.

Outcome: t3code can serialize settings and instantiate the Daedalus driver.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && bun run check && rg "Daedalus" apps/server/src/provider packages/contracts/src/settings.ts`.
### P1.3 — RPC-backed Daedalus process manager
- [ ] Implement `apps/server/src/provider/Layers/DaedalusProvider.ts` as the owner of process lifecycle and RPC connection state.
- [ ] Support configured command/binary path plus a sensible default discovered during reconnaissance.
- [ ] Start Daedalus lazily on first provider use unless t3code has an established eager-start convention.
- [ ] Detect readiness through the selected RPC handshake or first successful snapshot call.
- [ ] Track states: stopped, starting, ready, failed, stopping.
- [ ] Clean up child process resources on provider/server shutdown.

Outcome: provider code can start/connect to Daedalus and report readiness or failure deterministically.
Verification idea: targeted provider/process tests, e.g. `bun test apps/server/src/provider` from the t3code root if that matches repo conventions.
### P1.4 — Project/thread cwd and session mapping
- [ ] Map t3code project cwd + thread id to a stable Daedalus session id or resume key.
- [ ] Pass project cwd to Daedalus for every new session/turn.
- [ ] Preserve multi-turn continuity within one t3code thread.
- [ ] Prevent cross-thread leakage by documenting whether same-cwd threads share or isolate Daedalus sessions.
- [ ] Validate cwd existence before a turn and return an actionable path error if unavailable.
- [ ] Avoid storing a second Daedalus transcript in t3code.

Outcome: each t3code thread has clear Daedalus session semantics.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && rg "threadId|projectId|cwd|workingDirectory|session" apps/server packages/contracts`.
### P1.5 — Event translator
- [ ] Implement `apps/server/src/provider/Layers/DaedalusAdapter.ts` as the only Phase 1 event translation layer.
- [ ] Translate assistant text deltas into t3code streaming output.
- [ ] Translate tool start/update/end events into basic visible activity/status events.
- [ ] Translate turn started, completed, cancelled, and failed into t3code terminal stream states.
- [ ] Preserve event ids/timestamps when available for debugging.
- [ ] Treat unknown Daedalus events as non-fatal: log and optionally show generic status.
- [ ] Add unit tests using captured or hand-built Daedalus event fixtures.

Outcome: translation is testable without launching a real Daedalus process.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && bun test apps/server/src/provider/Layers/DaedalusAdapter.test.ts`.
### P1.6 — Send/stream chat turn lifecycle
- [ ] Wire `DaedalusDriver.ts` to call `DaedalusProvider` for each user turn.
- [ ] Include prompt, thread/session binding, cwd, and provider options in the Daedalus RPC call.
- [ ] Stream assistant text incrementally through t3code’s stream writer or text-generation abstraction.
- [ ] Emit exactly one final state when a turn completes.
- [ ] Allow only one active turn per t3code thread unless existing t3code semantics clearly support more.
- [ ] Keep prompt/session mutation inside Daedalus; t3code should not synthesize Daedalus system prompts or tool plans.

Outcome: a user can complete a basic Daedalus-backed chat turn from t3code.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && bun run dev`, then select Daedalus and send a simple prompt.
### P1.7 — Cancellation and interruption
- [ ] Wire t3code stop/cancel action to a Daedalus interrupt/cancel RPC method or selected process signal.
- [ ] Make cancellation idempotent for repeated stop clicks.
- [ ] Distinguish user cancellation from process crash, RPC loss, and turn failure.
- [ ] Ensure cancelled turns release active-turn locks and leave the thread usable.
- [ ] Keep the Daedalus process ready after cancellation when Daedalus reports it is healthy.
- [ ] Restart only through the process manager if cancellation requires restart.

Outcome: users can stop a Daedalus turn and then continue chatting.
Verification idea: manual smoke with a long turn, stop click, cancelled status, and follow-up turn.
### P1.8 — Errors and user-facing status
- [ ] Normalize missing Daedalus command/binary into provider setup error.
- [ ] Normalize invalid cwd into project/thread error with path shown.
- [ ] Normalize RPC connection loss into provider process error.
- [ ] Normalize Daedalus turn failure into turn-level error with useful diagnostics.
- [ ] Avoid dumping raw stack traces into chat unless t3code already does that for comparable providers.
- [ ] Add structured logging for process and adapter state transitions.
- [ ] Ensure error paths close streams exactly once.

Outcome: common failures are actionable and do not corrupt provider/thread state.
Verification idea: fake-process/fake-RPC tests plus manual missing-command and invalid-cwd smoke.
### P1.9 — Provider snapshot
- [ ] Implement the Daedalus provider snapshot using t3code’s existing snapshot mechanism.
- [ ] Report configured/unconfigured, process reachable/unreachable, and last error.
- [ ] Report minimal capabilities: streaming chat, cancellation, basic tool status, cwd-bound sessions.
- [ ] Include provider display metadata such as name, label/icon if supported, and concise description.
- [ ] Do not invent detailed Daedalus model/auth status unless Daedalus exposes it.
- [ ] Ensure snapshot calls do not start expensive work unless t3code provider conventions require it.

Outcome: t3code can show honest Daedalus provider availability and capabilities.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && rg "snapshot" apps/server/src/provider && bun run check`.
### P1.10 — Tests and manual smoke
- [ ] Add tests for settings/schema parsing if provider settings are schema-validated.
- [ ] Add tests for event translation, process readiness/failure, cancellation, and driver behavior.
- [ ] Use fake Daedalus process/RPC fixtures where possible to avoid brittle integration tests.
- [ ] Run the narrowest package checks covering changed t3code server/contracts files.
- [ ] Manual smoke: select Daedalus, open cwd-backed project, send prompt, observe streaming, see basic tool/status activity, cancel long turn, send follow-up.
- [ ] Capture Phase 1 findings and decide whether Phase 2 should remain in t3code, move more into Daedalus, or introduce an app-server-backed adapter.

Outcome: adapter seams have automated coverage and one recorded end-to-end manual smoke.
Verification idea: `cd /home/likas/Research/gui-inspiration/t3code && bun run check && bun test apps/server/src/provider packages/contracts && bun run dev`.

## Phase 1 exit criteria
Phase 1 is complete when:

- Daedalus is selectable as a t3code provider.
- A t3code project/thread binds to a cwd-backed Daedalus session.
- A user can send a chat turn and receive streamed assistant output.
- Basic Daedalus tool/activity/status events appear in a readable form.
- Cancel/interrupt stops an active turn and leaves the thread usable.
- Provider snapshot reports availability and Phase 1 capabilities.
- Missing binary, invalid cwd, RPC failure, turn failure, and cancellation produce distinguishable states.
- The adapter does not fork Daedalus execution, tools, approvals, safety, or session logic.
- Targeted tests for settings, process lifecycle, event translation, and driver behavior pass.
- Manual t3code UI smoke passes and records known limitations.
- Phase 1 findings are documented before Phase 2 planning starts.

## Phase 2 — Daedalus Differentiators Roadmap
### Goal
Expose Daedalus-specific value in t3code after the Phase 1 seam is proven: approvals, skills/slash commands, model/auth status, workspace/worktree awareness, plan summaries, subagent summaries, and basic resume/recovery.
### Dependency on Phase 1 findings
Phase 2 should wait for answers to these questions:

- Which Daedalus event/RPC types are stable enough to expose directly?
- Does t3code’s stream/provider model support approvals and summaries, or is a richer side channel needed?
- Is the Daedalus process/RPC boundary robust for long-lived sessions?
- Where did Phase 1 create pressure to persist duplicated state?
- Which UX belongs in generic t3code provider UI versus future native Daedalus GUI?
### Candidate Phase 2 features
| Feature | Direction | Guardrail |
| --- | --- | --- |
| Approvals | Render Daedalus-owned approval prompts and send decisions back. | Policy/enforcement remain Daedalus-owned. |
| Skills/slash commands | Surface available Daedalus skills and slash commands in chat. | Do not create a t3code skill registry. |
| Model/auth status | Show Daedalus-reported provider/model/auth health. | Do not duplicate credentials or model config. |
| Workspace/worktree awareness | Display repo, branch, dirty state, cwd, and worktree context when exposed. | Prefer read-only awareness before orchestration. |
| Plan summaries | Render compact Daedalus plan/progress summaries. | Do not invent t3code-owned plans. |
| Subagent summaries | Show parent-facing subagent status/results. | Default to summaries; reveal detail on demand. |
| Basic resume/recovery | Reconnect to existing sessions after reload/process restart where supported. | Needs clear session identity and transcript authority. |
### Phase 2 planning gate
Before implementation, write a new plan with:

- Phase 1 findings and limitations.
- Exact Daedalus event/RPC support for approvals, skills, status, plans, subagents, and recovery.
- A decision on generic t3code UI extension versus Daedalus-specific panels.
- Automated tests for approvals and recovery.
- Manual UX smoke scripts for approval, skill invocation, and resume.
### Phase 2 open questions
- What is the minimal safe approval UI that is faithful to Daedalus policy?
- Should skills appear as slash suggestions, provider actions, or both?
- How much model/auth detail can Daedalus expose without leaking secrets?
- Can t3code threads represent Daedalus resume semantics cleanly?
- Should worktree awareness remain read-only during Phase 2?
- Which plan/subagent events are stable enough for a durable adapter contract?

## Phase 3 — Rich GUI Workflows Roadmap
### Goal
Use Phase 1/2 lessons to design richer GUI workflows around Daedalus execution: diff/file-edit panels, richer tool timelines, plan visualization, subagent timelines, rollback/checkpoint flows, worktree/session dashboards, recovery UI, and possibly an app-server-backed adapter.
### Dependency on Phase 2 findings
Phase 3 should wait for evidence on:

- Whether t3code can host rich Daedalus workflows without contorting its provider model.
- Whether approval, plan, subagent, diff, and recovery events are stable and typed enough for persistent UI.
- Whether the target should remain a t3code adapter, move toward native Daedalus GUI, or support both.
- Whether multi-session, multi-worktree, or recovery-heavy workflows need a Daedalus-owned app server.
### Candidate Phase 3 features
| Feature | Direction | Guardrail |
| --- | --- | --- |
| Diff/file-edit panels | Show Daedalus edits in reviewable panels. | Daedalus remains source of edit/tool truth. |
| Richer tool timelines | Visualize tool calls, durations, statuses, and outputs. | Needs stable ids and redaction rules. |
| Plan visualization | Render phases/tasks/progress as a side panel. | Build from Daedalus events, not t3code-invented tasks. |
| Subagent timelines | Show subagent lifecycle and parent-facing results. | Keep summaries first; detail on demand. |
| Rollback/checkpoint flows | Expose safe revert/recovery actions. | Rollback semantics must be Daedalus-owned. |
| Worktree/session dashboard | Browse projects, worktrees, threads, and session health. | Avoid accidental second orchestrator. |
| Recovery UI | Help reconnect after crash, reload, or interrupted turn. | Requires reliable session identity. |
| App-server-backed adapter | Consider a Daedalus-owned server boundary. | Use only if rich workflows exceed direct provider integration. |
### Phase 3 planning gate
Before implementation, write a new plan that decides:

- Whether the target surface is t3code, native Daedalus GUI, or a split strategy.
- Which rich workflows are validated by real usage rather than speculative polish.
- What persistent state belongs to Daedalus, t3code, or a shared protocol.
- How rollback/checkpoint safety is enforced and displayed.
- How to test multi-thread, multi-worktree, crash recovery, and subagent timelines.
### Phase 3 open questions
- Are diff panels useful in t3code’s layout, or should they wait for native Daedalus GUI?
- Does t3code have enough layout flexibility for timelines, plans, and dashboards?
- What is the right rollback model: per-turn, per-tool, per-plan, or per-checkpoint?
- How should subagent visibility balance transparency with cognitive load?
- Should a Daedalus app server become the stable boundary for GUI clients?
- Which recovery states can be automated and which require explicit user confirmation?

## Risks and guardrails
| Risk | Why it matters | Guardrail |
| --- | --- | --- |
| Event translation drift | Daedalus events and t3code stream contracts may evolve independently. | Centralize translation in `DaedalusAdapter.ts` and cover it with fixtures. |
| Split-brain state | t3code could become a second owner of transcripts, tools, approvals, or sessions. | Persist UI metadata only; Daedalus owns execution/session state. |
| Protocol v1 transitional state | Early protocol shapes may change while adapter work proceeds. | Version the boundary, tolerate unknown events, and replan after Phase 1. |
| Approval ownership leakage | Rendering approvals can tempt policy duplication. | Daedalus owns policy, defaults, enforcement, and audit trail. |
| Overbuilding t3code-specific UI | Rich provider UI can trap Daedalus inside an inspiration repo. | Keep Phase 1 provider-shell only; use Phase 2/3 planning gates. |
| Process lifecycle fragility | Long turns may outlive UI assumptions. | Model ready/failed/cancelled states and test cancel/reconnect paths. |
| Secret/config duplication | Settings may duplicate Daedalus auth/model configuration. | Prefer Daedalus-reported status and pass-through config. |
| Incomplete cancellation | A stopped stream might leave Daedalus still editing files. | Use Daedalus-owned interrupt semantics and verify terminal state. |

## Native Daedalus GUI feedback loop
Use the t3code adapter as a learning loop for a future native Daedalus GUI.
### Borrow
- Persistent project/thread chat as the center of gravity.
- Lightweight provider selection and settings surfaces.
- Fast path from opening a project to sending a first useful chat turn.
- Server-side provider driver abstraction for GUI integration.
- t3code ergonomics around project/thread continuity where they fit Daedalus sessions.
### Avoid
- Forking Daedalus execution, prompts, tools, approvals, safety, or transcript semantics.
- Treating t3code’s provider model as the permanent Daedalus GUI architecture.
- Persisting derived Daedalus runtime state that later needs reconciliation.
- Building rich provider-specific panels before chat/cancel/status works.
- Letting GUI convenience weaken Daedalus safety and approval invariants.
### Differentiate
- Daedalus should expose first-class planning, subagent, approval, recovery, and worktree workflows.
- Daedalus GUI should make execution legible without forcing users to manage internals by default.
- Daedalus should preserve a safe execution boundary even when embedded in other shells.
- Daedalus-native surfaces can optimize for the full workflow; the t3code adapter proves the compatibility seam.

## Recommended immediate next step
Choose one next action:

1. **Convert Phase 1 into an executable `docs/plans` artifact.** Use this document as the durable source and generate a Phase 1-only plan with Daedalus task metadata, dependencies, and worker-safe task boundaries.
2. **Start implementing Phase 1 directly.** Begin with reconnaissance in `/home/likas/Research/gui-inspiration/t3code`, then implement provider registration, process manager, session mapping, event translator, turn lifecycle, cancellation, errors, snapshot, and targeted tests.

Recommended default: generate the executable Phase 1 plan first if multiple workers will implement it; start direct implementation if a single worker is making the initial adapter spike.
