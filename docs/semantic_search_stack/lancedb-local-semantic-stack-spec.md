# Daedalus Local Semantic Search Stack Spec

Date: 2026-04-22
Status: research draft rewritten for full Forge-parity target
Workspace target: `/home/likas/Research/Daedalus`
Primary implementation target: `packages/coding-agent`

## Summary

Daedalus should implement a fully local semantic search stack that matches Forge’s semantic-search behavior as closely as possible while remaining native to Daedalus’s architecture.

This means Daedalus must provide the local equivalent of Forge’s behaviorally essential semantic-search system:

- lifecycle-gated workspace initialization and sync
- chunk-level indexing and retrieval
- semantic plus lexical retrieval
- reranking/fusion over those retrieval modes
- line-aware search results with chunk content and scores
- strong readiness/staleness guarantees
- prompt/tool doctrine that makes agents use the tool the same way Forge agents use `sem_search`

The implementation should be built around:

- LanceDB OSS as the embedded local retrieval/index layer
- application-owned code chunking
- local Ollama-hosted embeddings with `embeddinggemma` as the current default reference embedding model
- full-text search (FTS) for lexical code signals
- hybrid retrieval as the default retrieval behavior
- local reranking/fusion sufficient to reproduce Forge-like search behavior
- local chunk-level results suitable for exact follow-up reads and edits

This is not a reduced “good enough” semantic stack. The target is full behavioral parity with Forge within Daedalus’s system.

## Parity interpretation

In this document, “parity with Forge” means:

- same effective behavior
- same practical capabilities
- same search usefulness profile for agents/users
- same lifecycle expectations
- same retrieval/result semantics where they materially affect behavior

It does not mean:

- literal reuse of Forge’s hosted backend
- identical auth/account model
- identical gRPC protocol
- identical repository layout

The design target is:
- behavioral parity
- Daedalus-native implementation
- local/self-hosted infrastructure

## Why this spec exists

Daedalus currently has:
- a semantic workspace lifecycle surface (`sem_workspace_init`, `sem_workspace_sync`, `sem_workspace_status`, `sem_workspace_info`)
- a `sem_search` tool
- a local JSON snapshot index and heuristic token/path/content scoring

That is useful as a readiness shell, but it does not produce Forge-like semantic-search behavior.

Forge’s practical semantic-search behavior comes from a complete semantic subsystem, not a single search function:
- workspace lifecycle
- chunk indexing
- semantic retrieval
- lexical retrieval
- reranking/fusion
- chunk-level result rendering
- readiness-aware exposure/use of the tool

This spec defines the local Daedalus architecture required to reproduce that behavior.

## Primary goals

1. Make `sem_search` behaviorally equivalent to Forge’s semantic-search experience.
2. Keep the stack fully local/self-hosted by default.
3. Preserve and strengthen Daedalus’s semantic workspace lifecycle UX.
4. Support semantic, lexical, and hybrid code discovery as a single coherent retrieval system.
5. Return chunk-level, line-aware, score-aware results.
6. Ensure readiness/staleness behavior is as strict and predictable as Forge’s lifecycle model.
7. Make the resulting tool suitable for Daedalus, Sage, Muse, and worker-style flows.

## Non-goals

1. Exact wire compatibility with Forge’s hosted gRPC API.
2. Reproducing Forge’s auth/account/workspace-server architecture.
3. Building a mandatory remote service for OSS Daedalus.
4. Defining the final chunking heuristic down to exact implementation details in this document.
5. Implementing the stack in this document.

## Research basis

This spec is based on:

1. direct read-through of the LanceDB docs checkout at `/home/likas/temp/lancedb-docs`
2. direct read-through of Forge semantic-search-related code in `/home/likas/Research/harnesses/forgecode`
3. live probing of the Forge semantic backend via grpcurl
4. comparative analysis of current Daedalus semantic-workspace code

