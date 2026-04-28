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