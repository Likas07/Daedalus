# Daedalus GUI

Daedalus has two GUI entrypoints:

- the desktop app, which is the primary production entrypoint;
- `daedalus gui`, which serves the same renderer through a local browser.

The GUI is backed by the app-server, SQLite session persistence, and the same coding-agent runtime used by the TUI.

## Desktop primary entrypoint

Use the desktop app for day-to-day GUI work. It owns Electron window lifecycle, starts or reuses the local app-server, loads packaged GUI assets, and connects through the desktop preload bridge.

Development commands:

```bash
bun run dev:desktop
bun run build:desktop
bun run package:desktop
```

See `packages/desktop/docs/development.md` for desktop packaging and bootstrap notes.

## Web entrypoint

Run the browser GUI from the CLI:

```bash
daedalus gui [--host 127.0.0.1] [--port 0] [--project .] [--no-open] [--headless]
```

Supported flags:

- `--host <host>`: bind host; defaults to loopback.
- `--port <port>`: bind port; `0` selects a free port.
- `--project <path>`: project root and default app-server database location.
- `--no-open`: do not open a browser.
- `--headless`: CI/smoke mode; also suppresses browser opening.
- `--reuse-server`: reuse an existing healthy app-server.
- `--new-server`: force a new app-server.
- `--log-file <path>`: capture logs.

Non-loopback hosts print a warning and require a bearer token. Tokens are redacted from logs.

## Persistence

GUI sessions are SQLite-primary. For `daedalus gui`, the project database is normally:

```text
<project>/.daedalus/app-server.sqlite
```

The GUI can import and export JSONL sessions for compatibility with CLI/TUI workflows. After import, SQLite is the GUI source of truth; export JSONL when you need a portable copy.

## Security and approvals

The renderer is unprivileged. Filesystem, terminal, provider auth, extension UI, and coding-agent runtime operations go through the local app-server protocol. Risky tool operations are mediated by approval cards; hard blocks remain blocked, and unsupported controls should be disabled with a reason rather than acting as no-ops.

Provider auth is resolved server-side from environment keys, OAuth storage, and runtime state. The GUI should show auth status and login/logout actions without exposing raw credentials.

## Workspace and worktree behavior

The GUI/app-server surface follows the core workspace target model used by CLI/TUI/RPC/SDK. The app-server should select, store, and display targets; coding-agent core owns filesystem-root/session target behavior.

Current implementation note: `packages/app-server/src/workspaces/worktree-service.ts` keeps GUI-specific worktree allocation, create/adopt idempotency, and custom path policy. Destructive removal is delegated to core `WorkspaceService.removeTarget()` through an adapter `WorkspaceTarget`. There is currently no `packages/app-server/src/server/workspace-target-v1-routes.ts`; use the existing app-server worktree/project protocol instead of documenting a non-existent route.

GUI recovery should surface the same choices as core resume diagnostics: resume when safe, switch to the stored target, adopt into the current target, recreate a missing worktree, perform manual merge-back, or start a new session.

## Further reading

- `packages/gui/README.md`
- `packages/gui/docs/sqlite-persistence.md`
- `packages/gui/docs/security.md`
- `packages/gui/docs/protocol.md`
- `packages/gui/docs/troubleshooting.md`
- `docs/architecture/core-workspace-targets.md`
- `docs/architecture/delegated-worktree-isolation.md`
