# Daedalus

AI coding agent for the terminal, desktop, and local browser. Daedalus is a self-contained fork of [Pi](https://github.com/badlogic/pi-mono) with baked-in workflow extensions, a Bun runtime, and a thread-first GUI backed by a local app-server.

## Installation

Requires [Bun](https://bun.sh/) >= 1.3.7.

```bash
git clone https://github.com/Likas07/Daedalus.git
cd Daedalus
bun install
bun link --cwd packages/coding-agent
```

## Usage

```bash
daedalus                    # Start interactive terminal session
dae                         # Short alias
daedalus "your prompt"      # Non-interactive mode
daedalus gui                # Start the local web GUI
```

Workspace-aware startup options are available across CLI/TUI/RPC/SDK surfaces: `--project <path>`, `--worktree <path>`, `--workspace-target <id-or-path>`, and `--new-worktree <branch>`. Inside the TUI, use `/workspace` and `/worktree` commands to inspect, enter, create, exit, or clean up workspace targets. Managed worktrees are created under `.daedalus/worktrees/`, receive `.daedalus/worktree.json` metadata, run dependency setup from the root lockfile, support `.worktreeinclude`, and set `push.autoSetupRemote=true` for first-push ergonomics. CLI/TUI, subagents, SDK/runtime callers, and GUI/app-server creation now share the same `finalizeManagedWorktree()` post-create lifecycle; setup and ignored-file includes default to true and require explicit opt-outs (`setup: false`/`setupWorktree: false`, `includeIgnored: false`). See [managed worktrees](docs/worktrees.md) for the parity table, lifecycle, merge-back, cleanup, and troubleshooting guidance.

## Packages

| Package | Description |
|---|---|
| `@daedalus-pi/coding-agent` | Main CLI with tools, extensions, TUI, and `daedalus gui` entrypoint |
| `@daedalus-pi/ai` | Unified LLM API (Anthropic, OpenAI, Google, Bedrock, Mistral) |
| `@daedalus-pi/agent-core` | Agent framework with transport abstraction |
| `@daedalus-pi/app-server-protocol` | Shared app-server protocol schemas and versioned message contracts |
| `@daedalus-pi/app-server-client` | Typed client helpers for GUI and desktop callers |
| `@daedalus-pi/app-server` | Local Bun app-server for GUI runtime state, projections, PTY, approvals, and agent sessions |
| `@daedalus-pi/gui` | Canonical T3Code-derived React/Vite GUI renderer for desktop and browser |
| `@daedalus-pi/desktop` | Electron host shell for the production desktop GUI |
| `@daedalus-pi/gui-core` | React-free GUI state, reducers, selectors, and view-model primitives |
| `@daedalus-pi/gui-components` | React GUI shell components shared with the React GUI path |
| `@daedalus-pi/react-gui` | Experimental React/Vite GUI shell used for protocol-v1/thread-surface work |
| `@daedalus-pi/tui` | Terminal UI library with differential rendering |
| `@daedalus-pi/web-ui` | Web UI components for chat interfaces |

## GUI

The desktop app is the primary Daedalus GUI entrypoint. For browser-based local use, run `daedalus gui`; it starts or reuses the local app-server, stores GUI sessions in SQLite, and supports JSONL import/export compatibility with CLI/TUI sessions.

GUI documentation: [packages/gui/README.md](packages/gui/README.md), [GUI overview](packages/coding-agent/docs/gui.md), [app-server architecture](docs/architecture/gui-app-server.md), [canonical protocol](packages/app-server/docs/protocol.md), [SQLite persistence](packages/gui/docs/sqlite-persistence.md), [security](packages/gui/docs/security.md), and [troubleshooting](packages/gui/docs/troubleshooting.md).

Architecture notes: [documentation index](docs/README.md), [core workspace targets](docs/architecture/core-workspace-targets.md), [delegated worktree isolation](docs/architecture/delegated-worktree-isolation.md), [managed worktrees](docs/worktrees.md), and [semantic search stack](docs/semantic_search_stack/README.md).

## Development

```bash
bun run dev          # Run the CLI
bun run check        # Lint + type check
bun run test         # Run tests
```

### Dependency policy

Daedalus uses Bun as its package manager. Keep `bun.lock` as the single root lockfile, update it with `bun install`, and verify reproducible installs with `bun install --frozen-lockfile --dry-run` when changing dependencies. Do not add a root `package-lock.json`; npm lockfiles are not used for this Bun workspace.

## License

MIT
