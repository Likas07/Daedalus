# t3code Daedalus App-Server Codex-Parity Gap Report

Status: pre-plan investigation artifact. This is not an executable implementation plan.

Scope: identify what the Daedalus app-server, protocol, client, and a t3code adapter must improve so t3code can use Daedalus app-server instead of Daedalus RPC while approaching t3code's existing Codex provider capabilities.

## Executive verdict

Daedalus should not expose today's app-server shape directly as the t3code provider boundary if the goal is Codex parity. The app-server has strong local-GUI foundations, SQLite persistence, workspace/worktree safety, terminal/Git services, approvals, and a typed client, but the adapter-facing contract is still a hybrid of root `session/*` methods and partial `v1` thread methods. t3code's Codex path is cleaner: `CodexSessionRuntime` starts `codex app-server`, speaks typed JSON-RPC, gets immediate `turn/start` receipts, receives rich item/content/tool/approval/diff notifications, supports thread read/rollback, and has separate text-generation support.

The biggest parity blockers are:

- **Protocol split:** `packages/app-server-protocol/src/v1/envelope.ts` declares a clean thread/workspace-target protocol, but `packages/app-server/src/server/thread-v1-routes.ts` implements only `thread.get`, `thread.replay`, `turn.start`, `turn.cancel`, and `payload.window`, while many required surfaces remain on root `session/*`, `approval/*`, `diff/*`, `terminal/*`, `model/*`, and `auth/*` routes.
- **Turn ack semantics:** `SessionController.startTurn()` awaits `runtime.session.prompt()` before returning, and `AgentSession.prompt()` awaits `this.agent.prompt(messages)`, so `turn/start` behaves like a blocking send rather than Codex's immediate receipt plus streamed completion events.
- **Streaming fidelity:** Daedalus runtime events are persisted as broad `agent/*` app events, but v1 timeline projection currently maps mostly `turn/started`, `agent/message_end`, approvals, checkpoints, and terminal events. It does not faithfully expose assistant deltas, reasoning deltas, plan deltas, tool start/update/end, command output, file-change output, token usage, or model reroute equivalents.
- **Replay/payload windows:** v1 payload refs exist, but `getPayloadWindowV1()` currently returns empty chunks for terminal, diff, tool, and audit payload windows. Durable large-output windows are not yet real.
- **Approval/user-input consistency:** Daedalus has root approvals and some v1 approval methods, but live v1 notifications and replay projections are not equivalent to Codex's request/open/resolved and structured user-input lifecycle.
- **Checkpoint/diff/rollback semantics:** Daedalus can create and restore hidden Git checkpoint refs, but v1 diff is current-worktree-based (`DiffService` defaults to `HEAD`), no v1 rollback-by-turn API exists, and conversation rollback is not aligned with t3code/Codex thread rollback.
- **Tool cwd:** app-server runtime tool construction currently uses `const TOOL_CWD = process.cwd()` in `packages/app-server/src/runtime/runtime-options-resolver.ts`, which can point tools at the app-server process cwd instead of the session/workspace cwd.
- **Text generation:** t3code's Codex provider has commit/PR/branch/thread-title generation via `CodexTextGeneration`; Daedalus app-server currently has no comparable endpoint.
- **Client/process hardening:** t3code's Codex layer wraps child process lifecycle, stderr classification, termination, and typed request dispatch. Daedalus has desktop-oriented process startup, but the generic client/transport needs adapter-grade close/error/reconnect/timeout/schema behavior.

Recommendation: make the **external t3code-facing contract pure v1**, not hybrid root+v1. It can be backed internally by existing root services during implementation, but the adapter should not have to know which Daedalus route is legacy. If the adapter is forced to ship against the current app-server without protocol work, hybrid root+v1 is the only runnable option, but it will not be Codex-parity and will bake migration debt into t3code.

## Capability matrix

