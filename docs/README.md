# Daedalus documentation

This directory is the project documentation hub. Prefer the current docs below when orienting or updating code; older dated plans and Forge/T3Code port notes remain useful history, but they are not the source of truth for current behavior.

## Current architecture

- [GUI app-server architecture](architecture/gui-app-server.md): active desktop/browser GUI runtime split.
- [Core workspace targets](architecture/core-workspace-targets.md): shared project/worktree target model across CLI, TUI, SDK, RPC, GUI, and app-server.
- [Delegated worktree isolation](architecture/delegated-worktree-isolation.md): subagent implementation isolation and merge behavior.
- [Managed worktrees](worktrees.md): lifecycle, metadata, setup, merge-back, cleanup, and troubleshooting.
- [T3Code-derived GUI](gui/t3code-derived-gui.md): current GUI adaptation contract and disabled-control policy.
- [GUI parity matrix](gui/parity-matrix.md): tracked GUI parity status.
- [Shell/detail projections](gui/shell-detail-projections.md): app-server projection strategy for GUI shell and detail panes.

## Package docs

- [Coding agent](../packages/coding-agent/README.md): CLI/TUI, providers, sessions, customization, RPC, SDK, and GUI command entrypoint.
- [Coding-agent GUI guide](../packages/coding-agent/docs/gui.md): user-facing GUI behavior and CLI flags.
- [App-server protocol](../packages/app-server/docs/protocol.md): canonical protocol envelope, methods, v1 thread protocol, replay, approvals, and persistence.
- [GUI renderer](../packages/gui/README.md): canonical React/Vite renderer used by desktop and `daedalus gui`.
- [Desktop development](../packages/desktop/docs/development.md): Electron host development and packaging notes.
- [AI package](../packages/ai/README.md): provider abstraction and model discovery.
- [Agent core](../packages/agent/README.md): transport-independent agent framework.
- [TUI package](../packages/tui/README.md): terminal UI primitives.
- [Web UI package](../packages/web-ui/README.md): reusable web chat components.

## Planning and history

- `docs/plans/YYYY_MM_DD/` contains local executable implementation plans and adjacent `.plan.json` sidecars. This directory is intentionally local-only.
- `docs/specs/` contains design specs that may predate implementation.
- `docs/Forge-Daedalus port/` and `docs/semantic_search_stack/` contain porting and semantic-search design history. Check current source paths before treating these as implementation truth.
- `docs/t3code-*` files are adapter audits and handoffs; they describe migration findings, not always completed behavior.

## Documentation policy

- Keep current behavior in package READMEs and architecture docs.
- Link to `packages/app-server/docs/protocol.md` for protocol truth; GUI-local protocol docs are summaries only.
- Use Bun commands in examples. The root `bun.lock` is the package-manager source of truth.
- Keep executable implementation plans under `docs/plans/`, not `docs/plan/`.
