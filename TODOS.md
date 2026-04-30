# TODOs

## Post-v1 Daedalus Desktop ADE work

These items are approved follow-ups from `/plan-eng-review` and should stay behind the v1 Safe Worktree Loop work.

### Parallel Futures mode after Safe Worktree Loop ships

- **What:** Add Parallel Futures mode after Safe Worktree Loop ships.
- **Why:** Let one task spawn multiple isolated worktree variants, compare plans/diffs/tests, and promote a winner.
- **Context:** Depends on explicit start target, safe worktree validation, `runsIn` projections, scoped diff review, and reliable reload/recovery.
- **Depends on / blocked by:** Safe Worktree Loop acceptance suite passing.

### Post-v1 ADE expansion

- **What:** Plan post-v1 ADE expansion: issue/PR intake, PR/CI read/review, SSH/remote workspace parity, and merge/promotion workflows.
- **Why:** These are the best Jean/Emdash-inspired full-ADE capabilities, but they depend on a trustworthy local cockpit.
- **Context:** Keep mutation actions protocol-gated and confirmation-first; do not add remote shell or PR mutation before local app-server safety contracts are stable.
- **Depends on / blocked by:** Safe Worktree Loop, scoped diff review, event replay recovery, and product decision on Git mutation depth.

### Formal Daedalus Desktop design system

- **What:** Create a formal Daedalus Desktop `DESIGN.md`.
- **Why:** Define typography, color/status tokens, spacing, row/card rules, warning states, and component vocabulary for desktop/ADE work.
- **Context:** `/plan-design-review` reused existing GUI conventions for v1 because no design system exists. Future ADE expansion needs stronger visual governance.
- **Depends on / blocked by:** Safe Worktree Loop implementation and post-v1 visual QA learnings.

### M3 operation idempotency lease/repair semantics

- **What:** Add stale in-progress recovery for operation idempotency records.
- **Why:** `worktree/create`, `session/start`, and `turn/start` write `in-progress` idempotency records before running side effects. If the app crashes before `complete()` or `fail()`, a retry with the same operation id is blocked forever.
- **Pros:** Makes workspace-start and Continue-in-Worktree retry behavior durable across crashes and aligns with the planned saga/repair path.
- **Cons:** Requires lease/expiry or operation-owner semantics and must not conflict with duplicate-start protection.
- **Context:** M1 intentionally keeps duplicate in-flight operation ids fail-closed. M3 saga/repair should decide whether stale matching operations can be resumed, replayed, failed, or safely taken over.
- **Effort estimate:** M / CC+gstack: S
- **Priority:** P1
- **Depends on / blocked by:** M1 operation idempotency table; M3 Worktree/session/lineage saga repair design.


### Protocol v1 Session cleanup/isolation audit

- **What:** Audit and either delete or isolate old `Session`-shaped GUI/protocol/runtime code so Protocol v1 exposes only `Thread`, `Turn`, `TimelineEntry`, and `WorkspaceTarget` to the React GUI.
- **Why:** The T3Code-derived React GUI plan intentionally chooses a clean Thread-only break. Legacy `Session` concepts must not leak into the new GUI contract through old routes, event names, tests, docs, or helper APIs.
- **Pros:** Preserves the clean-break architecture, reduces mixed terminology, and gives implementers a concrete map of old code to remove, isolate, or replace.
- **Cons:** Adds migration/audit work before visible UI polish, and some internal runtime concepts may still need temporary non-GUI names while the old Svelte path is removed.
- **Context:** `/plan-eng-review` kept the clean Thread-only approach despite an outside-voice recommendation to use `ThreadId === SessionId` compatibility. Start with app-server-protocol messages/projections, app-server routes/persistence, app-server-client helpers, GUI docs, and legacy Svelte tests.
- **Depends on / blocked by:** Protocol v1 design and decision on when `packages/gui` becomes `gui-legacy` or is deleted.

### Protocol v1 TimelineEntry payload-windowing design

- **What:** Design the hybrid `TimelineEntry` model as an ordered render index with referenced/windowed payload APIs for terminal output, large diffs, long tool output, and audit details.
- **Why:** The React GUI needs one T3Code-style ordered timeline, but replay must not embed unbounded terminal/diff/tool payloads that make long-running threads slow or noisy.
- **Pros:** Keeps timeline rendering coherent while preserving efficient retention, replay, pagination, and virtualization for high-volume data.
- **Cons:** Requires a richer protocol design than a single flat event union and adds coordination between timeline, terminal, diff, and tool-output services.
- **Context:** `/plan-eng-review` accepted the outside-voice concern that a single giant timeline payload stream is risky, but kept `TimelineEntry` as the canonical render index. Define entry references, payload fetch commands, pagination cursors, retention expectations, and tests before broad React timeline porting.
- **Depends on / blocked by:** Protocol v1 replay cursor contract and initial `Thread`/`Turn`/`TimelineEntry` schemas.