| Capability | Codex baseline | Daedalus current state | Gap | Fix location | Parity priority |
| --- | --- | --- | --- | --- | --- |
| Process/runtime boundary | t3code starts `codex app-server` per runtime in `apps/server/src/provider/Layers/CodexSessionRuntime.ts`, wraps it with `effect-codex-app-server/client.ts`, handles child exit/stderr, and exposes a `ProviderAdapterShape` implementation in `CodexAdapter.ts`. | Daedalus app-server is a Bun HTTP/WebSocket server (`packages/app-server/src/server/app-server.ts`, `server/main.ts`). Desktop can spawn/reuse it via `packages/desktop/src/server-process.ts`, but generic app-server client/process semantics are not Codex-adapter-grade. | t3code needs a deterministic Daedalus app-server process manager: spawn, readiness, token, health, shutdown, crash classification, restart/reconnect, and pending-request handling. | `packages/app-server/src/server/main.ts`, `packages/app-server/src/server/app-server.ts`, `packages/desktop/src/server-process.ts` patterns, `packages/app-server-client/src/ws-transport.ts`, t3code `apps/server/src/provider/Layers/DaedalusSessionRuntime.ts`. | P0 |
| Protocol shape and versioning | Codex has generated method maps in `packages/effect-codex-app-server/src/_generated/meta.gen.ts` covering `thread/start`, `thread/resume`, `thread/read`, `thread/rollback`, `turn/start`, `turn/interrupt`, model/account/config, command exec, approvals, and notifications. | Daedalus root protocol uses `session/start`, `turn/start`, etc. in `packages/app-server-protocol/src/messages.ts`. v1 thread-only schemas exist in `packages/app-server-protocol/src/v1/envelope.ts`, and tests assert no session aliases, but runtime routes are partial and extra v1 methods are grafted into root messages as `v1.approval.*`, `v1.diff.*`, and `v1.terminal.*`. | A t3code adapter would need brittle knowledge of root vs v1 method families. Some declared v1 methods (`thread.create`, `thread.list`, `workspaceTarget.list`, `workspaceTarget.validate`) are not handled by `thread-v1-routes.ts`. | Consolidate adapter-facing protocol in `packages/app-server-protocol/src/v1/*`; implement all declared routes in `packages/app-server/src/server/thread-v1-routes.ts` and `router.ts`; update `packages/app-server-client/src/v1/*`. | P0 |
| Method validation and unknown-method behavior | Codex client dispatch decodes known schemas and returns JSON-RPC method-not-found for unknown server requests (`effect-codex-app-server/src/client.ts`). | `AppRouter.handle()` falls through to `default: return {}` in `packages/app-server/src/server/router.ts`; WebSocket parses JSON but does not validate request schemas in `packages/app-server/src/server/websocket.ts`. | Unsupported methods can look successful, which is dangerous for an adapter expecting Codex-like typed failures. | `packages/app-server/src/server/websocket.ts`, `packages/app-server/src/server/router.ts`, protocol result-schema validation in `packages/app-server-client/src/client.ts`. | P0 |
| Workspace/project target selection | Codex thread start takes `cwd` and sandbox/approval policy (`CodexSessionRuntime.buildThreadStartParams()`). t3code binds provider sessions to project/thread cwd through `ProviderService`. | Daedalus has root `project/open`, `worktree/list/create`, `workflow/target/validate`, and `session/start` requiring explicit `startTarget` (`packages/app-server-protocol/src/messages.ts`, `AppRouter.resolveSessionStartTarget()`). v1 `WorkspaceTarget` schema exists in `packages/app-server-protocol/src/v1/workspace-target.ts`. | v1 does not yet expose complete project open/list and workspace-target list/create/validate semantics needed to bind a t3code project/thread without root `session/start`. | v1 workspace target routes in `packages/app-server/src/server/thread-v1-routes.ts` or a new v1 workspace router; v1 protocol exports; app-server-client v1 workspace client. | P0 |
| Thread create/list/read/resume | Codex exposes `thread/start`, `thread/resume`, `thread/list`, `thread/loaded/list`, `thread/read`, archive/unarchive/name/update, and returns provider thread ids/resume cursor (`CodexSessionRuntime.openCodexThread()`, `ProviderService.recoverSessionForThread()`). | Daedalus root has session list/resume/fork/rename/archive/delete/import/export in `messages.ts` and `router.ts`. v1 `thread.get` and `thread.replay` are handled, but v1 `thread.create` and `thread.list` are schema-only. `buildThreadV1()` projects sessions as threads. | t3code cannot treat Daedalus as a native thread provider through pure v1. It must use root sessions or invent mapping. Resume semantics are split between Daedalus sessions and v1 thread projection. | `packages/app-server-protocol/src/v1/thread.ts`, `packages/app-server/src/server/thread-v1-routes.ts`, `packages/app-server/src/projections/thread-v1-projection.ts`, session store projection. | P0 |
| Turn start receipt | Codex `turn/start` returns a `turn.id` receipt, then notifications drive progress/completion (`CodexSessionRuntime.sendTurn()`). t3code stores active turn immediately. | `SessionController.startTurn()` emits `turn/started`, then awaits `record.runtime.session.prompt(...)`; `AgentSession.prompt()` awaits `this.agent.prompt(messages)` before returning. Root `turn/start` and v1 `turn.start` both route through this authority. | Daedalus `turn/start` response can wait for full completion, preventing t3code from showing immediate running state, active stop controls, and latency-free user feedback. | `packages/app-server/src/runtime/session-controller.ts`; possibly introduce background turn task/turn registry; update `AppRouter` and `thread-v1-routes.ts` result timing. | P0 |
| Turn cancel/interrupt | Codex supports `turn/interrupt` via provider thread id and active turn id (`CodexSessionRuntime.interruptTurn()`). | Root `turn/cancel` calls `controller.interruptTurn()`. v1 `turn.cancel` calls the same authority. `interruptTurn()` emits `turn/interrupted` and aborts runtime. | Basic cancel exists, but completion/cancellation event state must be consistent with immediate-ack turn registry and t3code ProviderRuntimeEvent terminal states. | `packages/app-server/src/runtime/session-controller.ts`, `packages/app-server/src/server/thread-v1-routes.ts`, v1 timeline projection. | P0 |
| Assistant streaming text | Codex emits `item/agentMessage/delta` and t3code maps it to `content.delta` with `streamKind: assistant_text` (`CodexAdapter.mapToRuntimeEvents()`). | Daedalus agent loop emits `message_start`, `message_update`, and `message_end`; `mapRuntimeEvent()` wraps them as `agent/message_*`. v1 projection maps `agent/message_end` into a full assistant message but does not produce delta timeline entries. | t3code loses Codex-like live token streaming if it only consumes v1 thread timeline. Root `event/appended` can replay raw events, but adapter would need Daedalus internals. | `packages/app-server/src/runtime/event-mapper.ts`, `packages/app-server/src/projections/thread-v1-projection.ts`, `packages/app-server-protocol/src/v1/timeline.ts`. | P0 |
| Reasoning, plan, token usage, model reroute events | Codex maps reasoning deltas, reasoning summaries, plan deltas, token usage, model reroutes, deprecation/config warnings, and realtime events in `CodexAdapter.ts`. | Daedalus has workflow/orchestration projections and raw agent events, but v1 timeline entries are limited. Root protocol has `orchestration/read`, `daedalus/workflow/read`, `audit/query`, `automation/read`, but these are not unified into v1 turn timeline. | Adapter cannot faithfully reproduce t3code Codex activity panels without hybrid reads or lossy summaries. | v1 timeline schemas/routes; `packages/app-server/src/runtime/event-mapper.ts`; `packages/app-server/src/projections/projection-events.ts`; workflow services. | P1 |
| Tool lifecycle and output fidelity | Codex emits `item/started`, `item/completed`, `item/commandExecution/outputDelta`, `item/fileChange/outputDelta`, `item/fileChange/patchUpdated`, and `item/mcpToolCall/progress`; t3code normalizes these into item/tool/content events. | Daedalus agent loop emits `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` (`packages/agent/src/agent-loop.ts`), but `thread-v1-projection.ts` does not map those to `ToolTimelineEntry`; `payload.window` for tool output is a stub. | t3code cannot show Codex-equivalent tool rows, live command output, or tool result windows from pure v1. | `packages/app-server/src/runtime/event-mapper.ts`, `packages/app-server/src/projections/thread-v1-projection.ts`, `packages/app-server-protocol/src/v1/timeline.ts`, `payload-windows.ts`, durable payload storage. | P0 |
| Approvals and safety requests | Codex turns server requests (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `applyPatchApproval`, `execCommandApproval`, permissions) into pending t3code requests and resolves them through Deferreds (`CodexSessionRuntime.ts`). | Daedalus has `ApprovalService.request()`, root `approval/list`/`approval/respond`, v1 `approval.list/decide/answer`, and `ToolApprovalGate` for before-tool approvals. It publishes root app events, but v1 live `approval.changed` is schema-defined rather than consistently emitted. | Needs v1 live/replay equivalence: request opened, pending list, approve/deny, resolved, stale/duplicate/wrong-thread failures, and audit trail. | `packages/app-server/src/runtime/approval-service.ts`, `runtime/tool-approval-gate.ts`, `packages/app-server/src/server/router.ts`, `packages/app-server-protocol/src/v1/approval.ts`, v1 subscriptions. | P0 |
| Structured user input | Codex supports `item/tool/requestUserInput` and `respondToUserInput()` with typed question/options answers. | Daedalus v1 has `ApprovalRequestKind: "answer-input"` and `approval.answer`, while extension UI requests are separate root `extension/ui/request`. There is no general v1 structured user-input request stream equivalent to Codex questions. | t3code cannot render/answer Codex-like structured prompts from Daedalus without a new v1 request type or mapping extension UI into v1. | `packages/app-server-protocol/src/v1/approval.ts` or a new `v1/user-input.ts`; `ApprovalService`; `ExtensionUiRouter`; v1 timeline notifications. | P1 |
| Replay and payload windows | Codex can read thread snapshots (`thread/read`) and t3code persists canonical provider runtime events; output deltas have item/request/turn refs. | Daedalus has root `event/replay`, v1 `thread.replay`, and v1 payload-window schemas. `getPayloadWindowV1()` returns empty chunks for terminal/diff/tool/audit; terminal and diff have separate v1 replay/window methods. | Large outputs, tool results, terminal output, audit details, and diff hunks need one consistent replay/window model for reconnect and lazy rendering. | `packages/app-server/src/server/thread-v1-routes.ts`, `packages/app-server-protocol/src/v1/payload-windows.ts`, persistence migrations/read models. | P0 |
| Diff summaries and file windows | Codex emits `turn/diff/updated`; t3code has checkpoint diff services and UI queries (`apps/server/src/checkpointing/Services/CheckpointDiffQuery.ts`). | Daedalus v1 has `v1.diff.summary` and `v1.diff.fileWindow`; `DiffService` computes current `git diff HEAD` and chunks hunks. Root `diff/get` works by project/worktree/session target. | Current v1 diff is useful but not tied to turn checkpoint ranges. `checkpointId` is carried in the schema but not used as the base/head diff pair. | `packages/app-server/src/workspaces/diff-service.ts`, `workspaces/checkpoint-service.ts`, v1 diff routes in `router.ts`. | P0 |
| Checkpoint capture/restore and thread rollback | Codex supports provider `thread/rollback` and t3code has hidden Git refs per turn (`CHECKPOINT_REFS_PREFIX`, `CheckpointStore`) plus full/turn diff queries. | Daedalus `CheckpointService.create()` writes `refs/daedalus/checkpoints/<session>/<turn>` and root `checkpoint/create/list/restore` exists. `GitMutationService.restoreCheckpoint()` restores workspace/staged state. There is no v1 rollback-by-turn API or guaranteed per-turn automatic checkpoint capture. | Need Codex-like rollback semantics: know checkpoint before/after each turn, restore workspace safely, update Daedalus conversation/thread state, and emit a replayable rollback event. | `packages/app-server/src/workspaces/checkpoint-service.ts`, `git-mutation-service.ts`, `sessions/sqlite-session-store.ts`, `runtime/session-controller.ts`, v1 checkpoint/rollback protocol. | P0 |
| Terminal/shell execution | Codex app-server exposes `command/exec`, write/terminate/resize, output delta, and `thread/shellCommand`. | Daedalus root terminal create/list/input/resize/kill/replay exists. v1 terminal open/input/resize/close/replay routes exist and validate workspace target via `resolveV1WorkspaceTarget()`. TerminalService publishes root `terminal/output`/`terminal/event`, not v1 `v1.terminal.output` consistently. | Terminal operations are close, but live v1 notifications and replay/window contract must be aligned with t3code terminal drawers and command-output timeline entries. | `packages/app-server/src/terminal/terminal-service.ts`, `packages/app-server/src/server/router.ts` v1 terminal handlers, `packages/app-server-client/src/v1/terminal-client.ts`. | P1 |
| Agent tool cwd / workspace cwd | Codex thread start sends cwd into Codex; commands/tools run in that cwd. | Daedalus app-server runtime creates agent services with runtime cwd, but `runtime-options-resolver.ts` creates built-in tools with `TOOL_CWD = process.cwd()` and reuses a global `BUILT_IN_TOOLS` map. | App-server turns can execute read/write/bash/grep/find/ls against the app-server process cwd instead of the project/thread cwd. This is a correctness and safety blocker. | `packages/app-server/src/runtime/runtime-options-resolver.ts`; tool factory calls should use session cwd/services cwd per runtime. | P0 |
| Model/auth/settings snapshot | Codex exposes model/account/config methods and t3code displays provider settings and auth status. | Daedalus root has `model/list`, `model/select`, `auth/status`, `auth/login`, `auth/logout`, `settings/read/set/reset`, and provider auth service. v1 initialize capabilities are minimal and do not cover these. | Functionality exists mostly on root routes; pure v1 adapter needs a stable provider snapshot/capability/auth/model namespace. | `packages/app-server-protocol/src/v1/*` new provider/settings contracts; `packages/app-server/src/runtime/provider-auth-service.ts`, `settings-service.ts`, `server/router.ts`; `app-server-client`. | P1 |
| Text generation for Git/UI helpers | t3code Codex uses `CodexTextGeneration` to generate commit messages, PR title/body, branch names, and thread titles by running `codex exec --output-schema` (`apps/server/src/git/Layers/CodexTextGeneration.ts`). | Daedalus app-server has no comparable `textGeneration/*` protocol. It has model/auth/runtime capabilities but no schema-constrained one-shot generation endpoint for Git/UI helper text. | A Daedalus t3code provider would either lose these Codex features or spawn a separate Daedalus/Codex path outside app-server. | Add app-server text generation service/protocol: `packages/app-server-protocol/src/v1/text-generation.ts`, router service, app-server-client helper; t3code `DaedalusTextGeneration.ts`. | P1 |
| Persistence and reconnect | Codex adapter persists provider binding/resume cursor through `ProviderSessionDirectory`; runtime events stream through `ProviderService`. | Daedalus persists SQLite sessions/events and root `event/replay`. `AppServerClient.reconnect()` replays missed `event/appended` only if `lastEventCursor` is known. WebSocket transport has no built-in close/error state or automatic reconnect; server queue drops oldest messages after 128. | t3code needs robust reconnect: pending requests fail or recover deterministically, missed timeline entries replay from durable cursor, and notification loss is visible. | `packages/app-server-client/src/client.ts`, `ws-transport.ts`, `packages/app-server/src/server/websocket.ts`, event store/replay APIs. | P0 |
| Security/local auth | Codex adapter communicates over child stdio. t3code server owns the process. | Daedalus WebSocket uses token/query auth and same-origin WebSocket allowance; static GUI bootstrap returns token. `/health` is unauthenticated. | Good enough for local desktop, but t3code adapter needs clear local-only trust assumptions, token file permissions, no remote exposure by default, and no token leaks in logs/bootstrap. | `packages/app-server/src/server/auth.ts`, `static-gui.ts`, `server/main.ts`, desktop process helpers, t3code process manager. | P1 |

