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

For renderer/native-shell iteration, run one command from the repository root:

```bash
bun run dev:desktop
```

`dev:desktop` builds the Electron main/preload dev bundle, starts or reuses Vite at `http://127.0.0.1:5173/`, then launches Electron with the desktop preload bridge/server bootstrap. If you already have the browser GUI running with `bun run dev:gui`, `dev:desktop` reuses that Vite server instead of starting another one. CI/headless checks can set `DAEDALUS_DESKTOP_DEV_CHECK=1` to verify the dev server startup without opening Electron.

To produce a ready-to-use desktop app artifact from the repository root:

```bash
bun run package:desktop
```

`package:desktop` builds the GUI, Electron main/preload files, and app-server runtime, then runs electron-builder for the current OS. It prints the created artifact paths when complete. On Linux, expect an AppImage plus the unpacked executable at `release/desktop/linux-unpacked/daedalus`; `package:dir` remains available for unpacked-only packaging. Release packaging requires `bun build --compile` to produce `resources/app-server/daedalus-app-server` and fails rather than silently shipping a script fallback. For local dev/test packaging only, use `bun --cwd=packages/desktop run build:app-server:fallback` or set `DAEDALUS_APP_SERVER_ALLOW_FALLBACK=1` to explicitly stage the Bun entrypoint fallback.

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

`packages/desktop/test/e2e/preload-smoke.test.ts` launches Electron under a hidden `BrowserWindow` with the real compiled preload and asserts that `window.daedalusNative.server.bootstrapEndpoint()` is exposed. On headless Linux it uses `xvfb-run` when no display is present, and the window is always created with `show: false`.

Run the smoke suite directly with:

```bash
bun test packages/desktop/test/e2e/*.test.ts
```

Use a real visible Electron run locally for visual regressions and window lifecycle issues.
