# Desktop development

`@daedalus-pi/desktop` is the Electron host shell for the Daedalus GUI. It owns native bootstrap, app-server process management, and the preload bridge used by the renderer.

## Common commands

From the repository root:

```bash
bun --cwd=packages/desktop run check
bun --cwd=packages/desktop run test
bun --cwd=packages/desktop run start
```

`bun run start` launches Electron when a graphical environment is available. CI and headless shells may not have a display; use the smoke test for display-independent validation.

For renderer iteration, start the Vite GUI in one shell and Electron in another:

```bash
bun run dev:gui
bun run dev:desktop
```

`dev:gui` starts the browser GUI and a fixed local development app-server. `dev:desktop` points Electron at the same Vite URL (`http://127.0.0.1:5173/`) and still uses the desktop preload bridge/server bootstrap, so it remains usable for native-shell testing while the GUI dev server is running.

## App-server bootstrap

The desktop host uses `ensureAppServer()` to reuse a healthy local app-server or start a new one. Development mode starts the Bun entrypoint from `packages/app-server/src/server/main.ts`; packaged mode can point at a bundled `daedalus-app-server` binary.

The manifest is written to the Daedalus state directory as `app-server.json` and includes:

- loopback endpoint
- optional WebSocket endpoint
- capability token file
- SQLite database path
- process id
- app-server version

## Smoke testing

`packages/desktop/test/e2e/gui-smoke.test.ts` intentionally does not launch Electron. Instead it validates the seams Electron depends on:

- app-server starts and responds to `/health`
- protocol `initialize` advertises extension support
- GUI extension dialogs render and respond through the bridge
- events persist and replay from the app-server database

Run it directly with:

```bash
bun test packages/desktop/test/e2e/gui-smoke.test.ts
```

Use a real Electron run locally for visual regressions, preload behavior, and window lifecycle issues.