## Required app-server / protocol / client improvements

### 1. Make v1 the adapter-facing contract

Expose one v1 protocol that covers the full t3code adapter surface. Keep existing root services as implementation internals, but do not require the adapter to mix `session/start`, `turn/start`, `v1.approval.*`, `v1.diff.*`, and ad hoc `thread.*` calls.

Required v1 namespaces:

- `initialize`: server version, protocol version, and explicit capability map.
- `project` / `workspaceTarget`: open/list/select base checkout and worktree targets; validate safety and dirty state.
- `thread`: create/list/get/read/replay/resume/fork/archive/rename/delete as supported by Daedalus session store.
- `turn`: start/cancel/steer or follow-up semantics, with immediate receipts.
- `timeline`: live `thread.timeline` entries plus replay windows for messages, deltas, tool lifecycle, terminal output, approvals, diffs, plans, safety, and recovery.
- `payload`: non-empty `payload.window` results for terminal output, diff content, tool output, and audit detail.
- `approval` / `userInput`: list/decide/answer with live and replay consistency.
- `diff` / `checkpoint` / `rollback`: turn-scoped checkpoint capture, diff by checkpoint pair, restore, and rollback events.
- `terminal`: open/input/resize/close/replay plus v1 live output notifications.
- `provider` / `model` / `auth` / `settings`: snapshots and mutations needed by t3code provider settings.
- `textGeneration`: schema-constrained commit message, PR content, branch name, and thread title generation.
- `diagnostics`: structured process/runtime/protocol errors for adapter health surfaces.

