# T3Code Frontend + Daedalus Backend GUI Spec

## Status

Draft implementation specification, 2026-05-04.

## Decision

Daedalus GUI will be rebuilt as a destructive renderer replacement using the actual T3Code frontend code as the primary frontend donor, backed by the native Daedalus app-server/runtime/protocol stack.

This is **not** a T3Code-inspired redesign. The first milestone is a T3Code-fidelity frontend that supports the capability envelope T3Code already knows how to represent. Daedalus-only capabilities are deliberately deferred until the T3Code capability envelope works cleanly over Daedalus.

## Primary objective

Build one canonical GUI:

```text
T3Code frontend code and UX
  -> Daedalus GUI compatibility/adaptation layer
  -> @daedalus-pi/app-server-client
  -> @daedalus-pi/app-server-protocol
  -> @daedalus-pi/app-server
  -> Daedalus coding-agent runtime
```

The GUI should preserve T3Code's real shell, routes, sidebar, chat workspace, composer, terminal drawer, diff panel, plan panel, command palette, settings structure, density, keyboard behavior, and styling as much as practical.

## Non-negotiable constraints

1. **Daedalus backend stays authoritative.** Do not run or adopt T3Code `apps/server` as Daedalus backend.
2. **T3Code provider wrappers are not the product architecture.** Do not make Codex/Claude/Cursor/OpenCode CLI wrappers authoritative for Daedalus execution.
3. **Exact frontend fidelity first.** Copy T3Code frontend code first; adapt seams second.
4. **T3Code capability parity first.** Implement the capabilities T3Code already supports before adding Daedalus-only UX.
5. **Destructive renderer reset is acceptable and preferred.** Remove or retire misleading current Daedalus GUI renderer packages so future work has one obvious target.
6. **No silent no-ops.** Unsupported T3 controls must be hidden, disabled, or show explicit unsupported state.
7. **All real execution and durable state go through Daedalus protocol/app-server.**

## Canonical package target

Use `packages/gui` as the canonical GUI package.

Replace the current GUI implementation with a T3Code-derived React/Vite frontend:

```text
packages/gui/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  DAEDALUS-T3CODE-PROVENANCE.md
  src/
    main.tsx
    router.ts
    index.css
    routes/                  # copied/adapted from T3Code
    components/              # copied/adapted from T3Code
    hooks/                   # copied/adapted from T3Code
    lib/                     # copied/adapted from T3Code
    rpc/                     # T3-facing API backed by Daedalus
    environments/            # T3-facing environment model backed by Daedalus
    adapter/
      daedalusBootstrap.ts
      daedalusClient.ts
      daedalusDesktopBridge.ts
      daedalusEnvironment.ts
      daedalusOrchestration.ts
      daedalusProjectionMappers.ts
      daedalusTerminal.ts
      daedalusDiff.ts
      daedalusGit.ts
      daedalusModels.ts
      daedalusSettings.ts
      unsupportedCapabilities.ts
    vendor/t3/
      contracts/
      shared/
      client-runtime/
```

## Renderer reset scope

Remove active build/runtime dependence on the existing GUI renderer split:

- `packages/react-gui`
- `packages/gui-core`
- `packages/gui-components`
- the current Svelte implementation under `packages/gui`

Git history is the rollback mechanism. Do not keep archived old GUI packages in the workspace unless explicitly needed for a short transition, because archived packages will misdirect future agents.

Keep and protect:

- `packages/app-server`
- `packages/app-server-client`
- `packages/app-server-protocol`
- `packages/desktop`
- `packages/coding-agent`
- `packages/agent`
- `packages/ai`
- `packages/tui`

## Donor source

Primary donor:

```text
/home/likas/Research/gui-inspiration/t3code/apps/web
/home/likas/Research/gui-inspiration/t3code/packages/contracts
/home/likas/Research/gui-inspiration/t3code/packages/client-runtime
/home/likas/Research/gui-inspiration/t3code/packages/shared
```

Secondary same-family reference:

```text
/home/likas/Research/gui-inspiration/dpcode
```

Use DPCode only to compare improved T3-family components. Do not make DPCode the primary base.

Jean, Emdash, and Superset are product references only. Do not copy their code for this effort.

## Fidelity rules

### Copy first, adapt second

