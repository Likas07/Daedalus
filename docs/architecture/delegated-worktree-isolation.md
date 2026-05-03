# Delegated worktree isolation

Subagents use the same core `WorkspaceTarget` model as top-level sessions. Isolation mode controls the child cwd and the target metadata passed to nested sessions, tools, and merge-back actions.

## Isolation modes

Subagent requests support current and legacy names:

- `isolation: "inherit"` — run in the parent cwd without creating a child target. No child `workspaceTarget` is attached.
- `isolation: "shared"` — run in the parent cwd and resolve a `shared_cwd` target for metadata. Legacy `isolationMode: "shared-branch"` maps here.
- `isolation: "worktree"` — create a dedicated worktree through `WorkspaceService.createIsolatedTarget()` and run the child in that target cwd. Legacy `isolationMode: "worktree"` maps here.

For worktree isolation, the prepared workspace includes:

- `cwd` set to the child worktree path;
- `workspaceTarget` with `isolationMode: "dedicated_worktree"`;
- metadata containing `isolation`, `workspaceTarget`, `baseBranch`, and `mergeBack` when requested.

`SubagentRunner` passes that cwd into the child `SessionManager`, nested agent session creation, and scoped tool factories, so filesystem tools operate from the same target identity shown in progress/result metadata.

## Merge-back actions

Worktree-isolated runs can request merge-back handling. Current merge-back metadata/actions are core-owned and exposed through the Daedalus subagent workflow and `subagent_merge_back` tool:

- `manual` — leave the child worktree for human review.
- `merge` — merge child changes into the parent/base branch when safe.
- `rebase` — rebase the child branch before integration when requested.
- `squash` — squash child changes into a single merge-back commit when requested.

Merge-back inputs include parent and child `WorkspaceTarget` values plus base refs/commits where available. Cleanup remains separate from merge-back; risky dirty/external/missing worktrees require explicit recovery or confirmation paths.

## Resume diagnostics and recovery

When resuming or inspecting delegated work, use core workspace resume diagnostics rather than comparing strings manually. Common states:

- `resumable` — child target still exists and matches expected cwd/branch.
- `needs_adoption` — the session can be associated with a new/current target.
- `workspace_missing` — the delegated worktree was removed or moved.
- `cwd_mismatch` — the stored target and current cwd differ.
- `invalid` — target metadata is incomplete or unsafe.

Recovery choices:

1. resume in the stored target when it is safe;
2. switch to the stored target before resuming;
3. adopt the session into the current target when intentional;
4. recreate a missing worktree from the base branch/ref;
5. merge/rebase/squash manually, then clean up after confirmation;
6. start a new session if the old target cannot be recovered safely.

## GUI/app-server boundary

The GUI and app-server should present delegated worktrees as projections of core workspace identity. The current app-server `WorktreeService` still owns GUI-specific create/adopt idempotency and custom path allocation, then delegates destructive removal to core `WorkspaceService.removeTarget()` using an adapter `WorkspaceTarget`. This is the Task 8 adapter boundary: app-server projection/idempotency wraps core behavior instead of replacing it.