Evidence: v1 schemas exist in `packages/app-server-protocol/src/v1/*`, but active routing is split between `packages/app-server/src/server/thread-v1-routes.ts`, the v1 approval/diff/terminal branch in `AppRouter`, and root `ClientRequestSchema`.

### 2. Return immediate turn receipts

Change `SessionController.startTurn()` so it emits and returns the `turnId` immediately after validating session/workspace state and scheduling runtime work. The runtime prompt should run in a tracked background task that:

- owns the active turn lock;
- emits streaming events while running;
- emits exactly one terminal state (`completed`, `failed`, `cancelled/interrupted`);
- records any thrown error as a durable app event;
- clears active turn state in `finally`;
- lets `turn.cancel` address the active task by thread/turn id.

Evidence: `packages/app-server/src/runtime/session-controller.ts` currently awaits `record.runtime.session.prompt(...)`, and `packages/coding-agent/src/core/agent-session.ts` `prompt()` awaits `this.agent.prompt(messages)`.

### 3. Preserve runtime event fidelity in v1 timeline

Map Daedalus runtime events into stable v1 timeline entries and payload refs instead of requiring clients to inspect raw `agent/*` payloads.

Required mappings:

- `agent/message_start/update/end` -> assistant/user message lifecycle and assistant text deltas.
- `assistantMessageEvent` text/thinking/toolcall events from `message_update` -> text, reasoning, and tool-call delta entries.
- `tool_execution_start/update/end` -> `ToolTimelineEntry` with status and output refs.
- tool result `message_end` -> tool result payload window.
- approval requested/resolved -> approval timeline entries and `approval.changed` notifications.
- terminal start/output/closed -> terminal timeline/context/output entries.
- checkpoint/diff events -> diff/checkpoint timeline entries.
- runtime errors, resume identity mismatches, and safety blocks -> safety/recovery entries.

