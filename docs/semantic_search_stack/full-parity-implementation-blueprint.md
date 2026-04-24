# Daedalus Semantic Search Full-Parity Implementation Blueprint

Date: 2026-04-22
Status: implementation blueprint
Parity target: full behavioral parity with Forge semantic search within Daedalus’s local architecture
Workspace target: `/home/likas/Research/Daedalus`
Primary code target: `/home/likas/Research/Daedalus/packages/coding-agent`

## Goal

Implement a fully local semantic search stack in Daedalus that reproduces Forge’s practical semantic-search behavior while remaining native to Daedalus.

That means the finished system must deliver, in one coherent implementation:
- lifecycle-gated semantic workspaces
- local chunk indexing
- local embeddings via Ollama + `embeddinggemma`
- lexical + semantic retrieval
- reranking/fusion behavior sufficient for Forge-like results
- line-aware chunk outputs
- strict stale/readiness behavior
- prompt/tool doctrine aligned with Forge-style semantic discovery

## Non-negotiable parity requirements

The implementation is not complete unless all of the following are true:

1. `sem_workspace_init`, `sem_workspace_sync`, `sem_workspace_status`, and `sem_workspace_info` govern a real local semantic workspace lifecycle.
2. `sem_search` retrieves chunk results, not ranked whole-file heuristics.
3. `sem_search` combines semantic and lexical retrieval in one search behavior.
4. `sem_search` returns file path, line range, snippet/content, and score metadata.
5. readiness and staleness failures are explicit and enforced.
6. embedding configuration is part of workspace identity.
7. prompt guidance teaches agents to use `sem_search` the same way Forge uses semantic discovery.
8. test coverage verifies the above end to end.

## Existing Daedalus seams to replace or extend

### Current semantic tool implementation

Current files:
- `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`

Current behavior:
- semantic workspace stored in `.daedalus/semantic-workspace.json`
- stores full documents in JSON
- `sem_search` tokenizes strings and heuristically scores files and lines
- result shape is file-level ranking with one best snippet

This is the primary implementation seam to replace.

### Tool registration and extension seam

Relevant runtime seam:
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/extensions/daedalus/bundle.ts`

The extension system already supports registering tools cleanly. No redesign of ExtensionAPI is required.

### Current tests to replace/expand

Relevant tests:
- `packages/coding-agent/test/search-redesign-tools.test.ts`
- `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
- `packages/coding-agent/test/role-aware-performance-tuning.test.ts`
- `packages/coding-agent/test/primary-role-mode.test.ts`

These give the immediate baseline for migration and expansion.

## Required new subsystems

The full-parity implementation requires seven concrete subsystems.

### Subsystem 1: semantic workspace metadata layer

Purpose:
- replace the current JSON-corpus model with small operational metadata
- keep Daedalus lifecycle UX intact

Recommended file shape:
- modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- optionally create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-metadata.ts`

New metadata responsibilities:
- workspace root
- semantic stack version
- initializedAt
- indexedAt
- state kind (`uninitialized` / `initialized` / `ready` / `stale`)
- workspace fingerprint
- chunking strategy version
- embedding provider (`ollama`)
- embedding model (`embeddinggemma`)
- embedding host
- vector dimension
- LanceDB directory/table path
- chunk count
- FTS/vector index health/presence
- rebuild requirements / stale reason

Important rule:
- `.daedalus/semantic-workspace.json` should become metadata only
- chunk contents and vectors move to LanceDB

### Subsystem 2: code chunking pipeline

Purpose:
- define the retrieval unit Forge-like behavior requires

Recommended files:
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-chunking.ts`
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`

Core interfaces to define:
- `SemanticChunk`
- `SemanticChunkingConfig`
- `SemanticChunkingResult`

Recommended chunk schema:
- `chunkId: string`
- `filePath: string`
- `language: string | undefined`
- `content: string`
- `startLine: number`
- `endLine: number`
- `symbolName?: string`
- `symbolKind?: string`
- `contentHash: string`

Behavioral requirements:
- stable line ranges
- bounded chunk size
- coherent code-unit preference where possible
- deterministic chunk ids when content/ranges are unchanged

If symbol-aware chunking is not immediately feasible, bounded line/token chunks with overlap are acceptable only if they still preserve parity-quality retrieval.

### Subsystem 3: embedding backend adapter

Purpose:
- isolate Ollama + `embeddinggemma` calls behind a Daedalus-native interface

Recommended files:
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-embedder.ts`
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`

Core interface:
- `SemanticEmbedder`
  - `embedDocuments(texts: string[]): Promise<number[][]>`
  - `embedQuery(text: string): Promise<number[]>`
  - `getModelInfo(): Promise<{ provider: string; model: string; dimension: number; host: string }>`

Default implementation:
- `OllamaSemanticEmbedder`
- provider: `ollama`
- model: `embeddinggemma`
- host: configurable, default local Ollama host

Behavioral requirements:
- embedding config must be discoverable and recorded in workspace metadata
- query embeddings and document embeddings must come from the same configured embedding backend
- embedding errors must produce actionable status messages
- this adapter is the low-level Ollama caller and source of truth for embedding behavior
- the LanceDB integration layer should use it to back a custom registered TypeScript embedding function so that Lance can auto-embed both inserts and text queries by default

### Subsystem 4: LanceDB repository layer

Purpose:
- isolate all LanceDB reads/writes/search/index operations from tool code
- own local database bootstrap so the semantic store is actually brought up and usable inside each workspace

Recommended files:
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`

