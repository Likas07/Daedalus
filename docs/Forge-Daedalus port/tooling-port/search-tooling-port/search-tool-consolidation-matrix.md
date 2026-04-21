# Search Tool Consolidation Matrix

Status: working draft

## Purpose

Track which current Daedalus search/discovery capabilities are replaced, retained, or re-scoped once `sem_search` and `fs_search` are introduced.

## Matrix

| Current Daedalus tool/capability | Proposed owner | Status | Notes |
|---|---|---|---|
| grep | fs_search | candidate for deactivation | Exact/pattern content search should move here if parity is complete |
| find | fs_search | candidate for deactivation | Common file discovery can likely be consolidated |
| ls | fs_search or retain | undecided | Keep if it remains ergonomically better for lightweight listing or UI flows |
| read | read | retain | Reading file contents is not replaced by fs_search |
| shell-based ripgrep habits | fs_search | candidate for de-emphasis | Tool prompts should stop encouraging shell search when fs_search is available |
| semantic discovery by manual grep/read loops | sem_search | replace behaviorally | This is the real workflow upgrade |

## Role impact

### Daedalus
- should prefer `sem_search` for grounded discovery in ambiguous codebase work
- should prefer `fs_search` for exact known-pattern lookup

### Sage
- highest-value consumer of `sem_search`
- secondary consumer of `fs_search` for exact evidence gathering

### Muse
- should use `sem_search` to clarify architecture and implementation surfaces
- should use `fs_search` when planning depends on exact file/string evidence

### Worker
- should mostly use `fs_search` and `read`
- may use `sem_search` only if scoped discovery is necessary for assigned work

## Deactivation policy draft

Use a phased policy:
1. Introduce `sem_search` and `fs_search`
2. Update prompts and tool guidance
3. Observe whether legacy search tools are still needed
4. Soft-deprecate overlapping tools
5. Hard-deactivate only after parity + regression checks
