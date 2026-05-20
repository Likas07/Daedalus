# Delegation isolation

Daedalus subagents use a transient, artifact-first isolation model for delegated implementation work. The model-facing API is intentionally small:

```json
{ "agent": "worker", "goal": "Implement the task", "assignment": "...", "isolated": true }
```

`isolated: true` asks Daedalus to run the child in a managed transient working tree. Omit it for normal non-isolated delegation unless settings later force isolation.

## Settings

Delegation isolation is configured under `delegation.isolation`:

```json
{
  "delegation": {
    "isolation": {
      "mode": "auto",
      "merge": "patch"
    }
  }
}
```

- `mode`: `none`, `auto`, `apfs`, `btrfs`, `zfs`, `reflink`, `overlayfs`, `projfs`, `block-clone`, or `rcopy`.
- `merge`: `patch` or `branch`; default is `patch`.

The first implementation resolves native/backend hints through the delegation-isolation parser and can fall back to `rcopy` while preserving fallback metadata.

## Lifecycle

```text
subagent({ isolated: true })
  -> capture parent baseline
  -> create .daedalus/isolation/<encoded-repo-root>/<runId>/merged
  -> seed the child tree with the parent's live dirty state
  -> run the child session with cwd=merged
  -> if completed: capture task delta against the baseline
  -> merge by patch or branch
  -> cleanup transient isolation directory by default
  -> return artifact-first metadata to the parent
```

For isolated children, the runner injects a working-tree prompt block that tells the child it is working inside the isolated tree and must not modify files outside it.

## Merge modes

```text
patch mode
  delta.patch -> git apply --check in parent -> apply when clean
                                 \-> preserve patchPath when blocked

branch mode
  delta.patch -> daedalus/subagent/<runId> branch -> cherry-pick into parent
                                           \-> preserve branchName when blocked
```

Results report merge status, changed files, patch or branch artifacts, backend/fallback metadata, and output references. They do not expose cleaned transient paths. A kept path should only appear when a debug/keep setting deliberately preserves the sandbox.

## WorkspaceTarget vs IsolationHandle

`WorkspaceTarget` remains the durable human/session workspace model used by CLI sessions, GUI threads, and managed worktree commands.

`IsolationHandle` is the transient delegated execution sandbox used for `isolated: true` subagents. It owns baseline capture, sandbox paths, dirty-state seeding, delta capture, merge-back, and cleanup.

Keep these concepts separate: GUI/session workspaces are durable; delegated implementation sandboxes are temporary and artifact-first.

## Migration notes

- Use `isolated: true`; do not ask the model to construct low-level `isolation`, `merge_back`, or `base_branch` parameters.
- `subagent_merge_back` is no longer a model-facing recovery tool.
- Child sandbox paths are not durable after cleanup. Use `patchPath`, `branchName`, output artifacts, and merge status for recovery.
- Durable `WorkspaceTarget` merge helpers may still exist for GUI/session workspaces, but subagent isolation self-merges through the delegation-isolation subsystem.