Evidence: `packages/agent/src/agent-loop.ts` already emits rich tool and message events; `packages/app-server/src/runtime/event-mapper.ts` wraps them; `packages/app-server/src/projections/thread-v1-projection.ts` currently projects only a subset.

### 4. Implement real payload windows

Back `payload.window` with durable stored chunks. It should not return empty arrays except for truly empty payloads.

Required windows:

- terminal output by terminal id/cursor;
- diff hunks by diff id/file path/cursor;
- tool output by tool call id/cursor;
- audit/detail data by audit id/cursor.

The existing specialized `v1.diff.fileWindow` and `v1.terminal.replay` can power the generic payload API, but the generic API must be consistent because v1 timeline refs point there.

Evidence: `getPayloadWindowV1()` in `packages/app-server/src/server/thread-v1-routes.ts` returns empty chunks for every payload kind.

### 5. Make approvals and user input replayable and live

Daedalus should present all pending interactions through v1, not through mixed root approvals and extension UI internals.

Required behavior:

- every approval/user-input request has `threadId`, `turnId`, `workspaceTargetId`, request id, kind, status, title/summary/question(s), and created/updated times;
- decisions are idempotent with clear duplicate/stale/wrong-thread responses;
- live `v1.approval.changed`/user-input notifications are emitted;
- replay reconstructs both pending and resolved requests;
- root `ToolApprovalGate` and extension UI requests map into the same v1 interaction model.

