# Daedalus GUI

`packages/gui` is the canonical Daedalus GUI renderer. It is a T3Code-derived React/Vite frontend used by the desktop app and by the `daedalus gui` web entrypoint. It talks only to the local Daedalus app-server over the typed app-server protocol; coding-agent behavior remains owned by the coding-agent runtime.

## Entrypoints

### Desktop app (primary)

The production GUI entrypoint is the Electron desktop app from `packages/desktop`. The desktop host starts or reuses the local app-server, loads the packaged GUI assets, and connects the renderer through the preload bridge.

Useful commands from the repository root:

```bash
bun run dev:desktop       # Electron shell for development
bun run build:desktop     # Build desktop assets
bun run package:desktop   # Create desktop package artifacts
```

### Web GUI

The CLI also exposes a browser entrypoint:

```bash
daedalus gui [--host 127.0.0.1] [--port 0] [--project .] [--no-open] [--headless]
```

Flags:

- `--host <host>`: bind address. Defaults to `127.0.0.1`. Non-loopback hosts require a bearer token and print a warning.
- `--port <port>`: port to bind. `0` selects an available port.
- `--project <path>`: project root and default SQLite database location.
- `--no-open`: print readiness without opening a browser.
- `--headless`: suppress browser opening; intended for CI and smoke tests.
- `--reuse-server`: reuse an existing healthy app-server when possible.
- `--new-server`: force a new app-server.
- `--log-file <path>`: write app-server logs to a file.

## T3Code-derived scope

The production GUI path is `packages/gui`. The renderer keeps T3Code's project/thread chat workspace model, but Daedalus owns bootstrap, persistence, auth/model discovery, approvals, terminal/filesystem/Git operations, and agent execution through the app-server.

The newer GUI support packages are real package boundaries, but they are not the production desktop/browser renderer:

- `packages/gui-core` contains React-free state and view-model primitives.
- `packages/gui-components` contains React shell/thread/terminal components.
- `packages/react-gui` is the experimental React/Vite app shell used for protocol-v1 thread-surface tests.

Unsupported T3Code controls must be disabled with an explicit reason, not fake-enabled. Currently unsupported: remote environments/public server exposure, terminal restart, remote Git mutation and branch mutation, PR mutation, provider CLI installation, and user-configured T3 provider binary paths. See [T3Code-derived GUI](../../docs/gui/t3code-derived-gui.md).

## Documentation

- [SQLite persistence](docs/sqlite-persistence.md)
- [Security model](docs/security.md)
- [Canonical app-server protocol](../app-server/docs/protocol.md)
- [GUI protocol summary](docs/protocol.md)
- [T3Code-derived GUI](../../docs/gui/t3code-derived-gui.md)
- [Troubleshooting](docs/troubleshooting.md)

## Validation

Run GUI checks from the repository root:

```bash
bun run check:gui
```

Run the browser smoke harness:

```bash
bun run smoke:gui:gstack-browser
```
