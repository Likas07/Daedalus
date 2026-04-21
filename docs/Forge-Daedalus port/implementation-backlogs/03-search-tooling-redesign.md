# Milestone 3 — Search Tooling Redesign (`sem_search` + `fs_search`)

Status: backlog draft

## Goal
Introduce a cleaner discovery substrate modeled after Forge's semantic vs exact split.

## Dependencies
- Milestone 0
- strongly benefits from Milestone 1

## Tasks

### M3.1 Implement `fs_search`
Likely files:
- search tool registration and implementation under `packages/coding-agent/src/core/tools/` or `extensions/daedalus/tools/`
- search/prompt snippets and bundle registration

Work:
- regex content search
- path scoping
- glob filtering
- output modes
- context/line number controls
- offset/limit handling

Verification:
- feature parity with documented target behavior
- known `grep` / `find` common use cases are covered

### M3.2 Implement `sem_search`
Likely files:
- new semantic search tool implementation
- provider/service interface for semantic retrieval
- prompt snippets / tool definitions

Work:
- define multi-query or at least future-extensible query schema
- implement semantic retrieval path
- return role-usable results for Sage/Muse/Daedalus

Verification:
- semantic discovery works in unfamiliar codebase tasks
- search results are meaningfully different from exact grep-only behavior

### M3.3 Update prompt/tool doctrine
Likely files:
- prompt docs
- system prompt generation files
- role prompt docs if mirrored in code later

Work:
- teach semantic discovery vs exact search split
- reduce fragmented old search doctrine

Verification:
- prompts consistently recommend `sem_search` vs `fs_search` appropriately

### M3.4 Soft-deprecate overlapping legacy search tools in prompts
Likely files:
- prompt generation
- role docs
- maybe bundle defaults

Work:
- stop teaching `grep` / `find` / `ls` as first-line discovery tools where `fs_search` / `sem_search` supersede them
- keep tools alive until parity is proven

Verification:
- search behavior in prompts is simpler and more consistent

### M3.5 Add search test suite
Tests:
- exact content search
- file listing mode
- count mode
- context/offset/limit behavior
- semantic search baseline behavior
- malformed search inputs

## Completion criteria
- `sem_search` and `fs_search` exist and are usable
- role docs can rely on them
- search fragmentation starts shrinking without risky hard removals
