# Daedalus coding agent

Daedalus is a terminal coding harness with a thread-first GUI path. Adapt Daedalus to your workflows without modifying internals: extend it with TypeScript [Extensions](#extensions), [Skills](#skills), [Prompt Templates](#prompt-templates), and [Themes](#themes). Put your extensions, skills, prompt templates, and themes in [Daedalus Packages](#daedalus-packages) and share them through npm, git, or local package paths.

Daedalus ships with powerful defaults plus bundled workflow extensions for planning, subagents, todo state, semantic search, status summaries, safety gates, and GUI handoff. You can still ask Daedalus to build what you want or install a third-party Daedalus package that matches your workflow.

Subagent implementation work can run with transient artifact-first delegation isolation via `isolated: true`. The isolation backend and merge behavior are configured with `delegation.isolation.mode` and `delegation.isolation.merge`; see [Delegation isolation](docs/delegation-isolation.md).

Daedalus runs in five modes: interactive TUI, print or JSON, RPC for process integration, SDK embedding, and the local GUI via `daedalus gui`.

## Table of Contents

- [Quick Start](#quick-start)
- [Providers & Models](#providers--models)
- [Interactive Mode](#interactive-mode)
  - [Editor](#editor)
  - [Commands](#commands)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Message Queue](#message-queue)
- [Sessions](#sessions)
  - [Branching](#branching)
  - [Compaction](#compaction)
- [Settings](#settings)
- [Context Files](#context-files)
- [Customization](#customization)
  - [Prompt Templates](#prompt-templates)
  - [Skills](#skills)
  - [Extensions](#extensions)
  - [Themes](#themes)
  - [Daedalus Packages](#daedalus-packages)
- [Programmatic Usage](#programmatic-usage)
- [Philosophy](#philosophy)
- [GUI](#gui)
- [CLI Reference](#cli-reference)

---

## Quick Start

From this repository, use Bun:

```bash
bun install
bun link --cwd packages/coding-agent
```

Authenticate with an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
daedalus
```

Or use your existing subscription:

```bash
daedalus
/login  # Then select provider
```

Then just talk to Daedalus. By default, Daedalus gives the model these built-in tools: `read`, `bash`, `hashline_edit`, `fetch`, `web_search`, `ast_grep`, `ast_edit`, `write`, `grep`, `find`, and `ls`. The model uses these to fulfill your requests. Add capabilities via [skills](#skills), [prompt templates](#prompt-templates), [extensions](#extensions), or [daedalus packages](#daedalus-packages).

**Platform notes:** [Windows](docs/windows.md) | [Termux (Android)](docs/termux.md) | [tmux](docs/tmux.md) | [Terminal setup](docs/terminal-setup.md) | [Shell aliases](docs/shell-aliases.md)

---

### `web_search`

Daedalus includes a built-in `web_search` tool for current web information when the URL is unknown. This is an ordinary Daedalus tool call: the active model calls `web_search`, Daedalus executes it locally, and the result is returned to the model as a tool result.

Current backend: Codex only.

Requirements:

- Login/configure `openai-codex` OAuth credentials.
- The tool uses the Codex Responses backend with Codex native `{ "type": "web_search" }` under the hood.

Example model-facing call shape:

```json
{
  "query": "Bun 1.3 release notes",
  "search_context_size": "high",
  "max_sources": 5
}
```

Use `fetch` instead when you already know the URL. Treat web results as untrusted external content.

## Providers & Models

For each built-in provider, Daedalus maintains a list of tool-capable models, updated with every release. Authenticate via subscription (`/login`) or API key, then select any model from that provider via `/model` (or Ctrl+L).

**Subscriptions:**
- Anthropic Claude Pro/Max
- OpenAI ChatGPT Plus/Pro (Codex)
- GitHub Copilot
- Google Gemini CLI
- Google Antigravity

**API keys:**
- Anthropic
- OpenAI
- Azure OpenAI
- Google Gemini
- Google Vertex
- Amazon Bedrock
- Mistral
- Groq
- Cerebras
- xAI
- OpenRouter
- Vercel AI Gateway
- ZAI
- OpenCode Zen
- OpenCode Go
- Hugging Face
- Kimi For Coding
- MiniMax

See [docs/providers.md](docs/providers.md) for detailed setup instructions.

**Custom providers & models:** Add providers via `~/.daedalus/agent/models.json` if they speak a supported API (OpenAI, Anthropic, Google). For custom APIs or OAuth, use extensions. See [docs/models.md](docs/models.md) and [docs/custom-provider.md](docs/custom-provider.md).

---

## Interactive Mode

<p align="center"><img src="docs/images/interactive-mode.png" alt="Interactive Mode" width="600"></p>

The interface from top to bottom:

- **Startup header** - Shows shortcuts (`/hotkeys` for all), loaded AGENTS.md files, prompt templates, skills, and extensions
- **Messages** - Your messages, assistant responses, tool calls and results, notifications, errors, and extension UI
- **Editor** - Where you type; border color indicates thinking level
- **Footer** - Working directory, session name, total token/cache usage, cost, context usage, current model

The editor can be temporarily replaced by other UI, like built-in `/settings` or custom UI from extensions (e.g., a Q&A tool that lets the user answer model questions in a structured format). [Extensions](#extensions) can also replace the editor, add widgets above/below it, a status line, custom footer, or overlays.

### Editor

| Feature | How |
|---------|-----|
| File reference | Type `@` to fuzzy-search project files |
| Path completion | Tab to complete paths |
| Multi-line | Shift+Enter (or Ctrl+Enter on Windows Terminal) |
| Images | Ctrl+V to paste (Alt+V on Windows), or drag onto terminal |
| Bash commands | `!command` runs and sends output to LLM, `!!command` runs without sending |

Standard editing keybindings for delete word, undo, etc. See [docs/keybindings.md](docs/keybindings.md).

### Commands

Type `/` in the editor to trigger commands. [Extensions](#extensions) can register custom commands, [skills](#skills) are available as `/skill:name`, and [prompt templates](#prompt-templates) expand via `/templatename`.

| Command | Description |
|---------|-------------|
| `/login`, `/logout` | OAuth authentication |
| `/model` | Switch models |
| `/scoped-models` | Enable/disable models for Ctrl+P cycling |
| `/settings` | Tabbed settings for general, display, behavior, and subagents |
| `/resume` | Pick from previous sessions |
| `/new` | Start a new session |
| `/name <name>` | Set session display name |
| `/session` | Show session info (path, tokens, cost) |
| `/tree` | Jump to any point in the session and continue from there |
| `/fork` | Create a new session from the current branch |
| `/compact [prompt]` | Manually compact context, optional custom instructions |
| `/copy` | Copy last assistant message to clipboard |
| `/export [file]` | Export session to HTML file |
| `/share` | Upload as private GitHub gist with shareable HTML link |
| `/reload` | Reload keybindings, extensions, skills, prompts, and context files (themes hot-reload automatically) |
| `/hotkeys` | Show all keyboard shortcuts |
| `/changelog` | Display version history |
| `/quit` | Quit Daedalus |

### Keyboard Shortcuts

See `/hotkeys` for the full list. Customize via `~/.daedalus/agent/keybindings.json`. See [docs/keybindings.md](docs/keybindings.md).

**Commonly used:**

| Key | Action |
|-----|--------|
| Ctrl+C | Clear editor |
| Ctrl+C twice | Quit |
| Escape | Cancel/abort |
| Escape twice | Open `/tree` |
| Ctrl+L | Open model selector |
| Ctrl+P / Shift+Ctrl+P | Cycle scoped models forward/backward |
| Shift+Tab | Cycle thinking level |
| Ctrl+O | Collapse/expand tool output |
| Ctrl+T | Collapse/expand thinking blocks |

### Message Queue

Submit messages while the agent is working:

- **Enter** queues a *steering* message, delivered after the current assistant turn finishes executing its tool calls
- **Alt+Enter** queues a *follow-up* message, delivered only after the agent finishes all work
- **Escape** aborts and restores queued messages to editor
- **Alt+Up** retrieves queued messages back to editor

On Windows Terminal, `Alt+Enter` is fullscreen by default. Remap it in [docs/terminal-setup.md](docs/terminal-setup.md) so Daedalus can receive the follow-up shortcut.

Configure delivery in [settings](docs/settings.md): `steeringMode` and `followUpMode` can be `"one-at-a-time"` (default, waits for response) or `"all"` (delivers all queued at once). `transport` selects provider transport preference (`"sse"`, `"websocket"`, or `"auto"`) for providers that support multiple transports.

---

## Sessions

Sessions are stored as JSONL files with a tree structure. Each entry has an `id` and `parentId`, enabling in-place branching without creating new files. See [docs/session.md](docs/session.md) for file format.

### Management

Sessions auto-save to `~/.daedalus/agent/sessions/` organized by working directory.

```bash
daedalus -c                  # Continue most recent session
daedalus -r                  # Browse and select from past sessions
daedalus --no-session        # Ephemeral mode (don't save)
daedalus --session <path>    # Use specific session file or ID
daedalus --fork <path>       # Fork specific session file or ID into a new session
```

### Branching

**`/tree`** - Navigate the session tree in-place. Select any previous point, continue from there, and switch between branches. All history preserved in a single file.

<p align="center"><img src="docs/images/tree-view.png" alt="Tree View" width="600"></p>

- Search by typing, fold/unfold and jump between branches with Ctrl+←/Ctrl+→ or Alt+←/Alt+→, page with ←/→
- Filter modes (Ctrl+O): default → no-tools → user-only → labeled-only → all
- Press Shift+L to label entries as bookmarks and Shift+T to toggle label timestamps

**`/fork`** - Create a new session file from the current branch. Opens a selector, copies history up to the selected point, and places that message in the editor for modification.

**`--fork <path|id>`** - Fork an existing session file or partial session UUID directly from the CLI. This copies the full source session into a new session file in the current project.

### Compaction

Long sessions can exhaust context windows. Compaction summarizes older messages while keeping recent ones.

**Manual:** `/compact` or `/compact <custom instructions>`

**Automatic:** Enabled by default. Triggers on context overflow (recovers and retries) or when approaching the limit (proactive). Configure via `/settings` or `settings.json`.

Compaction is lossy. The full history remains in the JSONL file; use `/tree` to revisit. Customize compaction behavior via [extensions](#extensions). See [docs/compaction.md](docs/compaction.md) for internals.

---

## Settings

Use `/settings` to modify common options, or edit JSON files directly:

| Location | Scope |
|----------|-------|
| `~/.daedalus/agent/settings.json` | Global (all projects) |
| `.daedalus/settings.json` | Project (overrides global) |

`/settings` is organized into tabs: `General`, `Display`, `Behavior`, and `Subagents`.
Use `Tab` / `Shift+Tab` or `Left` / `Right` to switch tabs.

The `Subagents` tab covers:

- `subagents.delegationAggressiveness`
- `subagents.maxDepth`
- `subagents.maxConcurrency`
- `subagents.branchIsolation.mutationThreshold`
- safe per-role `model` / `thinkingLevel` overrides

## Prompt architecture

Daedalus uses canonical prompt layers plus model-specific overrides.

Main agent:

1. Constitution
2. Persona
3. GPT/Claude override

Primary user-facing role modes:

1. Daedalus default mode
2. Sage research mode
3. Muse planning mode

Subagents:

1. Shared delegated-task contract
2. Canonical role prompt
3. GPT/Claude override
4. Delegated task packet

Daedalus is the default primary orchestrator. Sage and Muse can also run as primary role modes with `/sage`, `/muse`, `/daedalus`, or `--role`. Bundled subagent roles are Sage, Muse, and Worker; Worker appears as Hephaestus in its display name.

Advanced policy arrays such as `readableGlobs`, `writableGlobs`, and `spawns` remain JSON-only for now.

See [docs/settings.md](docs/settings.md) for all options.

---

## Context Files

Daedalus loads `AGENTS.md` (or `CLAUDE.md`) at startup from:
- `~/.daedalus/agent/AGENTS.md` (global)
- Parent directories (walking up from cwd)
- Current directory

Use for project instructions, conventions, common commands. All matching files are concatenated.

### System Prompt

Replace the default system prompt with `.daedalus/SYSTEM.md` (project) or `~/.daedalus/agent/SYSTEM.md` (global). Append without replacing via `APPEND_SYSTEM.md`.

---

## Customization

### Prompt Templates

Reusable prompts as Markdown files. Type `/name` to expand.

```markdown
<!-- ~/.daedalus/agent/prompts/review.md -->
Review this code for bugs, security issues, and performance problems.
Focus on: {{focus}}
```

Place in `~/.daedalus/agent/prompts/`, `.daedalus/prompts/`, or a [daedalus package](#daedalus-packages) to share with others. See [docs/prompt-templates.md](docs/prompt-templates.md).

### Skills

On-demand capability packages following the [Agent Skills standard](https://agentskills.io). Invoke via `/skill:name` or let the agent load them automatically.

```markdown
<!-- ~/.daedalus/agent/skills/my-skill/SKILL.md -->
# My Skill
Use this skill when the user asks about X.

## Steps
1. Do this
2. Then that
```

Place in `~/.daedalus/agent/skills/`, `~/.agents/skills/`, `.daedalus/skills/`, or `.agents/skills/` (from `cwd` up through parent directories) or a [daedalus package](#daedalus-packages) to share with others. See [docs/skills.md](docs/skills.md).

Executable planning workflows that combine Muse, plan validation, `execute_plan`, task-bound Workers, and final verification are documented in [docs/executable-planning.md](docs/executable-planning.md).

### Extensions

<p align="center"><img src="docs/images/doom-extension.png" alt="Doom Extension" width="600"></p>

TypeScript modules that extend Daedalus with custom tools, commands, keyboard shortcuts, event handlers, and UI components.

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

**What's possible:**
- Custom tools (or replace built-in tools entirely)
- Sub-agents and plan mode
- Custom compaction and summarization
- Permission gates and path protection
- Custom editors and UI components
- Status lines, headers, footers
- Git checkpointing and auto-commit
- SSH and sandbox execution
- MCP server integration
- Make Daedalus look like Claude Code
- Games while waiting (yes, Doom runs)
- ...anything you can dream up

Place in `~/.daedalus/agent/extensions/`, `.daedalus/extensions/`, or a [daedalus package](#daedalus-packages) to share with others. See [docs/extensions.md](docs/extensions.md) and [examples/extensions/](examples/extensions/).

### Subagents

Daedalus can run session-backed subagents as in-process child sessions with:

- compact task packets instead of replaying the full parent transcript
- a base delegation contract plus role-specific prompts
- per-agent model and thinking-level overrides
- runtime-enforced tool, read, write, spawn, depth, and concurrency policy
- explicit `submit_result` completion with optional structured-output validation
- persisted transcript, context, result, and metadata artifacts for `/subagents` inspection
- a read-only subagent inspector that can open transcript, context packet, result JSON, and metadata views
- child-session entry from the inspector, with a return path back to the parent session

Built-in subagent roles:

- `sage` - read-only codebase research, with Markdown evidence artifacts when useful.
- `muse` - planning and executable plan validation through `writing-plans`, `plan_create`, and `plan_validate`.
- `worker` - focused implementation, tests, refactors, and repository mutations.

Commands:
- `/sage`, `/muse`, `/daedalus` - switch primary role mode.
- `/agents`
- `/subagents` — inspect runs, artifacts, and child sessions for the current parent session

Agent definitions can live in:
- `~/.daedalus/agent/agents/*.md`
- `.daedalus/agents/*.md`

### Themes

Built-in: `dark`, `light`. Themes hot-reload: modify the active theme file and Daedalus immediately applies changes.

Place in `~/.daedalus/agent/themes/`, `.daedalus/themes/`, or a [daedalus package](#daedalus-packages) to share with others. See [docs/themes.md](docs/themes.md).

### Daedalus Packages

Bundle and share extensions, skills, prompts, and themes via npm or git. Use the `daedalus-package` keyword for package discoverability.

> **Security:** Daedalus packages run with full system access. Extensions execute arbitrary code, and skills can instruct the model to perform any action including running executables. Review source code before installing third-party packages.

```bash
daedalus install npm:@foo/daedalus-tools
daedalus install npm:@foo/daedalus-tools@1.2.3      # pinned version
daedalus install git:github.com/user/repo
daedalus install git:github.com/user/repo@v1  # tag or commit
daedalus install git:git@github.com:user/repo
daedalus install git:git@github.com:user/repo@v1  # tag or commit
daedalus install https://github.com/user/repo
daedalus install https://github.com/user/repo@v1      # tag or commit
daedalus install ssh://git@github.com/user/repo
daedalus install ssh://git@github.com/user/repo@v1    # tag or commit
daedalus remove npm:@foo/daedalus-tools
daedalus uninstall npm:@foo/daedalus-tools          # alias for remove
daedalus list
daedalus update                               # skips pinned packages
daedalus config                               # enable/disable extensions, skills, prompts, themes
```

Packages install to `~/.daedalus/agent/git/` (git) or global npm. Use `-l` for project-local installs (`.daedalus/git/`, `.daedalus/npm/`). If you use a Node version manager and want package installs to reuse a stable npm context, set `npmCommand` in `settings.json`, for example `["mise", "exec", "node@20", "--", "npm"]`.

Create a package by adding a `daedalus` key to `package.json`:

```json
{
  "name": "my-daedalus-package",
  "keywords": ["daedalus-package"],
  "daedalus": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Without a `daedalus` manifest, Daedalus auto-discovers from conventional directories (`extensions/`, `skills/`, `prompts/`, `themes/`).

See [docs/packages.md](docs/packages.md).

---

## Programmatic Usage

### SDK

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@daedalus-pi/coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

await session.prompt("What files are in the current directory?");
```

For advanced multi-session runtime replacement, use `createAgentSessionRuntime()` and `AgentSessionRuntime`.

See [docs/sdk.md](docs/sdk.md) and [examples/sdk/](examples/sdk/).

### RPC Mode

For non-Node.js integrations, use RPC mode over stdin/stdout:

```bash
daedalus --mode rpc
```

RPC mode uses strict LF-delimited JSONL framing. Clients must split records on `\n` only. Do not use generic line readers like Node `readline`, which also split on Unicode separators inside JSON payloads.

See [docs/rpc.md](docs/rpc.md) for the protocol.

---

## Philosophy

Daedalus is aggressively extensible, but its default distribution now includes the workflow pieces used by the Daedalus product direction: planning, subagents, todo state, semantic search, safety guards, and the local GUI runtime. The core extension system remains the escape hatch for teams that want different behavior.

**Local-first runtime.** CLI/TUI sessions, GUI sessions, worktrees, terminals, approvals, and provider auth stay local unless an explicit integration or extension sends data elsewhere.

**Thread-first work.** The GUI direction is a persistent project/thread chat workspace. The conversation is the center of gravity; diffs, terminals, approvals, and review surfaces support that thread rather than replacing it with a one-shot task runner.

**Structured delegation.** Muse plans, Sage researches, Worker implements, and Daedalus coordinates and verifies. These roles are defaults, not a closed system; packages and project-local agents can extend or replace them.

**Extensibility remains the boundary.** Build custom tools with READMEs and skills, add MCP through an extension when needed, customize permissions through extension hooks, and package team workflows as Daedalus packages.

---

## GUI

The desktop app is the primary GUI entrypoint. The CLI also provides `daedalus gui` for local browser use with SQLite-backed GUI sessions and JSONL import/export compatibility. See [docs/gui.md](docs/gui.md) and [../gui/README.md](../gui/README.md) for entrypoints, flags, security, persistence, protocol, troubleshooting, diagnostics, and agent-browser smoke testing.

---

## CLI Reference

```bash
daedalus [options] [@files...] [messages...]
```

### Package Commands

```bash
daedalus install <source> [-l]     # Install package, -l for project-local
daedalus remove <source> [-l]      # Remove package
daedalus uninstall <source> [-l]   # Alias for remove
daedalus update [source]           # Update packages (skips pinned)
daedalus list                      # List installed packages
daedalus config                    # Enable/disable package resources
```

### Modes

| Flag | Description |
|------|-------------|
| (default) | Interactive mode |
| `-p`, `--print` | Print response and exit |
| `--mode json` | Output all events as JSON lines (see [docs/json.md](docs/json.md)) |
| `--mode rpc` | RPC mode for process integration (see [docs/rpc.md](docs/rpc.md)) |
| `--export <in> [out]` | Export session to HTML |
| `gui` | Start the local web GUI; supports `--host`, `--port`, `--project`, `--no-open`, `--headless`, `--reuse-server`, `--new-server`, and `--log-file` |

In print mode, Daedalus also reads piped stdin and merges it into the initial prompt:

```bash
cat README.md | daedalus -p "Summarize this text"
```

### Model Options

| Option | Description |
|--------|-------------|
| `--provider <name>` | Provider (anthropic, openai, google, etc.) |
| `--model <pattern>` | Model pattern or ID (supports `provider/id` and optional `:<thinking>`) |
| `--api-key <key>` | API key (overrides env vars) |
| `--thinking <level>` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `--models <patterns>` | Comma-separated patterns for Ctrl+P cycling |
| `--list-models [search]` | List available models |

### Session Options

| Option | Description |
|--------|-------------|
| `-c`, `--continue` | Continue most recent session |
| `-r`, `--resume` | Browse and select session |
| `--session <path>` | Use specific session file or partial UUID |
| `--fork <path>` | Fork specific session file or partial UUID into a new session |
| `--session-dir <dir>` | Custom session storage directory |
| `--no-session` | Ephemeral mode (don't save) |

### Tool Options

| Option | Description |
|--------|-------------|
| `--tools <list>` | Enable specific built-in tools (default: `read,bash,hashline_edit,fetch,web_search,ast_grep,ast_edit,write,grep,find,ls`) |
| `--no-tools` | Disable all built-in tools (extension tools still work) |

Available built-in tools: `read`, `bash`, `edit`, `hashline_edit`, `fetch`, `web_search`, `ast_grep`, `ast_edit`, `write`, `grep`, `find`, `ls`

`hashline_edit` is experimental and enabled in the default coding tool set. It pairs with `read` using `format: "hashline"`. Exact-text `edit` remains available, but is no longer in the default tool set. `fetch`, `ast_grep`, and `ast_edit` are also enabled in the default coding tool set.

`hashline_edit` uses the clean bulk shape `{ edits: [{ path, op, pos?, end?, lines?, to? }] }`. Use `op: "replace"` for anchored line/range replacement, `append`/`prepend` for anchored or file-boundary insertion, and `delete`/`move` for file modes. All anchors in one call reference the original `read(format: "hashline")` snapshots.

### Resource Options

| Option | Description |
|--------|-------------|
| `-e`, `--extension <source>` | Load extension from path, npm, or git (repeatable) |
| `--no-extensions` | Disable extension discovery |
| `--skill <path>` | Load skill (repeatable) |
| `--no-skills` | Disable skill discovery |
| `--prompt-template <path>` | Load prompt template (repeatable) |
| `--no-prompt-templates` | Disable prompt template discovery |
| `--theme <path>` | Load theme (repeatable) |
| `--no-themes` | Disable theme discovery |

Combine `--no-*` with explicit flags to load exactly what you need, ignoring settings.json (e.g., `--no-extensions -e ./my-ext.ts`).

### Other Options

| Option | Description |
|--------|-------------|
| `--system-prompt <text>` | Replace default prompt (context files and skills still appended) |
| `--append-system-prompt <text>` | Append to system prompt |
| `--verbose` | Force verbose startup |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

### File Arguments

Prefix files with `@` to include in the message:

```bash
daedalus @prompt.md "Answer this"
daedalus -p @screenshot.png "What's in this image?"
daedalus @code.ts @test.ts "Review these files"
```

### Examples

```bash
# Interactive with initial prompt
daedalus "List all .ts files in src/"

# Non-interactive
daedalus -p "Summarize this codebase"

# Non-interactive with piped stdin
cat README.md | daedalus -p "Summarize this text"

# Different model
daedalus --provider openai --model gpt-4o "Help me refactor"

# Model with provider prefix (no --provider needed)
daedalus --model openai/gpt-4o "Help me refactor"

# Model with thinking level shorthand
daedalus --model sonnet:high "Solve this complex problem"

# Limit model cycling
daedalus --models "claude-*,gpt-4o"

# Read-only mode
daedalus --tools read,grep,find,ls -p "Review the code"

# High thinking level
daedalus --thinking high "Solve this complex problem"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DAEDALUS_CODING_AGENT_DIR` | Override config directory (default: `~/.daedalus/agent`) |
| `DAEDALUS_PACKAGE_DIR` | Override package directory (useful for Nix/Guix where store paths tokenize poorly) |
| `DAEDALUS_SKIP_VERSION_CHECK` | Skip version check at startup |
| `DAEDALUS_CACHE_RETENTION` | Set to `long` for extended prompt cache (Anthropic: 1h, OpenAI: 24h) |
| `VISUAL`, `EDITOR` | External editor for Ctrl+G |

---

## Contributing & Development

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines and [docs/development.md](docs/development.md) for setup, forking, and debugging.

---

## License

MIT

## See Also

- [@daedalus-pi/ai](https://www.npmjs.com/package/@daedalus-pi/ai): Core LLM toolkit
- [@daedalus-pi/agent-core](../../agent/README.md): Agent framework with transport abstraction
- [@daedalus-pi/tui](https://www.npmjs.com/package/@daedalus-pi/tui): Terminal UI components
