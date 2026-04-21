# Deep Dive: Semantic Workspace Lifecycle

Status: deep-dive draft
Priority: Very High

## Why this matters

Semantic search quality depends on more than the search API.
If indexing is stale, partial, or invisible to the user/agent, then semantic search becomes unreliable.
A semantic tool without lifecycle support often underperforms in real tasks.

## Forge mechanism

Forge treats semantic search as a workspace system, not just a tool:
- workspace init
- workspace sync
- workspace status
- workspace info
- indexed workspace abstraction

Key references:
- `harnesses/forgecode/README.md`
- `harnesses/forgecode/crates/forge_app/src/services.rs`

Observed capabilities:
- explicit workspace indexing lifecycle
- status visibility
- sync/update support
- query_workspace abstraction
- indexed-workspace awareness

## Why it likely improves performance

This affects performance because it improves:
- trust in retrieval quality
- freshness of semantic results
- reduced search confusion
- reduced wasted turns due to stale discovery
- ability for the agent to know whether semantic search is ready to use

## Current Daedalus state

Daedalus is planning to port `sem_search` and consolidate exact search into `fs_search`, but the surrounding semantic lifecycle is not yet equally explicit in the design set.

Relevant docs:
- `tooling-port/search-tooling-port/tooling-port-strategy.md`
- `tooling-port/forge-daedalus-tooling-comparison.md`

## Port thesis

Do not port `sem_search` as a naked tool.
Port a semantic workspace system with:
- indexing lifecycle
- readiness state
- sync/update behavior
- health/status visibility

## Recommended Daedalus design

### Minimum viable lifecycle
1. workspace init
2. workspace sync / re-sync
3. workspace status
4. workspace info / readiness
5. semantic query execution

### Agent-facing implications
- Daedalus should know when semantic search is available and trustworthy
- Sage should strongly prefer semantic search when indexed
- Muse should use semantic search confidently only when workspace state is ready
- Worker should use semantic search sparingly, but can rely on it when workspace readiness is known

## Design questions

1. Should semantic indexing be project-local only, or support global/shared caches?
2. What invalidates an index?
3. How visible should workspace status be to the prompt vs UI vs tooling layer?
4. Should semantic search fail closed when workspace is stale/unindexed, or fall back automatically?
5. Should Daedalus trigger indexing proactively when entering a large unfamiliar repo?

## Recommended implementation phases

### Phase 1
- define workspace lifecycle surfaces
- implement status/readiness state
- make `sem_search` aware of index readiness

### Phase 2
- add sync/re-sync behavior
- add richer role-aware prompt guidance

### Phase 3
- optimize lifecycle for large repos and refresh heuristics

## Success criteria

- semantic search becomes trustworthy, not opportunistic
- Sage/Muse retrieval quality improves materially
- fewer wasted turns due to stale or unavailable semantic results
- `sem_search` is part of a coherent subsystem rather than a standalone feature
