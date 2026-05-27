# 01. Doctor And Readiness Diagnostics

## Why This First

This is the easiest high-value improvement because it mostly organizes existing checks into one operator-facing command. Daedalus already has provider auth, settings, worktrees, semantic search, app-server, GUI, and subagent systems. Users need one reliable way to understand whether those systems are ready.

Inspirations:

- Forgecode `doctor`
- Hermes `doctor`
- OpenClaw `doctor`
- OMC/OMX doctor and readiness checks

## Product Shape

Add:

```bash
daedalus doctor
daedalus doctor --providers
daedalus doctor --worktrees
daedalus doctor --semantic
daedalus doctor --subagents
daedalus doctor --app-server
daedalus doctor --json
```

The command should distinguish:

- installed but not configured
- configured but cannot authenticate
- authenticated but unable to complete a real smoke request
- local filesystem state invalid
- optional subsystem unavailable but not blocking
- subsystem degraded with recovery instructions

## What It Should Check

Provider readiness:

- auth files exist
- selected provider/model resolves
- API key or OAuth token can be loaded
- optional real model-call smoke test behind an explicit flag

Workspace readiness:

- current cwd resolves to a `WorkspaceTarget`
- git repo state is readable
- managed worktree metadata is valid
- stale worktree records can be pruned
- root lockfile policy is respected

Semantic search readiness:

- extension enabled
- store path exists
- LanceDB dependency available
- embedding backend reachable when configured
- index status is `ready`, `stale_soft`, `stale_hard`, or missing

Subagent readiness:

- bundled roles are loadable
- subagent settings parse
- isolation backend is available or falls back cleanly
- artifact/result store is writable

App-server readiness:

- can bind loopback port
- database path is writable
- WebSocket initialize works
- terminal PTY can be created
- event replay responds

## Design Constraints

- `doctor` must not mutate by default.
- Fixes can be offered as explicit commands, not silently applied.
- `--json` output should be stable enough for tests and CI.
- It should not require a model call unless the user requests a full smoke.

## Good V1

V1 is useful if it can answer:

```text
Can Daedalus start?
Can it authenticate?
Can it write where it needs to write?
Can it create a worktree?
Can semantic search run?
Can subagents run?
What exact command fixes the first blocker?
```

## Acceptance Criteria

- `daedalus doctor` exits nonzero only for real blockers.
- Warnings are separated from failures.
- Each failure includes a short reason and a concrete next command.
- Tests cover at least providers, workspace, semantic, and app-server dry-run paths.
