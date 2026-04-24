# Semantic Search Stack

Status: research-backed design notes
Scope: full Forge-parity semantic retrieval behavior implemented locally within Daedalus
Primary reference basis:
- LanceDB docs checkout at `/home/likas/temp/lancedb-docs`
- Forge semantic search behavior and live service probing

## Contents

- `lancedb-local-semantic-stack-spec.md` — comprehensive spec for a LanceDB-backed local semantic search stack in Daedalus, written against a full Forge-parity target, including lifecycle behavior, indexing model, hybrid retrieval, reranking requirements, and result-contract expectations
- `full-parity-implementation-blueprint.md` — concrete implementation blueprint with exact Daedalus subsystems, file seams, required new modules, test plan, and acceptance criteria for achieving full Forge-parity behavior locally
- `forge-daedalus-semantic-parity-gap-checklist.md` — corrective checklist of the remaining behavior/runtime gaps between Forge and the current Daedalus implementation after the working local stack landed

## Intent

This directory records the current design position for replacing Daedalus's heuristic `sem_search` implementation with a proper local semantic retrieval stack.

The current recommendation direction is:
- keep Daedalus's semantic workspace lifecycle surface,
- replace JSON-document scoring with chunked local embeddings,
- use LanceDB OSS as the embedded retrieval/index layer,
- use local Ollama-hosted embeddings as the initial concrete embedding path,
- start with `embeddinggemma` as the default reference embedding model,
- reproduce Forge’s behaviorally essential semantic-search system locally,
- include hybrid retrieval and whatever reranking/fusion behavior is required for parity,
- preserve room for multivector/late-interaction retrieval if parity-quality demands it.

## Parity rule

In this directory, “same behavior as Forge” means full behavioral parity as the target.
It does not mean a reduced first slice with core behavior deferred unless the user explicitly allows that deferral.


## Freshness policy

Daedalus distinguishes between two stale semantic workspace states:

- `stale_soft`: the index is usable for `sem_search`, but local workspace contents have drifted since the last sync
- `stale_hard`: the index is structurally invalid or missing and must be refreshed before `sem_search` can run

Background sync is runtime-managed for already-indexed workspaces:
- once on session start
- then at most once every 20 minutes after prompt completion

This keeps semantic discovery available during ordinary editing while still refreshing the index opportunistically.