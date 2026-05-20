# Delegated isolation architecture

Daedalus keeps durable workspace management separate from transient delegated implementation sandboxes.

```text
WorkspaceTarget = durable human/session workspace model
IsolationHandle = transient delegated execution sandbox
```

## Model-facing contract

Subagents request delegated sandboxes with `isolated: true`. The previous model-facing `isolation`, `merge_back`, `base_branch`, and `subagent_merge_back` workflow has been replaced by automatic artifact-first merge handling.

Settings live under `delegation.isolation`:

- `mode`: `none`, `auto`, `apfs`, `btrfs`, `zfs`, `reflink`, `overlayfs`, `projfs`, `block-clone`, or `rcopy`.
- `merge`: `patch` or `branch`; default `patch`.

## Lifecycle

```text
subagent({ isolated: true })
  -> capture parent baseline
  -> create .daedalus/isolation/<encoded-repo-root>/<runId>/merged
  -> seed parent dirty state into the child tree
  -> run the child session in mergedDir with an isolated working-tree prompt
  -> on completed child: capture task-only delta
  -> patch mode: git apply --check, apply when clean, preserve patchPath when blocked
  -> branch mode: create daedalus/subagent/<runId>, cherry-pick when clean, preserve branchName when blocked
  -> cleanup transient isolation dir by default
```

The child result is artifact-first: merge status, changed files, backend/fallback metadata, output references, and recovery artifacts are returned to the parent. Cleaned transient paths are not exposed as durable handles.

## Durable worktrees

Managed worktrees under `.daedalus/worktrees/` still use `WorkspaceTarget` and remain appropriate for human-visible CLI/GUI sessions, thread workspaces, and explicit `/worktree` commands. They are not the normal subagent implementation sandbox anymore.

Durable workspace merge helpers may remain for GUI/session workflows. Delegated subagent implementation uses `IsolationHandle` instead.
When resuming or inspecting delegated work, use core workspace resume diagnostics rather than comparing strings directly. Common states:

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
5. if `patch` merge-back is blocked, inspect the recorded patch artifact, conflicts, stdout, and stderr, then resolve/apply the diff deliberately before cleanup;
6. if `branch` merge-back was used, review and land the result branch through the normal branch/PR path before cleanup;
7. start a new session if the old target cannot be recovered safely.

## Cleanup behavior

Core cleanup is owned by `WorkspaceService`:

- `pruneStaleWorktrees()` delegates to `git worktree prune`.
- `cleanupTargetRisk()` ignores Daedalus-local worktree metadata when checking dirtiness, refuses dirty worktrees by default, and treats paths under `.daedalus/worktrees/` as managed/safe when clean.
- `removeTarget()` removes `.daedalus/worktree.json` before `git worktree remove` and requires `force` for dirty or external worktrees.
- Missing managed worktree directories can be removed from local state without forcing.

This keeps destructive removal centralized in core workspace code while allowing CLI/TUI/GUI surfaces to add confirmation UX around the same risk model.

## GUI/app-server boundary

The GUI and app-server should present delegated worktrees as projections of core workspace identity. App-server `WorktreeService` still owns GUI-specific create/adopt idempotency, database events, custom path allocation, and rollback, then calls exported `finalizeManagedWorktree()` after successful `git worktree add` so GUI-created worktrees receive the same metadata, push config, setup, and `.worktreeinclude` behavior as CLI/core-created worktrees. Destructive removal continues to delegate to core `WorkspaceService.removeTarget()` using an adapter `WorkspaceTarget`; app-server projection/idempotency wraps core behavior instead of replacing it.

## Creation path parity

| Surface | Git worktree creation | Shared lifecycle | Default setup/includes | Opt-out fields |
|---|---|---|---|---|
| CLI/TUI | `WorkspaceService.createIsolatedTarget()` | `finalizeManagedWorktree()` | `setup: true`, `includeIgnored: true` | `setup: false`, `includeIgnored: false` |
| Subagents | `prepareSubagentWorkspace()` -> `WorkspaceService.createIsolatedTarget()` | `finalizeManagedWorktree()` through core service | `setupWorktree: true`, `includeIgnored: true` | `setupWorktree: false`, `includeIgnored: false` |
| SDK/runtime | `WorkspaceService.createIsolatedTarget()` or direct `git worktree add` | exported `finalizeManagedWorktree()` | `setup: true`, `includeIgnored: true` | `setup: false`, `includeIgnored: false` |
| GUI/app-server | app-server `WorktreeService` transaction/path allocator | exported `finalizeManagedWorktree()` | `input.setup: true`, `input.includeIgnored: true` | `setup: false`, `includeIgnored: false` |