Evidence: `ApprovalService` has `listV1()`, `decideV1()`, and `answerInputV1()`, but live root/v1 notifications are not equivalent to Codex's request lifecycle.

### 6. Align checkpoints, diffs, and rollback with thread turns

Implement checkpoint semantics that match t3code/Codex expectations:

- capture checkpoint refs before/after each turn or at a deterministic turn boundary;
- tie `checkpointId` to thread/turn in v1;
- compute turn diff and full-thread diff from checkpoint refs, not only current `git diff HEAD`;
- expose rollback by turn count or checkpoint id;
- update Daedalus conversation/session state consistently after rollback;
- emit diff/checkpoint/rollback timeline events.

Evidence: `CheckpointService.create()` writes hidden refs, but `DiffService.getSummaryV1()` ignores checkpoint refs and defaults to `HEAD`; root `checkpoint/restore` restores workspace but does not provide Codex-like thread rollback.

### 7. Fix app-server tool cwd

Create built-in tools per session cwd instead of reusing tools constructed with app-server process cwd. This is mandatory before external GUI use because file reads/writes and shell commands must target the selected project/thread workspace.

Evidence: `packages/app-server/src/runtime/runtime-options-resolver.ts` defines `TOOL_CWD = process.cwd()` and `BUILT_IN_TOOLS` at module load.

