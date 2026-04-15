# Fetch + AST Tools v1

Status: implemented as built-in core tools and enabled in the default coding tool set.

## Goal

Add three new built-in core tools to Daedalus:

- `fetch` — fetch remote HTTP/HTTPS content and return cleaned text
- `ast_grep` — structural code search using AST matching
- `ast_edit` — structural AST-aware rewrites

## Scope

Included:
- built-in tool definitions, SDK exports, docs, and tests
- `fetch` for HTTP/HTTPS text-like content
- `ast_grep` for local structural search over files/directories
- `ast_edit` for local structural rewrites with diff output
- built-in availability through the default coding tool set and SDK exports

Excluded:
- read-only tool-set changes
- browser automation or JS execution in `fetch`
- search provider integration in `fetch`
- PDF / Office / binary conversion in `fetch`
- LSP integration
- semantic rename/reference graph
- deferred preview/resolve workflow for `ast_edit`
- formatter-specific postprocessing

## Backend choices

### Fetch

- use standard HTTP fetch
- support text-like content types in v1
- HTML is converted to cleaned text/markdown-ish output
- binary / unsupported content types fail clearly

### AST tools

- use the `ast-grep` CLI as backend
- prefer managed binary resolution via Daedalus tool manager
- search and rewrite backend is wrapped behind internal TypeScript interfaces for testing

## Public schemas

### `fetch`

```ts
{
  url: string,
  raw?: boolean,
  timeout?: number,
  maxChars?: number,
}
```

### `ast_grep`

```ts
{
  pat: string[],
  lang?: string,
  path?: string,
  glob?: string,
  sel?: string,
  limit?: number,
  offset?: number,
  context?: number,
}
```

### `ast_edit`

```ts
{
  ops: Array<{ pat: string; out: string }>,
  lang?: string,
  path?: string,
  glob?: string,
  sel?: string,
  limit?: number,
}
```

## Behavioral rules

### `fetch`

- only `http` / `https`
- default cleaned output for HTML
- `raw: true` returns raw response text for text-like payloads
- response size is bounded and truncated
- unsupported binary/media/document content returns a clear error

### `ast_grep`

- use when syntax shape matters more than plain text
- narrow `path` and `glob` aggressively
- display grouped results by file
- include `LINE#ID` refs in output so results pair naturally with `hashline_edit`

### `ast_edit`

- use for codemods and structural rewrites, not one-off text patches
- preserve BOM and line endings
- return diff summaries and touched-file counts
- direct apply only in v1

## Rollout boundary

V1 is complete when:
- all three tools are built-in and SDK-exported
- all three are enabled in default `codingTools`
- tests cover extraction/search/rewrite wrappers
- docs explain usage and non-goals