Initial migration should copy T3Code frontend files into Daedalus-owned paths before behavior refactors.

Allowed donor scopes:

```text
apps/web/src/components/**
apps/web/src/routes/**
apps/web/src/hooks/**
apps/web/src/lib/**
apps/web/src/rpc/**
apps/web/src/environments/**
apps/web/src/store.ts
apps/web/src/types.ts
apps/web/src/index.css
apps/web/src/main.tsx
apps/web/src/router.ts
```

Do not copy as authoritative backend:

```text
apps/server/**
provider adapters
server persistence/orchestration runtime
Codex/Claude/OpenCode/Cursor wrappers
```

### Preserve structure

Keep T3Code filenames and exported component names where practical:

- `ChatView.tsx`
- `Sidebar.tsx`
- `AppSidebarLayout.tsx`
- `ChatComposer.tsx`
- `ThreadTerminalDrawer.tsx`
- `DiffPanel.tsx`
- `PlanSidebar.tsx`
- `CommandPalette.tsx`
- `store.ts`

### Adapt at seams

Most Daedalus-specific changes should live in:

- `src/adapter/**`
- `src/rpc/**`
- `src/environments/**`
- bootstrap and desktop bridge shims

Avoid large visual rewrites inside T3 components during the first working port.

### Import boundaries

Production GUI code must not import:

- `/home/likas/Research/gui-inspiration/t3code/**`
- `/home/likas/Research/Daedalus/third_party/t3code-upstream/**`
- T3Code `apps/server/**`
- Electron directly from renderer code
- Daedalus app-server implementation internals from renderer code

Renderer may import:

- `@daedalus-pi/app-server-client`
- `@daedalus-pi/app-server-protocol`
- Daedalus-owned `packages/gui/src/adapter/**`
- Daedalus-owned copied frontend helper modules under `packages/gui/src/vendor/t3/**`

## V1 capability envelope

V1 should implement the features T3Code already represents well:

- trusted local environment bootstrap
- project list/open
- thread list/open/create/archive/delete/rename
- turn start/cancel/streaming state
- message timeline
- assistant streaming or incremental updates
- composer drafts
- file mentions and attachments where feasible
- model picker backed by Daedalus models
- runtime/access mode picker mapped to Daedalus access policy
- approvals
- terminal drawer
- diff panel
- basic Git/worktree labels/status when represented by T3 UI
- command palette actions that map to Daedalus-safe operations
- settings/provider status enough for T3 settings UI to load honestly

Defer Daedalus-only UX until after V1:

- Muse/Sage/Worker lanes
- Daedalus orchestration panel
- richer Daedalus worktree policy UX
- extension manager
- skills/prompts/resources browser
- semantic search controls
- audit ledger
- automation rules
- project/worktree recovery flows
- advanced PR/CI/integration mutation flows

## Key adapter mappings

### Bootstrap

T3 frontend expects environment/auth bootstrap. Daedalus provides `/api/gui/bootstrap` and desktop `window.daedalusNative.server.bootstrapEndpoint()`.

Adapter behavior:

- read desktop bootstrap first when available
- fallback to `/api/gui/bootstrap`
- synthesize local environment id, label, HTTP URL, WS URL, project root, and authenticated state
- suppress T3 pairing/auth screen for trusted local Daedalus desktop

### Desktop bridge

T3 expects `window.desktopBridge`; Daedalus exposes `window.daedalusNative`.

Expose a `desktopBridge` compatibility shim from `packages/desktop/src/preload.ts` or a renderer-local abstraction. Required methods include branding, local environment bootstrap, folder picker, confirm, external links, context menu fallback, persisted client settings, and update status. Missing methods must not throw during normal GUI load.

### Runtime/access mode

Map T3 modes to Daedalus access policy:

```text
T3 approval-required -> Daedalus supervised
T3 auto-accept-edits -> Daedalus auto-accept
T3 full-access       -> Daedalus unrestricted
```

Daedalus hard blocks remain enforced even when T3 UI says full access.

### Model/provider

T3 provider concepts are display compatibility only. Daedalus provider/model registry is authoritative.

The model picker should show Daedalus models/providers, not fake CLI binary installation state.

### Thread and turn commands

Map T3 orchestration commands to Daedalus protocol:

