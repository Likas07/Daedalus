# 03. Optional LSP Tools

## Position

LSP is valuable only if it is an on-demand tool surface. It must not constantly dump diagnostics, symbol lists, or project structure into the agent context.

The right model:

```text
Agent asks a precise question -> Daedalus calls LSP -> compact answer returns.
```

The wrong model:

```text
Every turn includes all diagnostics, all symbols, and all open files.
```

## Inspirations

- OhMyPi LSP tools
- OpenCode opt-in LSP support
- OhMyOpenAgent LSP operations

## Product Shape

Add optional tools:

```text
lsp_diagnostics
lsp_definition
lsp_references
lsp_symbols
lsp_rename
lsp_code_actions
lsp_hover
```

Each call should require a file path and, where relevant, a position. Avoid broad whole-repo calls except for bounded symbol search.

## Context Budget Rules

- Diagnostics return compact summaries by default.
- Large result sets return refs/windows, not full dumps.
- No automatic injection on prompt start.
- No background "diagnostics changed" messages to the model.
- The TUI can display passive diagnostics to the user, but the model sees them only when it calls a tool.

## Example Tool Shapes

```json
{
  "path": "src/auth/session.ts",
  "line": 42,
  "character": 18
}
```

```json
{
  "path": "src/auth/session.ts",
  "symbol": "SessionManager",
  "newName": "WorkspaceSessionManager"
}
```

## Safety Rules

`lsp_rename` and `lsp_code_actions` should be preview-first:

1. return planned edits
2. require explicit apply through normal edit/approval path
3. reject if source files changed since preview

## V1 Language Strategy

Do not try to support every language perfectly at first.

Good V1:

- TypeScript/JavaScript via `typescript-language-server`
- Rust via `rust-analyzer` when available
- Python via `pyright` or basedpyright when available

If no server is configured, return an actionable unavailable result.

## Acceptance Criteria

- LSP is disabled unless configured or auto-detected safely.
- No LSP data enters model context without a tool call.
- Rename/code-action tools are preview-first.
- Tests cover unavailable server, diagnostics, references, and stale preview rejection.
