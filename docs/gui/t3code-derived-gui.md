# T3Code-derived Daedalus GUI

`packages/gui` is the canonical Daedalus GUI renderer. It is a T3Code-derived React/Vite frontend adapted to run against the local Daedalus app-server rather than T3Code's original backend and provider runtime.

## Default path

- Desktop is the primary production GUI path. `packages/desktop` builds and packages the renderer from `packages/gui`.
- `daedalus gui` serves the same `packages/gui` build for local browser use and smoke testing.
- Legacy GUI package splits such as `packages/gui-core` and `packages/gui-components` are not active runtime targets.

## Backend contract

The renderer bootstraps a trusted local Daedalus environment from the desktop preload bridge or `/api/gui/bootstrap`, then connects to the app-server over the typed app-server protocol. The app-server owns SQLite persistence, provider/model discovery, terminal/filesystem/Git operations, approvals, and coding-agent execution.

## Unsupported T3 controls

Some T3Code controls are intentionally disabled instead of being fake-enabled:

- Remote environments and public server exposure are deferred until Daedalus has a finalized remote/headless trust policy.
- Terminal restart waits for a Daedalus terminal restart protocol endpoint.
- Git push/pull/fetch and branch mutations are deferred until audited remote-write policy is finalized.
- Pull request mutation is deferred until integration mutation policy is finalized.
- Provider CLI install and binary-path settings are not applicable because Daedalus uses the app-server provider/auth/model layer.

Unsupported controls must return explicit disabled results with reasons and must not silently no-op or report success.

## Smoke coverage

Package-level verification must pass before claiming `packages/gui` as the default desktop/browser GUI:

```bash
bun scripts/check-gui-import-boundaries.ts
bun --cwd=packages/gui run test
bun --cwd=packages/gui run check
bun --cwd=packages/gui run build
```

`packages/gui/test/e2e/t3-gui-smoke.test.ts` is a pragmatic Vitest smoke because this repository does not currently include a package-local browser E2E runner for `packages/gui`. It covers the equivalent adapter/render seams: app bootstrap, authenticated local Daedalus environment, sidebar/thread routing, composer API visibility, unsupported controls, and opening a test thread route. The full external browser smoke is `bun run smoke:gui:gstack-browser`, which uses gstack browse against the local `daedalus gui` server.

Desktop smoke coverage lives in `packages/desktop/test/e2e/desktop-gui-smoke.test.ts`; it validates the packaged `packages/gui` renderer/app-server contract and desktop bridge seams without launching Electron in headless CI.
