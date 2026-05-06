# Daedalus Adapter for t3code Audit

## Context and goal

The user wants a temporary Daedalus adapter for `t3code` while Daedalus' native GUI is incomplete. The adapter should let Daedalus run inside an existing project/thread chat workspace quickly, without prematurely committing the native GUI architecture.

This is also a proving ground: the adapter should expose which GUI patterns are worth carrying into Daedalus' native interface, especially around persistent chat threads, streaming execution, tool visibility, approvals, skills, plans, subagents, diffs, and recovery.

Audited repositories:

- `/home/likas/Research/Daedalus`
- `/home/likas/Research/gui-inspiration/t3code`

## Executive summary / bottom line

A Daedalus adapter for `t3code` is plausible and useful, but it should be built as a normal `t3code` provider driver rather than a fork of `t3code`.

The recommended first slice is:

1. Make Daedalus selectable as a provider.
2. Support project/thread chat as the primary interaction model.
3. Stream assistant output and runtime events.
4. Surface tool status in the UI.
5. Implement cancel/interrupt and error handling.
6. Add Daedalus-owned approvals.
7. Expose skills/slash-command affordances.
8. Add plans and subagent summaries only after the core loop is stable.

The adapter should stay thin: translate between `t3code` provider events and Daedalus runtime events, while keeping agent execution, safety policy, approvals, tools, and session semantics owned by Daedalus.

## t3code integration surface

`t3code` appears to be shaped around provider drivers and provider-layer adapters. A Daedalus integration should fit that model instead of changing the product around Daedalus-specific assumptions.

Likely files for a first implementation:

| File | Role |
| --- | --- |
| `apps/server/src/provider/Drivers/DaedalusDriver.ts` | Declares the Daedalus provider driver and provider metadata. |
| `apps/server/src/provider/Layers/DaedalusAdapter.ts` | Owns process/session lifecycle and event translation between Daedalus and `t3code`. |
| `apps/server/src/provider/Layers/DaedalusProvider.ts` | Wraps adapter behavior in the provider layer expected by the server. |
| `apps/server/src/textGeneration/DaedalusTextGeneration.ts` | Optional text-generation bridge if `t3code` expects a separate text-generation path. |
| `apps/server/src/provider/builtInDrivers.ts` | Registers Daedalus as a built-in selectable provider. |

The adapter should implement the expected `ProviderAdapterShape` surface:

| Method | Daedalus-backed behavior |
| --- | --- |
| `startSession` | Create or attach to a Daedalus session for a project/thread. |
| `sendTurn` | Send a user turn to Daedalus and begin streaming output/events. |
| `interruptTurn` | Cancel or interrupt the active Daedalus turn. |
| `stopSession` | Stop one Daedalus session and clean up process/runtime state. |
| `stopAll` | Stop all Daedalus sessions owned by the adapter. |
| `listSessions` | Return known adapter-managed sessions. |
| `hasSession` | Check whether a `t3code` thread maps to an active Daedalus session. |
| `respondToRequest` | Route approval or structured runtime responses back to Daedalus. |
| `respondToUserInput` | Route follow-up user input/question answers back to Daedalus. |
| `readThread` | Reconstruct thread state from Daedalus and/or `t3code`'s persisted view. |
| `rollbackThread` | Prefer Daedalus-owned rollback semantics; only mirror results into `t3code`. |
| `streamEvents` | Translate Daedalus runtime events into `ProviderRuntimeEvent` messages. |

Key rule: `t3code` should host the GUI and provider shell; Daedalus should remain the source of truth for agent execution and safety-critical decisions.

## Daedalus integration surfaces

Daedalus has three plausible surfaces for a `t3code` bridge.

| Surface | Best use | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| App-server protocol | Long-term native GUI and durable project/thread UI. | Best conceptual fit for Daedalus GUI mode; can become the shared contract for native GUI and external clients. | Still emerging/transitional; may require protocol hardening before it is stable enough for `t3code`. | Treat as the desired long-term shape, but do not block the first adapter on it. |
| RPC JSONL mode | Fast proof of concept and thin process bridge. | Simple process boundary; easy to spawn from `t3code`; minimal coupling; good for streaming event translation. | Requires careful event normalization; session recovery and richer UI affordances may need extra protocol fields. | Use for Phase 1. |
| In-process SDK | Deep integration and maximum control. | Powerful, low overhead, direct access to Daedalus APIs and typed objects. | Tight coupling, dependency/version friction, harder isolation, higher risk of embedding Daedalus internals into `t3code`. | Defer unless RPC/app-server surfaces prove insufficient. |

## Feature map

| Feature | Priority | Feasibility | `t3code` fit | Notes |
| --- | --- | --- | --- | --- |
| Core chat/session execution | P0 | High | Excellent | Matches `t3code`'s project/thread chat model and Daedalus' desired native GUI direction. |
| Tool visibility | P0 | High | Good | Translate Daedalus tool lifecycle events into visible provider runtime/tool activity events. |
| Approvals/safety gates | P1 | Medium | Good, with care | UI can present prompts, but approval policy and final decision handling must remain Daedalus-owned. |
| Skills/slash commands | P1 | Medium | Good | `t3code` can expose discoverable commands; Daedalus should own skill routing and execution semantics. |
| Plans/task execution | P2 | Medium | Partial | Useful after chat loop is stable; show plan state as structured side-panel or summarized runtime events. |
| Subagents | P2 | Medium | Partial | Start with subagent summaries/status, then expand to richer nested timelines if the UI supports it. |
| Diffs/file edits | P2 | Medium | Good | `t3code`-style GUI can help inspect changes; Daedalus should remain responsible for edit tools and workspace safety. |
| Workspace/worktree awareness | P1 | Medium | Good | Map `t3code` projects/workspaces to Daedalus project roots; defer complex worktree orchestration until basics work. |
| Session recovery/resume | P2 | Medium | Good | Important for durable GUI, but needs clear source-of-truth rules to avoid split-brain state. |
| Model/auth/settings | P1 | Medium | Partial | Daedalus should own model/provider auth; `t3code` can display provider snapshot and settings status. |

