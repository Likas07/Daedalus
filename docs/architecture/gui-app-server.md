# GUI app-server architecture

Daedalus GUI development is split between an Electron desktop host shell and a Bun app-server runtime.

Current Phase 1-4 status: the protocol/client/server/GUI/desktop package split is implemented as the active GUI architecture. The GUI parity closeout is summarized in `docs/architecture/gui-parity-implementation-roadmap.md`.

## Runtime ownership

- **Electron is the host shell.** The desktop package owns native window lifecycle, application menus, OS integration, packaged distribution, and the bridge between renderer UI and the local app-server.
- **Bun app-server owns runtime state.** Long-lived agent sessions, project/worktree state, tool execution coordination, background jobs, and extension lifecycle state live in the app-server process rather than the Electron renderer or main process.
- **The GUI renderer is a client.** The Vite-powered GUI package renders UI, calls client APIs, and keeps only transient view state locally.

## Persistence

SQLite is the primary persistence layer for GUI state. It is the durable store for sessions, projects, worktrees, settings, run metadata, UI recovery state, and extension-owned metadata that needs local durability.

JSONL is not the primary store. JSONL is reserved for import, export, transcript/debug capture, and interoperability with existing agent logs. Runtime features should read and write SQLite first, then project JSONL views only when explicitly importing, exporting, or debugging.

## Package boundaries

- `@daedalus-pi/app-server-protocol` defines shared schemas, request/response contracts, event envelopes, and protocol versioning. It must stay runtime-neutral and avoid importing Electron, GUI, or server implementation modules.
- `@daedalus-pi/app-server-client` provides typed client helpers for renderer and desktop code. It depends on the protocol package and hides transport details from UI code.
- `@daedalus-pi/app-server` implements the Bun runtime service, state management, persistence, agent integration, and extension hosting. It depends on the protocol package and lower-level Daedalus packages as needed.
- `@daedalus-pi/gui` is the browser renderer application. It should depend on the client and protocol packages, not directly on server internals or Electron-only APIs.
- `@daedalus-pi/desktop` is the Electron shell. It launches/connects to the Bun app-server, hosts the GUI, owns desktop integration, and uses the client/protocol packages for communication.

Implemented protocol surfaces include stable project/session/worktree hydration, event replay, approval responses, composer file search/slash command/attachment APIs, audited access policy (`supervised`, `auto-accept`, `unrestricted`), PTY/xterm terminal snapshots/events, workflow state, diagnostics/reconnect status, integration messages, audit/orchestration projections, automation rule metadata, and renderer-safe extension UI metadata. Future protocol candidates include deeper destructive Git mutation, PR creation/update, richer provider health/cost signals, marketplace mutation, and desktop trust-bar state once product policy is finalized.

## GUI mock wiring scope

The production GUI mock wiring scope is tracked in `docs/architecture/gui-mock-wiring-scope.md`. That document distinguishes v1 functional wiring from deferred product-policy tracks such as destructive Git mutation, PR mutation, marketplace installation, and remote/headless GUI clients.

Task 12 closeout adds a documented responsive renderer policy and regression coverage: tablet widths close the inspector; phone widths close both side panes while preserving ProjectBar, central session/composer, and TerminalTail access. Browser QA should be run against `bun run dev:gui` with `agent-browser` for command palette, composer popovers, attachment controls, Unrestricted mode, settings, terminal drawer, and 390px viewport smoke coverage.

## Extension support requirements

The app-server is the extension boundary for GUI features. Extensions must be able to contribute capabilities without coupling to Electron renderer internals:

- declare protocol-visible capabilities and version compatibility;
- register server-side handlers, background tasks, and event publishers;
- persist extension state in SQLite through app-server-managed namespaces or migrations;
- expose renderer-safe metadata and actions through protocol schemas;
- avoid direct access to Electron APIs unless mediated by the desktop package;
- support JSONL import/export/debug hooks for extension-owned transcript or diagnostic data.

This separation keeps native desktop concerns in Electron, durable runtime behavior in Bun, and UI rendering in the GUI package while preserving a stable protocol seam for future web or remote clients.

## Current behavior versus future candidates

Implemented now: the app-server is the durable runtime and protocol boundary for GUI parity surfaces; the renderer consumes typed client state and falls back to placeholder-safe states when server or desktop bridge data is unavailable. Desktop owns process/bootstrap concerns and exposes reconnect/diagnostic affordances instead of letting the renderer manage native process state.

Future candidates: auto-created worktrees, destructive Git operations, PR mutation, extension installation/marketplace flows, remote/headless GUI clients, and a persistent desktop trust bar. These should remain behind explicit protocol contracts and product decisions rather than being added as renderer-only behavior.