Important local docs sources include:
- `/home/likas/temp/lancedb-docs/docs/quickstart.mdx`
- `/home/likas/temp/lancedb-docs/docs/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/lance.mdx`
- `/home/likas/temp/lancedb-docs/docs/tables-and-namespaces.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/quickstart.mdx`
- `/home/likas/temp/lancedb-docs/docs/indexing/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/indexing/vector-index.mdx`
- `/home/likas/temp/lancedb-docs/docs/indexing/fts-index.mdx`
- `/home/likas/temp/lancedb-docs/docs/indexing/scalar-index.mdx`
- `/home/likas/temp/lancedb-docs/docs/search/vector-search.mdx`
- `/home/likas/temp/lancedb-docs/docs/search/full-text-search.mdx`
- `/home/likas/temp/lancedb-docs/docs/search/hybrid-search.mdx`
- `/home/likas/temp/lancedb-docs/docs/search/multivector-search.mdx`
- `/home/likas/temp/lancedb-docs/docs/search/optimize-queries.mdx`
- `/home/likas/temp/lancedb-docs/docs/reranking/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/reranking/custom-reranker.mdx`
- `/home/likas/temp/lancedb-docs/docs/reranking/eval.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/embedding/ollama.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/embedding/sentence-transformers.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/rrf.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/mrr.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/cross_encoder.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/colbert.mdx`
- `/home/likas/temp/lancedb-docs/docs/tutorials/search/multivector-needle-in-a-haystack.mdx`

## What Forge parity requires behaviorally

To match Forge sem_search behavior within Daedalus, the local stack must reproduce the following behaviorally essential properties.

### 1. Lifecycle parity

Forge semantic search is not a blind search call. It is lifecycle-gated.

Equivalent Daedalus behavior must include:
- explicit workspace initialization
- explicit sync/index build
- readiness-aware status/info
- clear blocking when semantic search is unavailable or stale
- explicit re-sync expectations after workspace changes

### 2. Retrieval-unit parity

Forge retrieves chunks, not only whole files.

Equivalent Daedalus behavior must include:
- chunk rows as retrieval units
- file path + line range in results
- content snippets from chunks
- scoring at chunk level

### 3. Retrieval-mode parity

Forge’s practical usefulness comes from more than dense similarity.

Equivalent Daedalus behavior must include:
- semantic retrieval
- lexical retrieval
- result fusion/reranking
- filtering/scoping controls where behaviorally important

### 4. Result-contract parity

Forge-style semantic search is useful because the output is directly actionable.

Equivalent Daedalus behavior must include:
- path
- chunk content/snippet
- start/end line
- score/relevance metadata
- enough structured detail for follow-up `read`/`fs_search` calls and agent reasoning

### 5. Tool-doctrine parity

Forge’s utility comes partly from how agents are taught to use `sem_search`.

Equivalent Daedalus behavior must include prompt guidance such as:
- use `sem_search` for concept discovery and unfamiliar code exploration
- use exact search after semantic discovery for verification
- do not use `sem_search` as a regex/string-search replacement

### 6. Operational-parity expectations

Forge hides hosted maintenance behind its backend. Daedalus must reproduce equivalent operational guarantees locally.

Equivalent Daedalus behavior must include:
- reliable sync/update model
- index health tracking
- stale detection
- rebuild path when embedding model or schema changes
- retrieval quality that does not silently rot under normal mutation patterns

## Key findings from LanceDB research

### LanceDB OSS is a strong fit for local parity work

The docs position LanceDB OSS as an embedded, in-process retrieval system suitable for local applications.

Important implications:
- local filesystem-backed deployment is first-class
- local/self-hosted retrieval is natural, not a workaround
- LanceDB can act as Daedalus’s semantic workspace engine without requiring a separate remote service

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/quickstart.mdx`
- `/home/likas/temp/lancedb-docs/docs/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/storage/index.mdx`

### LanceDB expects the application to own chunking

LanceDB stores/searches rows. It does not define your code chunking strategy for you.

Implication:
- Daedalus must own semantic chunking and line-range preservation
- chunk quality is part of parity work, not an optional enhancement

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/tables/create.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/quickstart.mdx`

