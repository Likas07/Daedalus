# GUI shell/detail projections

Daedalus GUI uses a shell/detail projection split for the active Thread workspace. The design was implemented as a near-port of the T3Code chat shell while preserving Daedalus safety, access, worktree, Svelte, licensing, and style constraints.

## T3Code near-port references

The following T3Code files were used as explicit near-port references for component boundaries, state ownership, and subscription flow:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ChatView.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/MessagesTimeline.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/store.ts`
- `/home/likas/Research/gui-inspiration/t3code/apps/server/src/ws.ts`

Daedalus ports the architecture and UX patterns, not React/JSX source code.

## Ownership model

### Shell store ownership

The shell projection owns navigation and summary state only:

- project and Thread list summaries
- selected Thread identity
- target/worktree labels and attention badges
- compact safety/access signals
- restore/reconnect summary state

In GUI code this is represented by `ProjectionShellStore` in `packages/gui/src/client/projection-runtime.ts`. It is populated from `shell/snapshot` and maintained by `shell/event` notifications.

### Detail store ownership

The Thread detail projection owns only the selected Thread content:

- user and assistant message bubbles
- streaming assistant text rows
- compact tool/work activity groups
- pending approvals/questions exposed to the composer
- selected Thread target metadata and safety signals
- diff IDs and inspector detail hooks

In GUI code this is represented by `ProjectionThreadStore` in `packages/gui/src/client/projection-runtime.ts`. It is populated from `thread/snapshot` and maintained by matching `thread/event` notifications for the active Thread only.

## Snapshot-first subscription flow

The client follows a snapshot-first model inspired by T3Code's websocket/store flow:

1. Register notification listeners before requesting the snapshot.
2. Request `shell/snapshot` or `thread/snapshot`.
3. Hydrate the store from the snapshot cursor.
4. Apply only newer events for that projection.
5. Ignore events for inactive Thread detail subscriptions.
6. Unsubscribe on Thread switch or app shutdown.

Server-side routes are read-only. Opening a projection must not create fallback sessions, mutate selection, or fabricate missing target state.

## Sequence guards

Projection snapshots and events carry cursors/sequence numbers. The runtime and subscription helpers use these as stale-event guards so replay, reconnect, and duplicate delivery cannot regress visible state. Thread detail events are additionally scoped by `threadId`; wrong-Thread events are ignored even if their sequence is newer.

## Thread vs Session naming

The GUI is Thread-first. User-facing labels, routes, and chat copy say **Thread**. Internal command bridges may still carry `sessionId` because existing app-server commands (`session/start`, `turn/start`, `session/continue-in-worktree`) are stable protocol surface. Projection payloads therefore include both Thread-facing identity and legacy Session identity where needed.

## Audit ledger location

The active chat timeline must remain a messaging surface. Raw transcript/audit ledger content belongs in inspector/debug surfaces, especially `packages/gui/src/components/inspector/AuditTimeline.svelte` and the debug/audit tabs in `packages/gui/src/components/InspectorPanel.svelte`. Safety cards and raw JSON must not be promoted into `MessagesTimeline.svelte` or `ThreadWorkspace.svelte`.

## Meaningful divergences from T3Code

- **Safety/access:** Daedalus keeps supervised/unrestricted access warnings, hard-block policy, and audit-required signals visible as compact header/composer/inspector signals rather than adopting T3Code's simpler chat-only assumptions.
- **Worktrees:** Daedalus preserves target-scoped base checkout vs isolated worktree semantics, disabled Continue-in-Worktree states, validation warnings, and selected `runsIn` defaults.
- **Protocol compatibility:** Existing Session and Turn commands remain stable; projections are additive and Thread-named instead of renaming all server APIs.
- **Svelte implementation:** Components are Svelte 5 modules (`ThreadWorkspace`, `MessagesTimeline`, `ThreadComposer`) rather than React components.
- **Licensing and style:** Daedalus uses T3Code as a near-port reference for structure and behavior only; code is implemented in Daedalus style with local design tokens and no copied JSX.
- **Ledger placement:** T3Code's minimal chat can omit Daedalus audit detail; Daedalus keeps the ledger available in inspector/debug views to satisfy safety and orchestration requirements without polluting the chat timeline.