Core responsibilities:
- initialize/open local LanceDB workspace
- bootstrap the local semantic database on disk when the workspace is initialized
- verify the database directory, table existence, and schema compatibility on open
- upsert chunk rows
- rebuild chunk table
- create vector index
- create FTS index
- expose vector search
- expose FTS search
- expose hybrid retrieval support
- report index stats/health
- support optimize/rebuild paths

Recommended local storage layout:
- `.daedalus/semantic-store/` or similar directory under workspace config dir
- metadata JSON remains at `.daedalus/semantic-workspace.json`

Important implementation note:
- this is an embedded local database, not a separate server process
- “get the local database running” in Daedalus means creating/opening the LanceDB database directory, creating the required tables/indexes, validating schema/version compatibility, and making that store available to lifecycle and search operations
- the workspace should be considered only `initialized` until the database directory exists and metadata is written
- the workspace should be considered only `ready` after the database is openable, the chunk table exists with the expected schema, and sync has built the searchable indexes

Suggested chunk row schema in LanceDB:
- `chunk_id`
- `file_path`
- `language`
- `content`
- `start_line`
- `end_line`
- `symbol_name`
- `symbol_kind`
- `content_hash`
- `embedding`

Indexes required:
- vector index on `embedding`
- FTS index on `content`
- scalar indexes on at least `file_path`, `language`

### Subsystem 5: retrieval and reranking layer

Purpose:
- implement Forge-like search behavior rather than plain dense similarity

Recommended files:
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-retrieval.ts`
- create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-rerank.ts`

Core behavior:
1. receive semantic query request
2. produce query embedding
3. run vector retrieval
4. run FTS retrieval
5. fuse/rerank both result sets
6. apply filters/scopes
7. return chunk results

Recommended default retrieval mode:
- hybrid retrieval

Recommended default fusion/reranker:
- RRF first, unless benchmark evidence shows MRR or heavier local reranker is required for parity

Important parity rule:
- this is not permission to ship dense-only as the default
- hybrid + fusion is part of the required behavior

Suggested interfaces:
- `SemanticSearchRequest`
- `SemanticSearchResult`
- `ChunkSearchHit`
- `SemanticReranker`

Required result fields:
- `filePath`
- `startLine`
- `endLine`
- `snippet`
- `content?`
- `relevanceScore`
- `vectorScore?`
- `ftsScore?`
- `chunkId`

### Subsystem 6: workspace lifecycle operations

Purpose:
- make lifecycle tools drive the real local stack

