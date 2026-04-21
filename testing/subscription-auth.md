# Subscription Auth Stores for Harness Benchmarks

This benchmark runner is moving to a subscription-first model.

The rule is simple:
- log in natively on the host once per harness
- reuse the harness's own persisted auth store during Harbor runs
- only fall back to API keys when explicitly requested for debugging

## Auth store matrix

| Harness | Native login command | Host auth artifact | Notes | Runner override env |
|---|---|---|---|---|
| Codex | `codex` and sign in with ChatGPT | `~/.codex/auth.json` | Harbor built-in already supports this path directly; `CODEX_FORCE_API_KEY=1` disables it | `CODEX_AUTH_JSON_PATH` |
| Daedalus | `daedalus` then `/login openai-codex` | `~/.daedalus/agent/auth.json` | Daedalus supports overriding the agent dir with `DAEDALUS_CODING_AGENT_DIR` | `DAEDALUS_AUTH_PATH` |
| Oh My Pi | `omp` then `/login openai-codex` | `~/.omp/agent/agent.db` | OMP stores credentials in SQLite and supports `PI_CODING_AGENT_DIR` | `OMP_AGENT_DB_PATH` |
| Forge | `forge provider login` | `~/.forge/` by default, or `~/forge/` if the legacy directory exists, or whatever `FORGE_CONFIG` points to | Forge uses file-based provider config; env-var auth is deprecated | `FORGE_CONFIG_PATH` |
| OpenCode | `opencode auth login` | XDG roots with auth in `~/.local/share/opencode/auth.json` by default | Also uses `~/.config/opencode`, `~/.local/state/opencode`, and `~/.cache/opencode`; preserve the full XDG view for safest reuse | `OPENCODE_AUTH_ROOT` |
| free-code | `./cli /login` from the repo root | `~/.claude.json` by default, or `${CLAUDE_CONFIG_DIR}/.claude.json` when `CLAUDE_CONFIG_DIR` is set | free-code stores OpenAI/Codex OAuth tokens in the global Claude-style config file | `FREE_CODE_AUTH_PATH` |

## Grounding notes

### Codex
Harbor's built-in Codex adapter resolves auth in this order:
1. `CODEX_FORCE_API_KEY=1` disables auth.json
2. `CODEX_AUTH_JSON_PATH`
3. `~/.codex/auth.json`
4. API-key fallback

### Daedalus
Daedalus resolves its agent directory via `DAEDALUS_CODING_AGENT_DIR`, defaulting to:

```text
~/.daedalus/agent
```

Its auth file is:

```text
~/.daedalus/agent/auth.json
```

### Oh My Pi
OMP documents that `/login` stores credentials in:

```text
~/.omp/agent/agent.db
```

It also documents `PI_CODING_AGENT_DIR` for overriding the agent directory.

### Forge
Forge resolves its base config directory in this order:
1. `FORGE_CONFIG`
2. `~/forge` if that legacy directory exists
3. `~/.forge`

For benchmarking, the runner should upload the entire resolved Forge config directory rather than synthesize provider credentials.

### OpenCode
OpenCode uses XDG directories. By default:

```text
XDG_DATA_HOME   -> ~/.local/share
XDG_CONFIG_HOME -> ~/.config
XDG_STATE_HOME  -> ~/.local/state
XDG_CACHE_HOME  -> ~/.cache
```

With app name `opencode`, this yields:

```text
~/.local/share/opencode
~/.config/opencode
~/.local/state/opencode
~/.cache/opencode
```

Its provider auth store lives at:

```text
~/.local/share/opencode/auth.json
```

### free-code
free-code resolves its global config file via `getGlobalClaudeFile()`:
- legacy fallback: `${CLAUDE_CONFIG_DIR}/.config.json`
- normal path: `${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json`

Its global config schema includes:
- `codexOAuth`
- `openaiOauthTokens`

So for the benchmark runner, the primary artifact to reuse is:

```text
~/.claude.json
```

or, if `CLAUDE_CONFIG_DIR` is set on the host:

```text
${CLAUDE_CONFIG_DIR}/.claude.json
```

## Host-side sanity checks

Run these after logging in on the host.

```bash
test -f ~/.codex/auth.json

test -f ~/.daedalus/agent/auth.json

test -f ~/.omp/agent/agent.db

test -f ~/.local/share/opencode/auth.json

test -f ~/.claude.json
```

Forge may use either the legacy or new directory. Check both if you have not set `FORGE_CONFIG` explicitly:

```bash
test -d ~/forge || test -d ~/.forge
```

## Normal workflow

```bash
# one-time after fresh login or auth changes
python testing/run_harness_benchmarks.py --dry-run --all

# baseline all harnesses
./testing/run_harness_benchmarks.sh

# after Daedalus changes
./testing/run_daedalus_regression.sh
```

## Important intent

These paths are benchmark inputs, not new sources of truth.

The runner should prefer explicit override env vars when present, then fall back to the harness's default native auth location.
