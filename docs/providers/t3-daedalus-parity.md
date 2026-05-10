# T3 Daedalus Parity Runbook

Daedalus through T3 is stdio-only. T3 starts one `daedalus-app-server --stdio`
child per T3 provider session, and that child owns the session database,
runtime stream, approvals, replay, rollback, and text-generation requests for
that one session.

HTTP and WebSocket remain Daedalus GUI transports, but they are not T3
fallbacks.

## Identity Invariants

- One assistant message has one stable `messageId` and one T3 `itemId`.
- One tool call has one stable `toolCallId` and one T3 `itemId`.
- One approval or user-input request has one Daedalus `approvalId` and one T3
  `requestId`.
- Approval decisions and user-input answers require `approvalId`, `threadId`,
  `turnId`, and `workspaceTargetId`.
- Reconnect, replay, and rollback must not mint replacement ids for the same
  runtime thing.

## Replay Rules

- `thread.timeline` is durable and materialized. It must not contain streaming
  deltas.
- `thread.timeline.delta` is live-only and incremental. It is never cumulative
  text and is never replayed as a timeline entry.
- Assistant deltas and the final assistant entry share
  `message:<messageId>`.
- Tool output deltas and the final tool entry share `tool:<toolCallId>`.
- Rollback hides removed event ranges from replay while preserving later turns
  and monotonic cursors.

## Debugging

Use `provider.snapshot` first when T3 says Daedalus is unavailable:

```sh
daedalus-app-server --stdio --db /tmp/dae-probe.sqlite
```

Then send `initialize` followed by a `provider.snapshot` request as one JSON
object per line.

In T3, provider event logs are written to `provider/events.log` under the T3
server logs directory. The derived path is
`<baseDir>/<dev-or-userdata>/logs/provider/events.log`.

To identify duplicate UI messages, inspect provider events for repeated
`item.completed` events with the same `itemId`, or assistant `content.delta`
events whose `itemId` changes within one response. In Daedalus storage, compare
the corresponding `message:<messageId>` timeline entry ids.

For approval issues, verify that the opened request event includes the T3
`requestId`, Daedalus `approvalId`, `threadId`, `turnId`, `workspaceTargetId`,
and request kind before any resolve event.

## Breaking Change

Old sessions that only contain partial update events may not replay streamed
partials. Final messages still replay when an `agent/message_end` event exists.
