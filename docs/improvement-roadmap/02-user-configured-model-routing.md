# 02. User-Configured Model Routing

## Why This Belongs Early

Daedalus already has providers, role modes, subagents, and settings. The next step is to make model routing explicit and user-controlled rather than agent-guessed.

This should follow the OpenCode and OhMyOpenAgent pattern: the user defines which model a role, subagent, or tool family uses; the runtime routes through that configuration.

## Non-Goal

Do not build an opaque heuristic router that silently decides:

```text
"This looks hard, use expensive model."
```

That will be surprising, expensive, and hard to debug.

## Product Shape

Add a routing table to settings:

```json
{
  "routing": {
    "roles": {
      "daedalus": { "model": "openai/gpt-5.3-codex", "thinking": "high" },
      "sage": { "model": "anthropic/claude-sonnet-4.6", "thinking": "medium" },
      "muse": { "model": "openai/gpt-5.3-codex", "thinking": "xhigh" }
    },
    "subagents": {
      "worker": { "model": "openai/gpt-5.3-codex", "thinking": "medium" },
      "reviewer": { "model": "anthropic/claude-opus-4.6", "thinking": "high" }
    },
    "tools": {
      "review": { "model": "anthropic/claude-opus-4.6", "thinking": "high" },
      "commit": { "model": "openai/gpt-5.3-codex-mini", "thinking": "low" },
      "summarize": { "model": "openai/gpt-5.3-codex-mini", "thinking": "minimal" }
    }
  }
}
```

The agent may request a role or tool route, but the runtime picks only from user-defined routes.

## Runtime Rules

- If a route is configured, use it.
- If a route is missing, fall back to the active session model.
- If the configured model is unavailable, fail clearly or use a user-configured fallback.
- Log every route decision in session metadata.
- Never hide cross-provider switches.

## CLI/TUI Surface

Useful commands:

```text
/routes
/routes role sage openai/gpt-5.3-codex high
/routes subagent worker anthropic/claude-sonnet-4.6 medium
/routes tool review anthropic/claude-opus-4.6 high
```

CLI flags could override for one run:

```bash
daedalus --route subagent.worker=openai/gpt-5.3-codex:medium
```

## Why This Matters

This lets Daedalus support:

- cheap fanout workers
- expensive reviewers
- specialized research agents
- model-specific prompt overlays
- predictable cost control
- reproducible team workflows

## Acceptance Criteria

- Route resolution is deterministic and inspectable.
- Route changes persist in settings.
- Subagent creation records the chosen route.
- Tests cover configured route, missing route fallback, unavailable model failure, and per-run override.