## Recommended architecture

Start with a Phase 1 RPC-backed `t3code` provider. This gives the fastest path to a working GUI without locking Daedalus into `t3code` internals.

```text
t3code DaedalusDriver
  -> DaedalusAdapter
  -> daedalus --mode rpc
  -> event translator
  -> ProviderRuntimeEvent
  -> t3code project/thread chat UI
```

Responsibilities:

| Layer | Responsibilities |
| --- | --- |
| `DaedalusDriver` | Provider identity, display name, selection/registration, capability snapshot. |
| `DaedalusAdapter` | Spawn RPC process, map `t3code` thread IDs to Daedalus sessions, send turns, cancel turns, stop sessions. |
| `daedalus --mode rpc` | Run the real Daedalus agent loop, tools, skills, approvals, model selection, and safety policy. |
| Event translator | Convert Daedalus JSONL/RPC events into `ProviderRuntimeEvent` messages and normalize errors/cancellation. |
| `t3code` UI | Render chat, stream text, show tool status, display approval prompts, and provide project/thread navigation. |

After Phase 1, either:

1. Replace the RPC bridge with an app-server-backed adapter once Daedalus' app-server protocol is stable enough, or
2. Use the lessons from `t3code` to harden Daedalus' native GUI directly and keep the adapter as a compatibility shim.

## Priority buckets

### Adapter first

- Register Daedalus as a selectable `t3code` provider.
- Implement `DaedalusDriver` and `DaedalusAdapter`.
- Spawn `daedalus --mode rpc`.
- Send user turns and stream assistant output.
- Translate basic runtime/tool events.
- Implement cancel/interrupt.
- Normalize errors and stopped states.
- Expose a provider/capability snapshot.

### Adapter second

- Approval prompts and responses.
- Skills/slash-command discovery and execution affordances.
- Workspace root mapping.
- Model/auth/settings status display.
- Session list/read-thread support.
- Basic resume behavior.

### Adapter later / native GUI learning

- Plan visualization.
- Subagent timelines and summaries.
- Diff/file-edit review panels.
- Rich rollback flows.
- Worktree-aware dashboards.
- App-server protocol adapter.

### Avoid / defer

- Forking `t3code`.
- Reimplementing Daedalus tools or approval policy inside `t3code`.
- Making `t3code` the source of truth for Daedalus sessions.
- Deep in-process SDK coupling before the protocol boundary is proven.
- Full native-GUI parity in the temporary adapter.

## Main risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Event translation drift | Daedalus events may not map perfectly to `ProviderRuntimeEvent` types. | Keep a small explicit translation layer and add fields only when the UI needs them. |
| Split-brain session state | Both Daedalus and `t3code` may try to own thread/session truth. | Assign ownership clearly: Daedalus owns execution state; `t3code` mirrors/render UI state. |
| Protocol v1 transitional state | Daedalus' long-term app-server protocol may still be changing. | Use RPC JSONL for Phase 1 and treat app-server integration as a later migration target. |
| Approval boundary erosion | GUI convenience can accidentally move safety decisions outside Daedalus. | Keep approvals Daedalus-owned; the UI only displays prompts and returns explicit user decisions. |
| Cancellation semantics | Interrupting a streaming agent turn can leave dangling processes or stale UI state. | Make `interruptTurn` a first-class path and emit terminal canceled/error events consistently. |

## Native GUI feedback loop

| Category | Lessons for Daedalus native GUI |
| --- | --- |
| Borrow | Persistent project/thread chat, selectable providers, visible streaming state, tool activity rows, cancel controls, thread history, recovery affordances, and compact side panels. |
| Avoid | Treating the GUI as a thin transcript only, burying approvals, duplicating agent state in the client, provider-specific forks, and one-shot batch-task interaction as the default. |
| Differentiate | Daedalus should make approvals, skills, plans, subagents, and safety gates first-class product concepts instead of generic provider decorations. |

The adapter should be evaluated not only by whether it works, but by what it teaches about Daedalus' native GUI: which events need stable protocol support, which panels users actually need during active work, and where Daedalus needs richer domain-specific UX than `t3code` can provide.

## Recommended next steps

1. Implement the Phase 1 `t3code` adapter with `DaedalusDriver` and `DaedalusAdapter`.
2. Register Daedalus in `builtInDrivers.ts` as a normal selectable provider.
3. Spawn `daedalus --mode rpc` per session or per managed adapter runtime.
4. Send turns from `t3code` project/thread chat into Daedalus.
5. Stream assistant text and runtime events back into `ProviderRuntimeEvent`.
6. Show tool activity/status in the `t3code` UI.
7. Implement cancel/interrupt and terminal error handling.
8. Expose a basic Daedalus provider snapshot: availability, version if available, capabilities, model/auth status if available.
9. Add approvals with Daedalus-owned decision semantics.
10. Add skills/slash-command affordances.
11. Add plans, subagent summaries, and diff/file-edit review once the core loop is stable.
12. Revisit an app-server-backed adapter after the app-server protocol stabilizes, or use the adapter lessons to prioritize direct native GUI hardening.
