# Delegated worktree isolation

Subagents use the same core `WorkspaceTarget` model as top-level sessions. Isolation mode controls the child cwd and the target metadata passed to nested sessions, tools, and merge-back actions.

## Isolation modes

Subagent requests support current and legacy names:

- `isolation: "inherit"` — run in the parent cwd without creating a child target. No child `workspaceTarget` is attached.
- `isolation: "shared"` — run in the parent cwd and resolve a `shared_cwd` target for metadata. Legacy `isolationMode: "shared-branch"` maps here.
- `isolation: "worktree"` — create a dedicated worktree through `WorkspaceService.createIsolatedTarget()` and run the child in that target cwd. Legacy `isolationMode: "child-branch"` maps here.

For worktree isolation, `WorkspaceService.createIsolatedTarget()` creates a managed Git worktree under `.daedalus/worktrees/<slug>`, then calls `finalizeManagedWorktree()` as the shared post-create lifecycle boundary. The finalizer sets child-local `push.autoSetupRemote=true`, writes `.daedalus/worktree.json`, runs setup unless explicitly disabled, and returns a `WorkspaceTarget` with:

- `cwd` and `worktreePath` set to the child worktree path;
- `projectRoot` set to the parent/base project;
- `isolationMode: "dedicated_worktree"`;
- `branch`, `baseBranch`, and `baseCommit` populated from the create request;
- `mergeBack` populated when a merge target is requested;
- `setup.status` reflecting `created` when setup is disabled or `setup_complete` after setup succeeds.

Setup defaults to true for subagent worktree isolation (`setupWorktree: true`) and ignored-file includes default to true (`includeIgnored: true`). A subagent must opt out explicitly with `setupWorktree: false` to skip dependency/bootstrap setup, and with `includeIgnored: false` to skip `.worktreeinclude` handling while still allowing dependency setup.

Setup first applies `.worktreeinclude` from the base checkout, then runs the dependency command selected from the base lockfile (`bun.lock`/`bun.lockb`, pnpm, Yarn, npm, then Bun for package-only workspaces). `.worktreeinclude` only accepts safe relative paths inside the repository; files are copied, directories are symlinked, and missing entries are skipped. Setup failures update metadata to `setup_failed` before surfacing the error.

`SubagentRunner` passes the resulting cwd into the child `SessionManager`, nested agent session creation, and scoped tool factories, so filesystem tools operate from the same target identity shown in progress/result metadata.

## Merge-back behavior

Worktree-isolated runs can request merge-back handling. Current merge-back policies are `patch` and `branch`:

- `patch` — capture the child diff against the base, dry-run it against the parent, and apply it to the parent checkout when clean. Result details can include the patch artifact path, changed files, conflicts, stdout, and stderr.
- `branch` — create a task/result branch for review or later landing. Result details can include the branch name and changed files.

Worktree isolation defaults to `patch` unless `merge_back` is explicitly set. `inherit` and `shared` runs do not get merge-back by default. `base_branch` selects the base branch/ref for worktree isolation; when omitted, Daedalus resolves the current/base target from the parent checkout.

Merge-back inputs include parent and child `WorkspaceTarget` values plus base refs/commits where available. Cleanup remains separate from merge-back: apply a clean patch or preserve a branch for review/landing first, then remove the worktree through cleanup. Dirty worktrees and external worktrees require explicit force/confirmation paths.

## Resume diagnostics and recovery

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
