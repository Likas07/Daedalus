# Core workspace targets

Daedalus uses a core-first workspace model. `packages/coding-agent/src/core/workspaces` owns the `WorkspaceTarget` identity used to decide where an agent reads, writes, stores session identity, and validates resume safety. UI and integration surfaces select or display that identity; they should not invent independent cwd/worktree semantics.

## Ownership boundary

- **Core coding-agent** owns `WorkspaceTarget`, `WorkspaceService`, runtime target switching, session workspace identity, resume diagnostics, cleanup risk, and merge-back primitives.
- **CLI startup** parses workspace flags, resolves a core target, and passes it into `createAgentSessionRuntime`.
- **TUI commands** (`/workspace`, `/worktree`) call `runtimeHost.switchWorkspaceTarget()` and display `runtimeHost.workspaceTarget`.
- **Print/JSON mode** includes the runtime workspace target in startup/session metadata when available.
- **RPC mode** exposes status and switching commands that delegate to the runtime target API.
- **SDK callers** can pass `workspaceTarget` to `createAgentSessionRuntime`; runtime creation uses `workspaceTarget.cwd` as the effective cwd and persists the same identity in the session manager.
- **GUI/app-server** should call or project core workspace behavior. The current app-server `WorktreeService` keeps its app-specific allocation/idempotency wrapper for create/adopt flows, and delegates removal to core `WorkspaceService.removeTarget()` through an adapter `WorkspaceTarget` projection. There is no separate `workspace-target-v1-routes.ts` route file in the current tree.

## WorkspaceTarget identity

A target contains the cwd plus optional project/worktree metadata:

```ts
interface WorkspaceTarget {
  id?: string;
  name?: string;
  cwd: string;
  projectRoot?: string;
  isolationMode: "shared_cwd" | "dedicated_worktree" | "external_worktree" | "detached";
  branch?: string;
  worktreePath?: string;
  baseBranch?: string;
  baseCommit?: string;
  validationStatus?: "unknown" | "valid" | "missing" | "dirty" | "conflict" | "invalid";
}
```

The important invariant is that a surface should carry the same target object or same target fields across handoffs. For example, switching to a worktree should update runtime cwd, services cwd, session manager cwd, startup metadata, RPC state, and subagent workspace metadata to the same `WorkspaceTarget.cwd`.

## Startup selection

Startup workspace options are parsed before runtime creation:

- `--project <path>` selects a project root/shared cwd target.
- `--worktree <path>` selects an existing worktree path.
- `--workspace-target <id-or-path>` opens a known target by id/name/path when the workspace service can resolve it.
- `--new-worktree <branch>` creates and enters a dedicated worktree target. Base/ref options are passed through when supplied by the CLI parser.

If none of these flags are used, Daedalus resolves the current cwd through `WorkspaceService.resolveCurrentTarget()` and falls back to a legacy `shared_cwd` target for non-git or cwd-only sessions.

## Runtime and SDK

`createAgentSessionRuntime(factory, { cwd, workspaceTarget })` uses `workspaceTarget.cwd` as the effective cwd. The runtime passes that target to service creation and stores the normalized workspace session identity in `SessionManager`.

Runtime switching is centralized in:

```ts
await runtime.switchWorkspaceTarget({ id: "target-id" });
await runtime.switchWorkspaceTarget({ cwd: "/repo/.daedalus/worktrees/feature" });
await runtime.switchWorkspaceTarget({ mode: "create", branch: "feature", baseRef: "main" });
```

Switching is rejected while a session is busy/streaming or has pending queued messages. Successful switches recreate session services, create a new session manager rooted at the target cwd, persist target identity, and return `{ workspaceTarget, previousWorkspaceTarget }`.

## RPC methods

RPC mode currently supports:

- `get_state` — includes `workspaceTarget` in session state.
- `workspace_status` — returns `{ workspaceTarget }`.
- `workspace_list` — lists git worktrees through the core workspace service when available.
- `workspace_switch` — switches by `cwd`, `branch`, or `idOrName` through `runtimeHost.switchWorkspaceTarget()`.
- `workspace_create` — creates and enters a worktree target through `runtimeHost.switchWorkspaceTarget({ mode: "create", ... })`.
- `workspace_cleanup_risk` — reports cleanup risk for the current target when a workspace service is present.

## TUI commands

The Daedalus workflow extension registers:

- `/workspace status` — shows the active `WorkspaceTarget` from command context/runtime.
- `/workspace enter <id|path|branch>` — switches to a resolved target.
- `/workspace exit` — returns to the base/shared target when available.
- `/worktree create <branch> [baseRef]` — creates and enters a dedicated worktree target.
- `/worktree status` — displays the active target.

These commands are presentation and dispatch layers over core runtime behavior.

## Legacy cwd-only sessions

Older sessions may only record a cwd. On load/resume, Daedalus normalizes them into workspace session identity with a `shared_cwd` target. Resume diagnostics distinguish:

- `resumable` — target cwd is safe to resume.
- `needs_adoption` — session can be adopted into a new/current target.
- `workspace_missing` — stored target path is gone.
- `cwd_mismatch` — current cwd differs from stored target cwd.
- `invalid` — target metadata cannot be trusted.

Recovery choices are to resume as-is when safe, adopt the session into the current workspace, switch/open the stored target, create a replacement worktree, or start a new session.
