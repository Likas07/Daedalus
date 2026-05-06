# Managed worktrees

Daedalus can create and run isolated Git worktrees for CLI sessions, TUI commands, GUI threads, and delegated subagents. Managed worktrees live under the project-local `.daedalus/worktrees/` directory and carry Daedalus metadata in the child checkout.

## Lifecycle

### 1. Create

From the CLI, create a new managed worktree with a branch name:

```bash
daedalus --new-worktree agent/my-task --confirm-base-checkout
```

In an interactive TUI session, use:

```text
/worktree create agent/my-task [base-ref]
```

The runtime creates the checkout at:

```text
<project>/.daedalus/worktrees/<slugified-branch>
```

The branch must not already exist in another worktree, and the target path must be unused. `base-ref` defaults to `HEAD` when omitted.

### Creation path parity

All Daedalus-managed creation surfaces converge on the same post-create lifecycle after `git worktree add`: metadata, child-local push configuration, optional `.worktreeinclude`, dependency setup, and `WorkspaceTarget` construction.

| Surface | Creation owner | Shared post-create boundary | Default setup / includes | Explicit opt-out |
|---|---|---|---|---|
| CLI/TUI (`--new-worktree`, `/worktree create`) | `WorkspaceService.createIsolatedTarget()` creates the Git worktree under `.daedalus/worktrees/`. | Calls `finalizeManagedWorktree()`. | `setup: true`, `includeIgnored: true` unless the caller disables setup. | Pass `setup: false` and/or `includeIgnored: false` through the creation options. |
| Delegated subagents | `prepareSubagentWorkspace()` asks `WorkspaceService.createIsolatedTarget()` for dedicated worktree isolation. | `WorkspaceService` calls `finalizeManagedWorktree()`. | `setupWorktree` and `includeIgnored` default to true for worktree isolation. | Set `setupWorktree: false` and/or `includeIgnored: false` on the subagent request. |
| SDK/runtime | The exported workspace service/finalizer APIs are the runtime boundary for programmatic managed worktree creation. | Call `WorkspaceService.createIsolatedTarget()` or `finalizeManagedWorktree()` after external `git worktree add`. | `setup` and `includeIgnored` default to true. | Pass `setup: false` and/or `includeIgnored: false`. |
| GUI/app-server | App-server owns GUI idempotency, database events, path allocation, and rollback around Git creation. | Calls exported `finalizeManagedWorktree()` after successful Git creation. | `input.setup` and `input.includeIgnored` default to true. | Send `setup: false` and/or `includeIgnored: false` in the app-server create request. |

`finalizeManagedWorktree()` is the shared post-create lifecycle boundary. It intentionally does not allocate paths, check conflicts, create database records, or run `git worktree add`; each surface keeps those responsibilities. Once a managed checkout exists, the finalizer owns consistent push config, `.daedalus/worktree.json`, setup execution, and returned target metadata.

### 2. Setup

After `git worktree add`, Daedalus writes metadata and runs worktree setup unless setup is explicitly disabled by the caller. For managed creation paths, `setup` defaults to true and `includeIgnored` defaults to true; callers must opt out explicitly with `setup: false`/`setupWorktree: false` or `includeIgnored: false`.

Setup does two things:

1. Applies `.worktreeinclude` from the base checkout.
2. Runs the dependency install command inferred from the base checkout lockfile.

Dependency setup precedence is:

1. `bun.lock` or `bun.lockb` -> `bun install`
2. `pnpm-lock.yaml` -> `pnpm install`
3. `yarn.lock` -> `yarn install`
4. `package-lock.json` or `npm-shrinkwrap.json` -> `npm install`
5. `package.json` with no lockfile -> `bun install`

Daedalus itself uses Bun and keeps `bun.lock` as the root lockfile. A normal Daedalus worktree should therefore run `bun install`.

### 3. Branch tracking and push ergonomics

Managed worktrees set this Git config in the child checkout:

```bash
git config push.autoSetupRemote true
```

That means the first `git push` from the worktree can create and track the matching upstream branch without requiring `--set-upstream` in common Git versions/configurations.

### 4. Metadata

Each managed worktree contains:

```text
.daedalus/worktree.json
```