| T3 concept | Daedalus mapping |
| --- | --- |
| project open/create | `project/open` |
| thread create | `session/start` or v1 `thread.create` once implemented |
| thread list/open | `session/list`, `shell/snapshot`, `thread/snapshot`, or v1 `thread.list/get` |
| thread rename | `session/rename` |
| thread archive/delete | `session/archive`, `session/delete` |
| turn start | `turn/start` |
| turn cancel/interrupt | `turn/cancel` or `runtime/abort` with defined semantics |
| approval respond | `approval/respond` |
| terminal open/write/resize/close | `terminal/create`, `terminal/input`, `terminal/resize`, `terminal/kill` |
| diff panel | `diff/get` and checkpoint data |
| Git stage/unstage | `git/stage`, `git/unstage`, approval-gated |
| unsupported PR/push/pull | hidden or disabled |

## Backend/protocol gaps likely needed

Critical:

- v1 `thread.create`
- v1 `thread.list`
- workspace target list/validate, or compatibility synthesis from existing worktree/project APIs
- richer shell snapshot containing project and thread summaries
- richer thread detail projection for T3 timeline/activity/checkpoint/session fields
- user-input response mapping beyond approvals
- stable turn-to-checkpoint/diff association
- terminal clear/restart if visible in T3 terminal drawer
- provider/model/auth shape rich enough for T3 model picker/settings
- attachment preview URLs or compatible fetch route
- desktop bridge compatibility

## Migration phases

1. **Destructive GUI reset** — make `packages/gui` the only active renderer target; remove old GUI packages from root/desktop/static serving.
2. **Exact T3 frontend import** — copy T3Code frontend into `packages/gui`, preserve styling/routes/components, add provenance and import-boundary tests.
3. **Bootstrap and bridge** — local Daedalus app-server bootstrap, authenticated local environment, `desktopBridge` compatibility.
4. **Read-only shell/thread projection** — real Daedalus projects/threads render in T3 sidebar and ChatView.
5. **Core chat mutations** — create thread, start turn, follow-up, cancel/interrupt, assistant output.
6. **T3 capability parity lanes** — approvals, terminal, diff/Git/worktree status, models/settings/commands.
7. **Desktop default and smoke** — desktop/app-server serve canonical `packages/gui` build.
8. **Hardening** — visual fidelity checks, import boundaries, protocol gap matrix, docs cleanup.
9. **Daedalus differentiation** — add Daedalus-only capabilities after T3 envelope works.

## Acceptance criteria

### Fidelity

- GUI is built from copied/adapted T3Code frontend files.
- T3 shell/sidebar/chat/composer/diff/terminal/settings visual structure is preserved.
- T3 Tailwind/theme baseline is preserved with Daedalus branding changes only.
- Component/file names remain recognizable.
- Visual differences are documented and intentional.

### Backend

- T3Code server is not run or imported.
- Daedalus app-server is the only runtime authority.
- Daedalus coding-agent runtime executes all turns.
- Daedalus approvals/access policy/hard blocks remain enforced.
- Durable backend behavior is exposed through Daedalus protocol/client.

### Functional

- `bun run dev:gui` launches the T3-derived GUI.
- Desktop launches the same GUI through Daedalus app-server.
- Local bootstrap works without T3 auth/pairing screen.
- Sidebar shows projects and threads.
- User can create a thread and send follow-up turns.
- Assistant output appears in the T3 timeline.
- Active turn can be cancelled/interrupted.
- Approvals work.
- Terminal drawer works.
- Diff panel works.
- Model picker shows Daedalus models.
- Unsupported controls are disabled/hidden with explicit state.

### Quality

- `bun --cwd=packages/gui run check` passes.
- `bun --cwd=packages/gui run test` passes.
- `bun --cwd=packages/gui run build` passes.
- Root `bun run check` passes before default release claim.
- Import-boundary tests pass.
- Browser and desktop smoke tests pass.

## Recommended first implementation slice

The first slice should be a destructive renderer reset plus read-only T3 shell over real Daedalus data:

```text
packages/gui is T3-derived React
old GUI packages are removed from active build paths
desktop/app-server serve packages/gui
T3 shell loads with Daedalus bootstrap
T3 sidebar lists real Daedalus projects/threads
T3 ChatView opens an existing Daedalus thread read-only
```

Do not start by adding Daedalus-only features. Make the T3Code capability envelope work first.