Primary files:
- modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`

`sem_workspace_init` must:
- create metadata file
- create semantic store directory
- open/bootstrap the local LanceDB database at the configured workspace path
- ensure the semantic chunk table and required bookkeeping structures can be created
- record configured embedding backend identity
- mark state initialized but not indexed

`sem_workspace_sync` must:
- discover candidate files
- apply ignore rules
- chunk files
- embed chunks with Ollama + embeddinggemma
- rebuild or update LanceDB rows
- create/refresh vector and FTS indexes
- recompute fingerprint
- mark workspace ready

`sem_workspace_status` must:
- report initialized/ready/stale state
- report stale reason clearly
- report chunk count and index path/store path
- report embedding backend identity

`sem_workspace_info` must:
- expose richer internals than status
- include model/store/index/version metadata

`requireReadySemanticWorkspace` must block search when:
- uninitialized
- initialized-but-unsynced
- stale
- model mismatch
- index/schema/chunking version mismatch

### Subsystem 7: search tool contract and rendering

Purpose:
- make `sem_search` expose parity-level behavior to users and agents

Primary file:
- modify or fully replace: `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts`

Required contract changes:
- stop reading `state.documents`
- stop scoring files heuristically
- search chunk store instead
- return chunk-level results

Recommended request schema:
- `query?: string`
- `queries?: string[] | { query: string; use_case?: string }[]`
- `path?: string`
- `glob?: string`
- `limit?: number`
- optional retrieval mode if needed internally

Behavioral requirements:
- query shorthand still supported
- multiple queries supported
- path scoping supported
- glob filtering supported
- details payload rich enough for downstream agent reasoning

Text output should look more like:
- `1. src/foo.ts:120-148 [score=…]`
- snippet/content excerpt

rather than whole-file rankings.

## Additional required integration points

### Prompt guidance and tool doctrine

Relevant prompt/doc surfaces must be updated so agents use the new stack correctly.

Likely targets:
- bundled role prompts or prompt resources that mention `sem_search`
- any search-tool doctrine docs already under `docs/Forge-Daedalus port/...`
- role-aware test fixtures that assert allowed tools and behavior

Required doctrine:
- use `sem_search` for discovery by meaning
- use `fs_search` for exact strings/regex/symbol verification
- use `read` after `sem_search` to inspect exact code in context
- check workspace status/init/sync before relying on semantic retrieval

### Role/tool-policy integration

Current tests show allowed-tool expectations for roles like Sage and Muse.

Relevant tests:
- `packages/coding-agent/test/role-aware-performance-tuning.test.ts`
- `packages/coding-agent/test/primary-role-mode.test.ts`

These may not need semantic changes in tool names, but they should remain green and may need expanded behavioral coverage if role doctrine changes.

## Concrete file plan

### Files to modify

1. `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts`
   - replace heuristic file scorer with retrieval pipeline
   - update params/details/result rendering

2. `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
   - replace JSON document corpus state with metadata-only lifecycle state
   - integrate fingerprint/model/index-version state
   - wire readiness checks to real local store

3. `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
   - update init/sync/status/info to operate on real local stack

4. `packages/coding-agent/test/search-redesign-tools.test.ts`
   - replace old file-ranking expectations with chunk-result expectations

5. `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
   - update lifecycle assertions for metadata/store/index/model-backed readiness

6. `packages/coding-agent/src/extensions/daedalus/bundle.ts`
   - only if new helper modules need explicit registration or load-order changes

### Files to create