### LanceDB supports the retrieval modes needed for parity

LanceDB supports:
- vector search
- full-text search
- hybrid search
- filtering
- scalar indexes
- rerankers/fusion
- multivector search

Implication:
- the local infrastructure is capable of reproducing Forge-like semantic behavior
- parity does not require inventing custom storage/search primitives from scratch

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/search/*.mdx`
- `/home/likas/temp/lancedb-docs/docs/indexing/*.mdx`
- `/home/likas/temp/lancedb-docs/docs/reranking/*.mdx`

### LanceDB has local reranking paths

Supported local reranking paths include:
- RRFReranker
- MRRReranker
- CrossEncoderReranker
- ColbertReranker
- custom rerankers
- self-hosted Superlinked SIE

Implication:
- local parity with Forge’s useful ranking behavior is achievable
- remote reranker dependency is not required

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/reranking/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/rrf.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/mrr.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/cross_encoder.mdx`
- `/home/likas/temp/lancedb-docs/docs/integrations/reranking/colbert.mdx`

### LanceDB supports local embeddings cleanly

Relevant local embedding options include:
- Ollama
- sentence-transformers
- huggingface
- instructor
- custom embedding functions

Current known local candidate for Daedalus:
- `embeddinggemma` served locally through Ollama

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/integrations/embedding/ollama.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/index.mdx`

### Multivector is a real future parity-quality lever

LanceDB’s multivector documentation suggests that for high-precision localization workloads, better retrieval representation may outperform pooled dense retrieval plus reranking.

Implication:
- multivector support is not mandatory for parity unless Forge’s practical quality cannot be matched with chunked hybrid retrieval plus reranking
- but it must remain in-bounds as a parity-quality lever, not treated as unrelated future research

Relevant docs:
- `/home/likas/temp/lancedb-docs/docs/search/multivector-search.mdx`
- `/home/likas/temp/lancedb-docs/docs/tutorials/search/multivector-needle-in-a-haystack.mdx`

## Chosen architecture

Daedalus should adopt a local LanceDB-backed semantic search stack with these properties.

### 1. Forge-style user-managed lifecycle surface, new backend

Daedalus should not make semantic workspace lifecycle something the model manages through normal tools.

For parity with Forge, semantic workspace lifecycle should be exposed as user-managed lifecycle commands, primarily via slash commands, with the model only consuming the resulting readiness state.

Required lifecycle command surface:
- `/workspace-init`
- `/workspace-sync`
- `/workspace-status`
- `/workspace-info`

Aliases may exist for ergonomics, but the primary design should match Forge’s lifecycle-command model.

The backend underneath these commands should still be local and LanceDB-backed, but the lifecycle should be user-managed rather than model-managed.

`sem_search` remains a model-callable discovery tool, but the lifecycle operations should not be the primary semantic-management path for the model.

### 2. Chunk-level local index in LanceDB

The semantic index should be stored in LanceDB as chunk rows, not as one giant JSON document snapshot.

Each chunk row should contain at minimum:
- `chunk_id`
- `file_path`
- `language`
- `content`
- `start_line`
- `end_line`
- `symbol_name` when available
- `symbol_kind` when available
- `content_hash`
- `embedding`
- optional other metadata useful for filtering and scoring

### 3. Local embeddings via Ollama + embeddinggemma

For design and implementation planning, the default reference embedding backend is:
- provider: `ollama`
- model: `embeddinggemma`
- host: local Ollama endpoint

This should remain configurable, but the stack should be planned around this concrete local path.

Important implementation requirement:
- in Daedalus’s TypeScript/Bun stack, Ollama + `embeddinggemma` should be wired into LanceDB as a custom registered embedding function
- that embedding function must implement both source/document embedding and query embedding
- once registered in the LanceDB schema/runtime, LanceDB OSS should automatically embed chunks on insert and automatically embed text queries during search
- manual query embedding should remain available as an escape hatch, but it should not be the default behavior

This preserves the intended LanceDB OSS behavior model inside Daedalus rather than splitting ingest embedding and query embedding into separate default paths.

Relevant LanceDB docs and tests:
- `/home/likas/temp/lancedb-docs/docs/integrations/embedding/ollama.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/index.mdx`
- `/home/likas/temp/lancedb-docs/docs/embedding/quickstart.mdx`
- `/home/likas/temp/lancedb-docs/tests/ts/custom_embedding_function.test.ts`
- `/home/likas/temp/lancedb-docs/tests/ts/embedding.test.ts`

### 4. Hybrid retrieval by default with Forge-style query schema

To achieve Forge-like behavior in practical code search, Daedalus should use:
- vector retrieval over chunk embeddings
- FTS retrieval over chunk text
- fusion/reranking over both candidate sets
- the same richer query schema shape Forge uses for semantic discovery

Required query model direction:
- support multi-query requests natively
- support per-query objects that separate:
  - `query`
  - `use_case`

Dense-only retrieval is not sufficient as the default parity target for code search, and string-only query envelopes are not sufficient as the final parity target.

### 5. Local reranking/fusion as part of the default stack

For parity, Daedalus must have a reranking/fusion layer in the default retrieval behavior.

At minimum, this should be one of:
- RRFReranker
- MRRReranker

If evaluation shows that this still falls short of Forge-like usefulness, the stack must support local heavier rerankers such as:
- CrossEncoderReranker
- ColbertReranker

The key requirement is not “lightweight v1 first.”
The requirement is: the shipped stack must match Forge-like behavior. The final reranking layer chosen should be whatever is necessary to achieve that parity.

### 6. Result contract must become chunk-oriented and line-aware

`sem_search` output must stop being file-ranked heuristic output and become chunk-ranked retrieval output.

Each result should include at minimum:
- file path
- line range
- snippet/content
- score/relevance metadata
- enough structured detail for downstream reasoning and exact verification

### 7. Strict readiness/staleness enforcement

`sem_search` should fail clearly when:
- workspace is uninitialized
- workspace is unsynced
- workspace index is stale
- embedding model config no longer matches indexed data
- schema/chunking/index version drift invalidates the index

This is part of parity, not an optional hardening pass.

## Semantic workspace metadata design

Daedalus should keep a small operational metadata file under `.daedalus/`.

This metadata should track:
- workspace root
- semantic stack version
- chunking strategy version
- embedding provider id
- embedding model name
- embedding host/endpoint
- vector dimensionality
- FTS/vector index presence and version
- initialized state
- indexed state
- indexed_at
- current workspace fingerprint
- chunk count
- LanceDB table location(s)
- health/status fields needed for `sem_workspace_status` and `sem_workspace_info`

Important rule:
- metadata file stays small and operational
- full semantic corpus lives in LanceDB, not in JSON metadata

## Chunking requirements

Chunking is core parity work.

The chunker must support:
- line-range fidelity
- stable chunk ids across syncs when possible
- sensible code retrieval units
- compatibility with hybrid retrieval

The chunking strategy should be code-aware, not arbitrary text slicing wherever practical.

Preferred direction:
- symbol-aware chunking where feasible
- bounded fallback chunking where symbol extraction is unavailable
- controlled overlap when necessary
- preserved start/end line metadata always

## Indexing requirements

The local stack must include all indexes required for Forge-like search behavior.

Required indexes:
- vector index on `embedding`
- FTS index on `content`

Likely required scalar indexes:
- `file_path`
- `language`
- any metadata fields frequently used for filtering/scoping

This is not optional if the target is parity with Forge-like usefulness.

## Retrieval pipeline requirements

The parity retrieval pipeline should behave like this:

1. Accept semantic search request
2. Validate workspace readiness/staleness
3. Compute or obtain query embedding using the active embedding backend
4. Run vector retrieval over chunk embeddings
5. Run FTS retrieval over chunk text
6. Fuse/rerank the candidate sets
7. Apply path/glob/other semantic workspace filters where relevant
8. Return chunk-level results with file path, line range, snippet, and scores

This pipeline should be considered the standard `sem_search` behavior, not an optional advanced mode.

## Query contract requirements

Daedalus must support the same richer semantic query contract Forge exposes.

Required contract shape:
- `queries: [{ query, use_case }]`

Additional filtering controls such as path/glob/limit can still exist, but the semantic query envelope itself must preserve the Forge distinction between:
- the retrieval query
- the use-case / reranking intent

Simple shorthand such as `query: string` may still be accepted as a compatibility convenience, but it is not the parity contract.

The parity contract is the richer Forge-style multi-query schema.

## Result contract requirements

The result envelope must be upgraded to match Forge’s richer multi-query structure.

Required behavior:
- preserve per-query grouping
- preserve the original query/use_case pair in the result envelope
- deduplicate overlapping chunk/node hits across queries in a Forge-like way instead of flattening everything immediately into one list
- support richer grouped rendering suitable for agent reasoning and follow-up reads

Within each query result, Daedalus should still return chunk-level hits with at least:
- file path
- line range
- snippet/content
- score/relevance metadata

Suggested structured result direction:
- top-level: `queries: [...]`
- each query result contains:
  - original `query`
  - original `use_case`
  - grouped results
- rendering can then group by file and line-sorted chunks, like Forge’s query-oriented output

User-visible output may still be concise, but the underlying envelope should be richer and more structured in the Forge style.

## Prompt and doctrine requirements

For parity, Daedalus prompt doctrine must stay aligned with actual semantic-tool availability at runtime.

Required behavior:
- when semantic search is unavailable for the current workspace, the prompt/tool context should not present `sem_search` as if it were usable
- when semantic search is available, the prompt should teach agents to use it the same way Forge teaches semantic discovery
- lifecycle management should be exposed to the user through slash commands and related runtime commands, not delegated to the model as a normal semantic-management workflow

Prompt doctrine should clearly say:
- use `sem_search` for discovery by meaning
- use `sem_search` to explore unfamiliar codebases and concepts
- use exact search after semantic discovery to verify specific strings or lines
- prefer `sem_search` over exact search when wording may vary but meaning matters
- do not use `sem_search` as a replacement for regex/exact search where exactness is the goal

This doctrine should apply to:
- Daedalus main prompt guidance
- Sage-style research guidance
- Muse-style planning guidance
- worker guidance where semantic discovery is relevant

## Operational requirements

### Sync behavior

`sem_workspace_sync` must:
1. scan files using ignore rules
2. chunk files
3. compute embeddings for chunks using the configured backend
4. write/update chunk rows in LanceDB
5. create or refresh vector and FTS indexes
6. update semantic workspace metadata
7. mark the workspace ready when successful

### Staleness behavior

Staleness must be triggered by:
- file additions/removals
- file content changes
- embedding backend/model changes
- chunking strategy version changes
- schema/index version changes
- metadata corruption/inconsistency

### Rebuild behavior

The stack must support a clear rebuild path when the current index is invalid.

That rebuild path should be triggered or recommended when:
- embedding dimensions/model no longer match
- chunk schema changes
- vector/FTS index state is incompatible
- index health degrades or becomes unreadable

### Maintenance behavior

Because LanceDB is local and embedded, Daedalus must own maintenance behavior that a hosted system would otherwise hide.

The design must include:
- compaction/optimize strategy
- index health visibility
- full rebuild path
- guidance around mutation-heavy workloads and stale index state

## Reranker requirements in parity terms

This is the most important interpretation rule in the spec.

The question is not:
- “what is the smallest reranker we can get away with first?”

The question is:
- “what reranking/fusion behavior is required for Daedalus to match Forge’s practical semantic-search behavior?”

Therefore:
- if hybrid + RRF achieves parity, use that
- if parity requires a local cross-encoder, include one
- if parity requires a ColBERT-style reranker, include one
- if parity is better achieved by changing retrieval representation rather than adding a post-retrieval reranker, do that instead

The spec does not grant permission to ship a reduced parity target.

## Embedding requirements in parity terms

Current default reference embedding backend:
- Ollama + `embeddinggemma`

Parity requirement:
- ingestion embeddings and query embeddings must use a consistent configured backend
- in the default Daedalus TS/Bun implementation, that backend should be exposed to LanceDB as a custom registered embedding function
- that embedding function must support both source embeddings and query embeddings so LanceDB OSS can automatically embed chunks on insert and automatically embed text queries on search
- the backend identity must be recorded in semantic workspace metadata
- changing it must invalidate readiness until the workspace is rebuilt or resynced appropriately

The stack must treat embedding configuration as part of semantic workspace identity.

Manual query embedding may still exist for lower-level or debugging paths, but it should not be the default parity path.

## What must exist for parity to be considered achieved

Daedalus should only be considered behaviorally at parity with Forge semantic search when all of the following are true:

1. semantic workspace lifecycle is exposed to the user through Forge-style runtime commands (slash/CLI/shell-style surfaces), not primarily as model-managed semantic lifecycle tools
2. `sem_search` is only exposed to the model when the current workspace is actually ready/indexed for semantic retrieval
3. prompt/tool guidance changes based on semantic-tool availability so the prompt does not advertise unavailable semantic behavior
4. `sem_search` accepts the richer Forge-style query schema with per-query `query` and `use_case`
5. multi-query search is first-class
6. cross-query deduplication is implemented in a Forge-like way
7. result envelopes preserve per-query grouping and richer structured output, not just one flattened ranked list
8. `sem_search` retrieves chunk rows, not just ranked files
9. result payloads include path, line range, snippet, and scores
10. retrieval combines semantic and lexical discovery in a Forge-like way
11. reranking/fusion is present and materially useful
12. readiness/staleness failures are clear and enforced
13. prompt doctrine causes agents to use the tool in the same situations Forge would
14. practical code-discovery outcomes are comparable on real tasks

## Explicit recommendation to implementation work

Do not decompose the parity target into “v1 is smaller than Forge” unless the user explicitly authorizes deferral.

The implementation should be planned against the full parity target from the start.

The only acceptable simplifications are those that preserve behavioral parity while changing infrastructure shape from:
- hosted/remote Forge backend

to:
- local/self-hosted Daedalus backend

## Open questions that remain implementation questions, not scope reductions

1. Exact chunking algorithm and fallback behavior
2. Which metadata fields deserve scalar indexes
3. Whether Forge-like practical quality is matched by hybrid + RRF alone or requires heavier local reranking
4. Whether multivector retrieval is necessary for parity on hard code-localization tasks
5. Whether query/use_case separation must be present immediately to fully match Forge behavior
6. Whether embedding computation should live directly in-process, through a local sidecar, or through direct Ollama calls from the Daedalus runtime

These are implementation decisions inside the parity target, not excuses to reduce the target.

## Final recommendation

Daedalus should implement a fully local semantic search stack that preserves its existing lifecycle UX but replaces the current heuristic core with:

- chunked code indexing
- LanceDB local tables
- Ollama-hosted `embeddinggemma` embeddings
- FTS + vector search
- hybrid retrieval by default
- whatever local fusion/reranking behavior is necessary to match Forge’s practical search quality
- strict readiness/staleness enforcement
- chunk-level, line-aware results
- prompt doctrine aligned with semantic discovery first, exact verification second

That is the correct parity target for “Forge-like semantic search behavior inside Daedalus’s system.”