The metadata records:

- metadata `version`
- child `branch`
- `baseRef` used to create the worktree
- resolved `baseCommit`
- optional `mergeTarget`
- setup `status` and `updatedAt`
- `createdAt`

Setup status values are:

- `created` — worktree was created but setup was skipped or has not started
- `setup_pending` — setup is running or was marked pending before install/include work
- `setup_complete` — include copying/linking and dependency install completed
- `setup_failed` — include or dependency setup failed

The file is local runtime metadata. It is ignored by cleanup dirtiness checks and removed before worktree removal.

### 5. `.worktreeinclude`

Create `.worktreeinclude` at the base checkout root to copy or link ignored local runtime files into new worktrees:

```gitignore
# copy file contents
.env.local

# symlink directories from the base checkout
.cache/tool-state
```

Rules:

- Blank lines and comments are ignored.
- Entries must be relative paths inside the repository.
- Absolute paths, `..`, and `.git` path components are rejected as unsafe.
- Existing files are copied.
- Existing directories are symlinked.
- Missing entries are skipped.

Use this only for local development/runtime material that is intentionally shared or copied. Do not include secrets unless copying them into every managed worktree is acceptable for your environment.

### 6. Work and verify

Enter or open a worktree before running checks:

```text
/worktree enter agent/my-task
```

or:

```bash
daedalus --worktree .daedalus/worktrees/agent-my-task
```

Useful verification commands from a Daedalus worktree include:

```bash
bun run check:gui:parity
bun --cwd=packages/coding-agent test src/core/workspaces/worktree-metadata.test.ts src/core/workspaces/worktree-bootstrap.test.ts src/core/workspaces/workspace-service.test.ts src/extensions/daedalus/workflow/workspaces/workspace-commands.test.ts
bun --cwd=packages/coding-agent run check
bun run check
```

Run the narrowest checks that cover your change while iterating, then run broader package/root checks before merge-back when feasible.

### 7. Merge back

Worktree-isolated delegated runs can record merge-back intent. Current merge-back actions are exposed through the Daedalus subagent workflow and `subagent_merge_back` tool:

- `manual` — leave the child worktree for human review
- `merge` — merge child changes into the parent/base branch when safe
- `rebase` — rebase the child branch before integration
- `squash` — squash child changes into one merge-back commit

Cleanup is intentionally separate from merge-back. Verify the child branch, integrate it into the target branch, then remove the worktree only when the branch state is safe to discard locally.

### 8. Cleanup

Interactive cleanup:

```text
/worktree cleanup [--force]
```

Core cleanup behavior:

- Prunes stale Git worktree records.
- Removes clean managed worktrees under `.daedalus/worktrees/`.
- Refuses dirty worktrees unless forced.
- Refuses external worktrees unless forced.
- Treats missing managed worktree directories as safe to remove from local state.
- Deletes `.daedalus/worktree.json` before `git worktree remove`.

Use `--force` only after reviewing uncommitted changes and confirming that any external path is intentionally removable.

## Troubleshooting

### `InvalidNPMLockfile`

Daedalus is a Bun workspace. If a worktree setup or validation path reports an `InvalidNPMLockfile` error, check for a stale `package-lock.json` or npm-generated lockfile in the checkout. The expected root lockfile is `bun.lock`.

Recommended recovery:

```bash
rm -f package-lock.json npm-shrinkwrap.json
bun install
bun install --frozen-lockfile --dry-run
```

Then retry worktree creation/setup. If the error occurs in a child worktree, fix the base checkout first so future managed worktrees inherit the correct lockfile policy.

### Setup failed

Inspect `.daedalus/worktree.json` in the child checkout. If `setup.status` is `setup_failed`, rerun the failing setup command from the child worktree after correcting the issue, usually:

```bash
bun install
```

Then rerun project checks. If `.worktreeinclude` failed, inspect entries for absolute paths, `..`, `.git`, or paths that resolve outside the repository.

### Cannot remove a worktree

If cleanup refuses removal, run:

```bash
git -C <worktree> status --short
git -C <worktree> branch --show-current
```

Commit, stash, discard, or merge the changes intentionally. Use forced cleanup only after that review.
