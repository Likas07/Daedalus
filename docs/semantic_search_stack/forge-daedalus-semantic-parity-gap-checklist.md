# Forge vs Daedalus Semantic Search Parity Gap Checklist

Date: 2026-04-22
Status: corrective checklist after runtime/code sweep
Scope: behavior and runtime exposure gaps between Forge semantic search and the current Daedalus implementation

## Purpose

This note records the specific differences that still prevent Daedalus from matching Forge semantic-search behavior.

It exists because the current local stack is working, but the parity target is stricter than “working local semantic search”.

## Already matched or substantially matched

These are no longer the primary blockers:

- local semantic DB exists and works
- chunk-level indexing exists
- Ollama + `embeddinggemma` embeddings work
- LanceDB auto-embeds inserts and text queries
- semantic workspace state exists
- hybrid retrieval exists
- local reranking/fusion exists
- chunk-level result payloads exist
- stale/uninitialized/unsynced blocking exists
- tests for the local stack exist and pass

## Not yet matched: parity blockers

### 1. Lifecycle ownership model

Forge:
- semantic workspace lifecycle is exposed primarily through user-managed commands
  - CLI workspace commands
  - interactive slash commands
  - shell aliases
- the model does not primarily manage lifecycle through semantic tools as its normal operating path

Daedalus currently:
- exposes lifecycle mainly as tools:
  - `sem_workspace_init`
  - `sem_workspace_sync`
  - `sem_workspace_status`
  - `sem_workspace_info`
- does not yet expose equivalent Forge-style slash-command surfaces

Required parity move:
- add Forge-style user-managed runtime commands for lifecycle
- stop treating the lifecycle as a model-first semantic-management surface

### 2. Exposure model

Forge:
- sem_search is conditionally included in the tool list only when the current workspace is indexed and auth/index gating passes

Daedalus currently:
- sem_search is always registered and visible
- readiness is enforced only when the tool is executed

Required parity move:
- sem_search availability must become readiness-aware at exposure time, not just call time

### 3. Prompt availability alignment

Forge:
- prompt/tool context changes when sem_search is absent
- the prompt does not advertise semantic search when the tool is unavailable

Daedalus currently:
- prompt guidance is attached through active tools/snippets
- but the exposure model still differs, so prompt availability alignment is not yet Forge-equivalent

Required parity move:
- ensure prompt guidance changes with actual semantic-tool exposure

### 4. Query schema

Forge:
- `queries: [{ query, use_case }]`
- per-query retrieval intent and reranking/use-case intent are explicitly separated

Daedalus currently:
- `query?: string`
- `queries?: string[]`
- no `use_case`

Required parity move:
- adopt the same richer Forge-style query envelope

### 5. Multi-query behavior

Forge:
- runs queries in parallel
- preserves per-query structure in results
- then deduplicates across query result sets

Daedalus currently:
- runs per-query searches and aggregates into one flattened global ranking

Required parity move:
- preserve per-query result structure rather than flattening immediately

### 6. Cross-query deduplication semantics

Forge:
- performs explicit cross-query deduplication and keeps each node in the query bucket where it has the best score

Daedalus currently:
- aggregates hits by chunkId and sums scores across queries

Required parity move:
- replace summed aggregation with Forge-style cross-query dedup behavior

### 7. Result envelope and grouping

Forge:
- structured output is grouped by query
- within a query, grouped by file
- chunks within a file are line-sorted
- output is richer for downstream reasoning

Daedalus currently:
- returns a flat ranked list of chunk hits

Required parity move:
- return a richer per-query grouped envelope
- render grouped file/chunk structure like Forge

### 8. Runtime surfaces and product integration

Forge:
- exposes lifecycle through CLI, slash commands, and shell plugin aliases
- semantic search is surfaced as a product feature, not only as an agent tool

Daedalus currently:
- status dashboard exists
- tool surfaces exist
- no equivalent semantic lifecycle slash-command suite yet

Required parity move:
- implement matching runtime surfaces

## Recommendation

The next implementation work should focus on these parity blockers in this order:

1. lifecycle command surfaces
2. readiness-aware sem_search exposure
3. prompt availability alignment
4. richer query schema (`query` + `use_case`)
5. per-query result envelopes
6. Forge-style cross-query dedup
7. grouped rendering/output

Only after these are done should Daedalus be considered close to full Forge semantic-search parity.
