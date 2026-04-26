# GUI troubleshooting

## App-server does not start

- Run `daedalus gui --project <path> --no-open` to print readiness without opening a browser.
- Use `--log-file <path>` to capture app-server logs.
- Check whether the selected `--port` is already in use; omit it or pass `--port 0` to select a free port.
- Verify `bun run check:gui` from the repository root for type and Svelte issues.

## Browser cannot connect

- Confirm the readiness URL and WebSocket URL point at the same app-server.
- Keep the default loopback host unless you intentionally need remote access.
- If using a non-loopback host, include the generated bearer token and avoid logging or sharing it.
- Restart with `--new-server` if `--reuse-server` finds a stale process.

## SQLite or session errors

- Stop desktop and web GUI processes before copying database files.
- Preserve `<project>/.daedalus/app-server.sqlite` plus `*.sqlite-wal` and `*.sqlite-shm` sidecars.
- Try JSONL export for affected sessions before recovery work.
- If a migrated database fails to open, keep a copy, remove the active files, restart, and import JSONL exports.

## Provider auth problems

- Environment API keys are detected server-side.
- OAuth/subscription auth is managed by the provider auth service and exposed to the GUI as status, login, and logout actions.
- If a provider row is disabled, read its disabled reason; some providers require terminal login or environment configuration.

## Approvals appear stuck

- Confirm the session is still running and connected.
- A hard-blocked operation cannot be approved from the GUI.
- Deny/revise sends a real response to the runtime; if the model does not continue, cancel the turn and start a new one.

## Desktop packaging and terminal issues

Packaged desktop builds must include GUI assets, the app-server resource, and native terminal dependencies such as `node-pty`. If embedded terminals fail only in packaged mode, validate the package directory and compare the app-server resource path used by `packages/desktop/src/server-process.ts`.

## Diagnostics and support bundle

Use the GUI diagnostics export/support bundle action when available. A useful support bundle includes app-server logs, protocol capability info, database path, package versions, and smoke-test output. It must redact bearer tokens and provider credentials.

## Agent-browser smoke

Run the display-independent browser smoke harness from the repository root:

```bash
bun run smoke:gui:agent-browser
```

This checks startup, health, protocol initialization, and core GUI flows without requiring a manual browser session.
