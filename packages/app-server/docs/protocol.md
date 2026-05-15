# App-server protocol

The Daedalus app-server is the local Bun process used by the desktop GUI. It exposes a loopback HTTP health endpoint and a WebSocket JSON protocol for renderer-to-runtime traffic.

## Bootstrap

1. The desktop host calls `ensureAppServer()` from `@daedalus-pi/desktop`.
2. A capability token is written under the Daedalus state directory.
3. The app-server starts on `127.0.0.1` with an ephemeral port and prints readiness JSON containing `httpUrl` and `wsUrl`.
4. The desktop host writes `app-server.json` with the endpoint, token file, database path, PID, and app-server version.
5. The GUI renderer connects to `/ws` with the bearer token and sends `initialize`.

`GET /health` returns `{ "ok": true }` and is intentionally display-independent for smoke tests and bootstrap checks.

## Message envelope

Client requests use:

```json
{ "kind": "request", "id": "request-1", "method": "initialize", "params": {} }
```

Server responses use the same `id`:

```json
{ "kind": "response", "id": "request-1", "ok": true, "result": {} }
```

Server notifications and server-initiated requests use `kind: "notification"` and `kind: "request"` respectively. Runtime events are persisted as app events and can be replayed with `event/replay`.

Unknown public methods fail with `method_not_found`; unsupported requests must not be treated as empty successful responses. WebSocket clients are expected to initialize before normal requests. The typed client enforces this for WebSocket transports, rejects pending requests when the transport closes, supports per-request timeouts, and validates successful responses against `ClientRequestResultSchemas`.

## Core methods

- `initialize` negotiates protocol version and returns capabilities.
- `project/open`, `project/list` manage workspace records.
- `worktree/list`, `worktree/create` manage project worktrees.
- `session/start`, `session/list`, `session/stop` manage agent sessions.
- `turn/start`, `turn/cancel` manage prompts inside a session.
- `approval/respond` carries approval decisions.
- `extension/ui/respond` returns GUI responses for extension prompts.
- `checkpoint/list`, `checkpoint/restore`, `diff/get` support review and recovery UI.
- `terminal/*` manages embedded terminal sessions.
- `model/*`, `auth/*`, `config/*`, `integration/*` support settings and integrations.
- `event/replay` returns persisted events after a cursor, optionally filtered by type.

The canonical schemas live in `packages/app-server-protocol/src`.

## v1 Thread Protocol

The adapter-facing v1 surface uses thread/workspace terminology and avoids legacy `sessionId` compatibility fields. Implemented methods include `workspaceTarget.list`, `workspaceTarget.validate`, `thread.create`, `thread.list`, `thread.resume`, `thread.get`, `thread.replay`, `turn.start`, `turn.cancel`, and `payload.window`.

`thread.timeline` and `thread.timeline.delta` notifications provide the ordered render index and live deltas for assistant text and tool output. Reconnect flows use durable cursors through `thread.replay` and `event/replay`.

`payload.window` resolves every emitted payload reference through a database-backed window: terminal output by `terminalId`, diff content by `diffId` plus optional `filePath`, tool output by `toolCallId`, and audit detail by `auditId`. Each result returns chunks, `previousCursor`, `nextCursor`, `hasMoreBefore`, and `hasMoreAfter`. Unknown or wrong-thread references fail with typed error codes instead of returning accidental empty chunks.

Approvals are available through `v1.approval.list`, `v1.approval.decide`, and `v1.approval.answer`. Decisions and structured answers accept idempotency keys; duplicate submissions with the same key return the original result, while stale, expired, duplicate, wrong-thread, and not-found decisions return typed failures. Approval lifecycle updates are published as `v1.approval.changed` and projected into replayable timeline entries.

## Extension UI flow

Extensions continue to use `ctx.ui` APIs. In GUI mode the app-server bridges supported prompts into `extension/ui/request` server requests. The renderer displays a dialog and sends `extension/ui/respond` with the selected action and field values. If the dialog is closed without a response, the renderer may send `extension/ui/closed` so the bridge can cancel or fall back.

## Persistence

The app-server stores events in its SQLite database, projects read models from those events, and serves replay through `event/replay`. GUI clients should prefer replay plus live `event/appended` notifications instead of assuming they received every WebSocket message while disconnected.