### 8. Add app-server text generation

Add a Daedalus app-server text-generation service for t3code Git/UI helpers:

- generate commit subject/body and optional branch name;
- generate PR title/body;
- generate branch name from first prompt/attachments;
- generate thread title from first prompt/attachments;
- accept model/effort/fast-mode options;
- return schema-validated structured output and sanitized text.

Evidence: t3code Codex uses `apps/server/src/git/Layers/CodexTextGeneration.ts`; Daedalus app-server has no equivalent route.

### 9. Harden WebSocket/server/client behavior

Required hardening:

- validate incoming request envelopes and params at the server boundary;
- return method-not-found/invalid-params instead of `{}` for unsupported methods;
- reject pending client requests on transport close/error;
- support request timeout/cancellation at the client level;
- expose connection state, reconnect backoff, and replay cursor handling;
- avoid silent notification loss when the server queue overflows;
- emit structured process/runtime diagnostics for adapter status;
- keep token handling local-only and redacted.

Evidence: `packages/app-server/src/server/websocket.ts` parses JSON and invokes `router.handle()` without schema validation; `WebSocketClient` has `MAX_QUEUE = 128` and shifts old messages; `AppServerClient` has manual `reconnect()` but no automatic close/error handling in `ws-transport.ts`.

## Required t3code adapter work

The t3code adapter should mirror the successful Codex shape but talk to Daedalus v1 app-server.

Required files/responsibilities in t3code:

- `apps/server/src/provider/Layers/DaedalusSessionRuntime.ts`: start/connect to Daedalus app-server, own token/endpoint, initialize v1, map t3code thread id to Daedalus thread id, send/cancel turns, read/replay timeline, respond to approvals/user input, close/restart cleanly.
- `apps/server/src/provider/Layers/DaedalusAdapter.ts`: implement `ProviderAdapterShape`; translate Daedalus v1 timeline/events into t3code `ProviderRuntimeEvent` equivalents, following `CodexAdapter.mapToRuntimeEvents()` style.
- `apps/server/src/provider/Layers/DaedalusProvider.ts` or provider registry integration: provider metadata, settings, runtime status, availability, capabilities, and process config.
- `apps/server/src/git/Layers/DaedalusTextGeneration.ts`: use Daedalus app-server text-generation endpoints for commit/PR/branch/thread-title helpers.
- Provider settings/contracts: add Daedalus provider settings for binary/endpoint/token mode without duplicating Daedalus model/auth secrets.
- Provider registration: add Daedalus to t3code's built-in provider catalog/registry.

Adapter event translation must cover:

- assistant text deltas -> `content.delta` / assistant stream;
- reasoning and plan deltas -> reasoning/plan/proposed-plan events;
- `ToolTimelineEntry` -> item started/updated/completed or tool progress events;
- terminal output -> command output events and terminal drawer updates;
- approval/user-input requests -> request opened/resolved and response methods;
- diff/checkpoint/rollback -> turn diff/checkpoint events;
- model/auth/settings changes -> provider snapshot updates;
- runtime warnings/errors/process exits -> provider warning/error/session state;
- unknown v1 events -> logged, non-fatal adapter events with raw payload preserved for diagnosis.

Adapter state rules:

- t3code thread id is the stable external thread identity.
- Daedalus owns execution state, tools, prompts, approvals, safety policy, transcript, and workspace mutation.
- t3code persists only provider binding/resume cursor and UI metadata needed to recover rendering.
- The adapter never reimplements Daedalus tool execution or approval policy.

## Test and smoke requirements

### Daedalus app-server/protocol tests

