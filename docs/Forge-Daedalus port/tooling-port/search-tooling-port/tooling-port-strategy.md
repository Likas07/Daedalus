# Tooling Port Strategy: Forge -> Daedalus

Status: planning draft
Scope: search and edit tooling port design only; no implementation changes yet
Workspace target: `/home/likas/Research/Daedalus`

## Goal

Port two high-value Forge search capabilities into Daedalus:
- `sem_search` with full semantic-search capability
- `fs_search` as the consolidated filesystem/content search surface

Then evaluate existing Daedalus search tools for deactivation if `fs_search` fully subsumes their practical role.

## Current Intent

The intended design direction is:
- `sem_search` becomes the highest-capability discovery tool for code understanding
- `fs_search` becomes the main text/filesystem search tool for exact matching and file discovery
- overlapping legacy tools can be de-emphasized or deactivated once parity is confirmed

## Forge capabilities to port

### 1. sem_search
Forge semantic search supports a richer query model than a simple single-string embedding lookup.
Key observed capability areas:
- multiple search queries in one request
- per-query `query` and `use_case`
- reranking-oriented intent modeling
- better support for discovery in unfamiliar codebases
- planner/research friendliness

Reference:
- `harnesses/forgecode/crates/forge_domain/src/tools/catalog.rs`

### 2. fs_search
Forge filesystem search acts as a unified search surface for content and file-level filtering.
Observed capability areas:
- regex content search
- path scoping
- glob filtering
- multiple output modes
- before/after/context control
- line numbers
- case sensitivity
- file type filtering
- offset/head limits
- multiline mode

Reference:
- `harnesses/forgecode/crates/forge_domain/src/tools/catalog.rs`

## Desired Daedalus target state

### sem_search target
Daedalus `sem_search` should support the full intended semantic-discovery workflow, not a reduced toy version.

Desired capabilities:
- multiple queries per request
- a query schema rich enough to separate:
  - semantic intent
  - user/use-case intent
- ranking/reranking support
- codebase-scoped search
- results suitable for Sage, Muse, Daedalus, and Worker
- prompt guidance that makes it the default discovery tool when semantic discovery is the right choice

Primary consumers:
- Sage: first-class
- Muse: first-class
- Daedalus main agent: high-value
- Worker: optional / situational

### fs_search target
Daedalus `fs_search` should become the unified exact-search / filesystem-search tool.

Desired capabilities:
- regex content search
- file path scoping
- glob filtering
- output modes for content/files/count
- context options
- line number support
- case sensitivity control
- file type filtering where practical
- offset / result limit support
- multiline mode if feasible
- strong prompt-level guidance for when to use `fs_search` instead of `sem_search`

Primary consumers:
- all agents and main Daedalus persona

## Tool positioning doctrine

### sem_search vs fs_search
Use `sem_search` when:
- discovering implementations by meaning
- exploring unfamiliar code
- tracing architectural concepts
- searching for patterns whose wording may vary
- helping Sage or Muse understand what exists before planning

Use `fs_search` when:
- searching exact strings or regexes
- locating known names, symbols, comments, TODOs, or config keys
- filtering specific file sets by glob/path/type
- counting or listing matches
- working from known text patterns rather than semantic intent

## Existing Daedalus search/tooling overlap to review

Potentially overlapping tools / capabilities in current Daedalus:
- `grep`
- `find`
- `ls`
- `read`
- truncated ripgrep wrapper behavior
- possibly some shell-based fallback search patterns in prompts or extensions

Important note:
- `read` should remain; it is not replaced by `fs_search`
- `write` and edit tools are out of scope for deactivation here

## Deactivation rule for legacy search tools

A legacy search tool should only be deactivated if all of the following are true:
1. `fs_search` covers its practical capability fully enough for agents
2. prompt guidance has been updated so the model no longer depends on the legacy tool name
3. UI / slash-command / extension flows are not depending on the old tool directly
4. migration impact on existing prompts and subagent policies has been reviewed
5. benchmark and workflow regressions are checked after the switch

## Preliminary recommendation

### Likely keep
- `read`
- semantic search as a separate tool (`sem_search`)

### Likely consolidate into fs_search
- `grep`
- `find` (at least for common file-discovery use cases)
- some `ls`-style discovery behavior if `fs_search` supports files-only listing well enough

### Likely keep for now pending validation
- `ls` if it still serves UI or shell-adjacent lightweight directory listing use cases better than `fs_search`

## Editing-tool note

The current focus here is search tooling, not edit tooling.
However, one relevant finding should be recorded:
- Daedalus `hashline_edit` already supports multiple edits in one call via an `edits` array
- so a Forge-style `multi_patch` is not required to get single-file multi-edit support

Reference:
- `Daedalus/packages/coding-agent/src/core/tools/hashline-edit.ts`

## Recommended execution order

### Phase 1: design
- define Daedalus `sem_search` request/response schema
- define Daedalus `fs_search` request/response schema
- map each existing search tool capability against `fs_search`
- decide explicit keep/deprecate/deactivate status for each legacy tool

### Phase 2: prompt / role integration
- update Daedalus main prompt guidance
- update Sage prompt guidance
- update Muse prompt guidance
- update Worker prompt guidance where needed
- define default-tool doctrine:
  - semantic discovery -> `sem_search`
  - exact/pattern search -> `fs_search`

### Phase 3: implementation
- add `sem_search`
- add `fs_search`
- wire them into tool registry and prompt snippets
- add tests for query behavior, output modes, error cases, and fallback cases

### Phase 4: consolidation
- update subagent/tool policies
- de-emphasize or deactivate overlapping legacy search tools once parity is validated
- verify benchmark and workflow impact

## Open design questions

1. Should `fs_search` fully subsume both content search and file discovery, or should `find` remain as a simpler file-only primitive?
2. Should `sem_search` be available to Worker by default, or mainly to Daedalus / Sage / Muse?
3. How much of Forge's semantic query schema should be copied directly versus adapted to Daedalus's tool conventions?
4. Should `ls` remain for ergonomic/UI reasons even if `fs_search` can list files?
5. Should legacy tools be hard-removed, soft-deprecated, or hidden from default prompt surfaces first?

## Success criteria

This port is successful if:
- Daedalus gains Forge-grade semantic discovery
- `fs_search` becomes a single clear exact-search surface
- prompt/tool choice becomes simpler rather than more confusing
- search behavior improves for Sage, Muse, and Daedalus main-agent workflows
- legacy tool deactivation only happens after real capability parity is proven