1. `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
2. `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`
3. `packages/coding-agent/src/extensions/daedalus/tools/semantic-chunking.ts`
4. `packages/coding-agent/src/extensions/daedalus/tools/semantic-embedder.ts`
5. `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
6. `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
7. `packages/coding-agent/src/extensions/daedalus/tools/semantic-retrieval.ts`
8. `packages/coding-agent/src/extensions/daedalus/tools/semantic-rerank.ts`

### Tests to create

1. `packages/coding-agent/test/semantic-search-hybrid.test.ts`
   - verify hybrid retrieval beats or at least includes lexical and semantic hits correctly

2. `packages/coding-agent/test/semantic-search-result-shape.test.ts`
   - verify path/line-range/snippet/score result contract

3. `packages/coding-agent/test/semantic-search-model-config.test.ts`
   - verify embedding backend identity is recorded and mismatches mark workspace stale

4. `packages/coding-agent/test/semantic-search-rebuild.test.ts`
   - verify rebuild/resync behavior after chunking/model/schema changes

Potentially:
5. `packages/coding-agent/test/semantic-search-query-modes.test.ts`
   - verify multi-query, path scoping, glob filtering

## Required implementation order

This is the order to build in, but all steps are part of the full parity target.

### Step 1: define semantic types and metadata contract

Create:
- `semantic-types.ts`
- `semantic-config.ts`

Define:
- chunk row types
- metadata state types
- search request/result types
- embedder/store interfaces

### Step 2: implement chunker

Create:
- `semantic-chunking.ts`

Deliverable:
- deterministic chunk extraction from candidate files with line ranges and metadata

### Step 3: implement Ollama embedder adapter

Create:
- `semantic-embedder.ts`

Deliverable:
- embed documents
- embed queries
- discover/store embedding backend identity including dimension
- define the raw Ollama + `embeddinggemma` calling layer that the LanceDB embedding integration will use

### Step 4: implement LanceDB store adapter and register the embedding function

Create:
- `semantic-store.ts`
- `semantic-lancedb.ts`

Deliverable:
- local store initialization
- registration of a custom LanceDB TypeScript embedding function backed by Ollama + `embeddinggemma`
- automatic source embedding on chunk insert
- automatic query embedding on text search
- chunk row writes
- vector index creation
- FTS index creation
- vector retrieval
- FTS retrieval
- metadata for store/index health

### Step 5: implement retrieval + fusion/reranking

Create:
- `semantic-retrieval.ts`
- `semantic-rerank.ts`

Deliverable:
- hybrid retrieval pipeline
- RRF/MRR fusion support
- chunk-level scored hits

### Step 6: replace lifecycle backend

Modify:
- `semantic-workspace.ts`
- `semantic-workspace-tools.ts`

Deliverable:
- init/sync/status/info over the real local stack
- readiness/stale enforcement using metadata + store/index state

### Step 7: replace sem_search tool implementation

Modify:
- `sem-search.ts`

Deliverable:
- chunk-level hybrid search behavior
- updated rendering/details payload
- path/glob/multi-query support

### Step 8: update tests to enforce parity-level behavior

Modify and add tests listed above.

Deliverable:
- lifecycle tests
- result-shape tests
- hybrid retrieval tests
- stale/model mismatch tests

### Step 9: update prompt/tool doctrine

Deliverable:
- guidance that makes agents use semantic search correctly and consistently

## Acceptance criteria

The implementation is complete only when all of the following are true:

1. Initializing then syncing a workspace creates a real local semantic index backed by LanceDB.
2. Workspace initialization also boots the local LanceDB database directory and verifies the expected table/schema can be opened.
3. The workspace records Ollama + `embeddinggemma` as semantic workspace identity data.
4. File changes, model changes, or chunking/index/schema version changes can mark the workspace stale.
5. `sem_search` returns chunk-level hits with path, line ranges, snippet/content, and scores.
6. `sem_search` combines vector and lexical retrieval in one default behavior.
7. Path scoping and glob filters still work.
8. Failure modes for uninitialized/unsynced/stale workspaces are explicit and actionable.
9. Tests cover the above.
10. The tool is useful in the same situations where Forge semantic search is useful.

## Verification checklist

After implementation, verify with:

- lifecycle tests:
  - uninitialized blocks search
  - initialized-but-unsynced blocks search
  - synced becomes ready
  - content change marks stale
  - model/config drift marks stale

- retrieval behavior tests:
  - semantic query finds semantically relevant chunk
  - lexical-heavy query still benefits from FTS/hybrid behavior
  - results are chunk-level and line-aware
  - multi-query behavior works

- practical manual checks in a real repo:
  - auth flow / retry logic / workspace lifecycle / provider implementation style queries
  - compare usefulness to current Forge behavior qualitatively

## Notes on infrastructure decisions

This blueprint intentionally stays inside Daedalus’s local architecture.

It does not require:
- a hosted backend
- Forge’s gRPC protocol
- Forge’s auth/account model

But it does require reproducing the behaviorally essential search stack Forge offers.

That means if any part of the local implementation fails to produce equivalent behavior, that part must be strengthened until it does — whether that means better chunking, better retrieval fusion, heavier local rerankers, or eventually multivector support.
