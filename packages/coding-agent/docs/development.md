# Development

See [AGENTS.md](../../../AGENTS.md) for additional guidelines.

## Setup

```bash
git clone https://github.com/Likas07/Daedalus
cd Daedalus
bun install
bun run check
```

Run the CLI from source:

```bash
bun run dev
# or
bun --cwd=packages/coding-agent src/cli.ts
```

Daedalus keeps the caller's current working directory unless a workspace option is supplied.

## Forking / Rebranding

Configure via `package.json`:

```json
{
  "daedalusConfig": {
    "name": "daedalus",
    "configDir": ".daedalus"
  }
}
```

Change `name`, `configDir`, and `bin` field for your fork. Affects CLI banner, config paths, and environment variable names.

## Path Resolution

Three execution modes: Bun from source, linked package, and standalone binary.

**Always use `src/config.ts`** for package assets:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Never use `__dirname` directly for package assets.

## Debug Command

`/debug` (hidden) writes to `~/.daedalus/agent/pi-debug.log`:
- Rendered TUI lines with ANSI codes
- Last messages sent to the LLM

## Testing

```bash
bun --cwd=packages/coding-agent test              # Package tests
bun --cwd=packages/coding-agent run check         # Package type check
bun run check:gui:parity                          # GUI protocol/parity guard
bun run check                                     # Root lint + type checks
```

For managed worktree changes, useful focused tests are:

```bash
bun --cwd=packages/coding-agent test \
  src/core/workspaces/worktree-metadata.test.ts \
  src/core/workspaces/worktree-bootstrap.test.ts \
  src/core/workspaces/workspace-service.test.ts \
  src/core/workspaces/worktree-cleanup.test.ts \
  src/extensions/daedalus/workflow/workspaces/workspace-commands.test.ts
```

Daedalus uses Bun as the package manager and `bun.lock` as the single root lockfile. Do not add `package-lock.json`; if a setup path reports `InvalidNPMLockfile`, remove stale npm lockfiles and rerun `bun install`.

## Project Structure

```
packages/
  ai/           # LLM provider abstraction
  agent/        # Agent loop and message types  
  tui/          # Terminal UI components
  coding-agent/ # CLI and interactive mode
```

## Managed worktrees

Use `--new-worktree <branch> --confirm-base-checkout` or `/worktree create <branch> [base-ref]` to create an isolated checkout under `.daedalus/worktrees/`. Managed worktrees receive `.daedalus/worktree.json` metadata, apply `.worktreeinclude`, run dependency setup, and set `push.autoSetupRemote=true` for first-push ergonomics. See [managed worktrees](../../../docs/worktrees.md) for lifecycle, merge-back, cleanup, and troubleshooting details.