- Protocol schema tests proving every t3code-required v1 method has params/result schemas and rejects legacy `sessionId` fields on pure v1 requests where applicable.
- Router tests proving every declared v1 method is handled and unknown methods return method-not-found.
- Turn-start timing test using a fake runtime that never completes until released: `turn.start` must return `turnId` before runtime completion, then later emit completion.
- Cancel tests for running, completed, duplicate, and unknown turns.
- Timeline mapping fixture tests for assistant deltas, reasoning deltas, tool start/update/end, tool result, approval request/resolution, user-input request/resolution, terminal output, diff, checkpoint, rollback, safety, and runtime errors.
- Payload window tests for terminal, diff, tool, and audit chunks with cursor, limit, hasMoreBefore/After, and reconnect replay.
- Approval live/replay tests: pending request visible through list, timeline, live notification, decision response, and replay after reconnect.
- Checkpoint/diff/rollback tests in a temp Git repo: capture turn checkpoints, compute turn diff, restore checkpoint, rollback conversation state, and verify file contents/staged state.
- Tool cwd integration test: start a session in a temp project, run read/write/bash/grep/find/ls through app-server runtime, and prove all operate inside the session cwd, not process cwd.
- Terminal v1 tests for open/input/output/replay/resize/close and v1 output notifications.
- Text-generation route tests with a fake model/provider returning schema-constrained outputs.
- WebSocket/client tests for auth failure, invalid JSON, invalid params, method-not-found, server close, pending request rejection, reconnect replay, and queue overflow diagnostics.

### t3code adapter tests

- Unit tests for Daedalus v1 event-to-`ProviderRuntimeEvent` translation using Daedalus fixture events.
- Fake Daedalus app-server process tests for startup, initialize, health/readiness, crash before readiness, crash during turn, and clean shutdown.
- Provider adapter contract tests for `startSession`, `sendTurn`, `interruptTurn`, `respondToRequest`, `respondToUserInput`, `readThread`, `rollbackThread`, `stopSession`, `listSessions`, `hasSession`, and `streamEvents`.
- Text-generation tests for commit message, PR content, branch name, and thread title endpoints.
- Settings/provider snapshot tests for configured/unconfigured/reachable/unreachable/auth/model states.
- Reconnect tests proving a restarted t3code server can recover Daedalus thread binding and replay missed timeline entries.

### Manual smoke requirements

Run against a real local Daedalus app-server from t3code:

1. Start t3code, select Daedalus provider, open a Git project, and create a thread.
2. Send a simple prompt and verify immediate running state, streamed assistant text, final completion, and persistent thread replay after page reload.
3. Run a tool-using prompt and verify visible tool start/update/end plus non-empty tool output window.
4. Trigger an approval-sensitive tool/write and verify pending approval UI, approve path, deny path, replay after reload, and no policy duplication in t3code.
5. Trigger structured user input if exposed and verify answer submission continues the turn.
6. Modify a file, verify diff summary/file window, create/check restore, and rollback a turn with correct workspace state.
7. Open terminal, stream output, resize, replay after reconnect, and close.
8. Start a long turn, cancel it, verify cancelled state and ability to send a follow-up turn.
9. Restart the app-server during idle and during active/recoverable states; verify diagnostics and replay behavior.
10. Use text-generation helpers for branch name, thread title, commit message, and PR content.

## Recommended decision: hybrid root+v1 vs pure v1

Choose **pure v1 as the t3code-facing adapter contract**.

Rationale:

- t3code's Codex integration is built around a coherent provider protocol and typed method/event translation. Exposing Daedalus' current hybrid root+v1 surface would make the adapter permanently aware of Daedalus migration internals.
- Daedalus already has a v1 direction that intentionally avoids `sessionId` compatibility in `packages/app-server-protocol/src/v1/protocol-v1.test.ts`. The implementation should catch up to that contract rather than asking t3code to bridge old and new names.
- Hybrid would force duplicate mapping for sessions/threads, approvals, diffs, terminals, events, and settings. That increases split-brain risk and makes replay/cancel/rollback bugs harder to test.
- Pure v1 can still reuse root services internally. The important boundary is that t3code sees one protocol, one id vocabulary, one event stream, and one error model.

Constraint: today's pure v1 is not complete enough. Before a Codex-parity adapter can rely on it, Daedalus must add the missing v1 routes and semantics listed above. If an adapter must be built before those changes, hybrid root+v1 is only a temporary compatibility mode and should be isolated behind a Daedalus client facade so t3code provider code can be switched to pure v1 without a rewrite.
