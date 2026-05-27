# Daedalus Core Improvement Roadmap

Date: 2026-05-26

Scope: non-GUI runtime, CLI, framework, subagent, tool, and extension improvements inspired by Forgecode, OhMyOpenAgent, OhMyPi, Codex, Claude Code, Hermes, and OpenCode.

This directory intentionally excludes GUI-first ideas such as parallel workspace dashboards, issue tables, pane layouts, or desktop-native project management. The focus is the Daedalus agent runtime.

## Ranking

The files are ranked from easiest to hardest to implement:

1. `01-doctor-readiness-diagnostics.md`
2. `02-user-configured-model-routing.md`
3. `03-optional-lsp-tools.md`
4. `04-goal-evidence-ledger.md`
5. `05-skill-scoped-mcp-lifecycle.md`
6. `06-virtual-resource-schemes.md`
7. `07-skill-learning-curation.md`
8. `08-persistent-eval-kernels.md`
9. `09-subagent-team-runtime.md`

## Principles

- No context spam: tools such as LSP, diagnostics, skill memories, and eval state must be explicit pulls or compact summaries, not constant context injection.
- User-configured routing: Daedalus should route through user-defined role, tool, and subagent configuration. It should not silently decide models with opaque heuristics.
- Evidence over vibes: long-running workflows should record what was checked, what failed, what changed, and why the goal is complete.
- Skills must earn persistence: skill learning needs strict curation, deduplication, and user approval. A bad skill is worse than no skill.
- Extend the core, not the GUI: each roadmap item should improve CLI/TUI/RPC/SDK/app-server foundations before any GUI presentation layer is considered.
