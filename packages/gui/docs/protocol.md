# GUI protocol

The GUI talks to the Daedalus app-server using the typed protocol in `packages/app-server-protocol`. The renderer should use `packages/app-server-client` helpers instead of hand-written request strings when helpers exist.

## Bootstrap

1. Desktop or `daedalus gui` starts/reuses the app-server.
2. The app-server writes readiness details: HTTP URL, WebSocket URL, token file, database path, PID, and version.
3. The renderer connects to `/ws` with the bearer token.
4. The renderer sends `initialize` and receives protocol capabilities.
5. Live notifications and replayed events populate GUI state.

`GET /health` is token-independent and intended only for local readiness checks.

## Envelope

Requests:

```json
{ "kind": "request", "id": "request-1", "method": "initialize", "params": {} }
```

Responses:

```json
{ "kind": "response", "id": "request-1", "ok": true, "result": {} }
```

Server notifications and server-initiated requests use `kind: "notification"` and `kind: "request"` respectively.

## Session and persistence methods

SQLite-backed GUI sessions are exposed through session methods for start, list, resume, fork, rename, archive/delete, stats/tree, JSONL import, and JSONL export. Runtime turn methods start and cancel turns. App events are persisted and replayed with `event/replay` so reconnect can be authoritative.

## Approval and extension flows

Approval flow:

1. runtime classifies a pending tool operation;
2. app-server sends an approval request/event;
3. renderer shows the approval card;
4. renderer sends `approval/respond`;
5. runtime continues, revises, or blocks.

Extension UI flow:

1. extension calls a supported `ctx.ui` prompt;
2. app-server sends an `extension/ui/request`;
3. renderer displays the dialog;
4. renderer sends `extension/ui/respond` or `extension/ui/closed`;
5. app-server resolves or cancels the pending extension request.

## Compatibility guidance

Protocol changes should update schemas, client helpers, router handling, GUI callers, and protocol tests together. Prefer adding capabilities and disabled reasons over silent behavior changes.
