# Hashline Edit

Status: implemented, experimental, opt-in feature.

This document locks the product scope for Hashline edit support in Daedalus before implementation starts. It defines the v1 contract, hard safety rules, explicit non-goals, and rollout boundaries.

## Problem

Daedalus's current `edit` tool is better than most exact-text replacement tools, but it still makes the model reproduce file content it already saw. That causes predictable harness failures:

- stale context after file changes
- ambiguous repeated text
- whitespace and newline mismatch failures
- larger prompts from copying surrounding text
- retries caused by mechanical matching problems rather than reasoning problems

Hashline fixes this by making edits line-addressed and freshness-checked.

## Goals

Hashline v1 must:

- make edits reference exact line anchors instead of reproduced file text
- reject stale references before mutation
- preserve mechanical safety over convenience
- batch multiple edits against one original file snapshot
- preserve existing Daedalus `edit` behavior for backward compatibility while making `hashline_edit` primary default edit tool
- integrate cleanly with current diff rendering, BOM handling, CRLF handling, and file mutation queueing

## Product Decisions

These decisions are locked for v1.

### 1. New tool first

Daedalus will add a new built-in tool named `hashline_edit`.

- Existing `edit` tool remains unchanged and still available.
- `hashline_edit` is enabled in the default coding tool set.
- Exact-text `edit` is no longer in the default coding tool set.

Reason: safe rollout, easy benchmarking, no silent breakage for SDK and extension users.

### 2. `read` gains explicit hashline mode

Hashline editing depends on `read` returning stable anchors.

`read` will gain:

- `format: "plain" | "hashline"`
- default remains `"plain"`

Hashline workflow is:

1. `read({ path, format: "hashline" })`
2. copy exact anchors from latest output
3. call `hashline_edit`
4. if same file needs another edit call, re-read first

### 3. Strict safety over heuristics

Hashline core must be strict.

Allowed:

- copied hashline prefix stripping from replacement content
- conservative diff `+` marker stripping
- clear warnings for likely boundary mistakes

Not allowed in v1:

- fuzzy content matching
- stale-anchor relocation
- legacy hash compatibility mode
- whole-file semantic normalization before edit
- aggressive indentation restoration
- automatic line merge expansion
- silent block-boundary rewrites

Rule: input cleanup at boundary is acceptable; mutation semantics stay strict.

## Public Contract

## Read output format

When `read(..., format: "hashline")` is used, each returned file line is formatted as:

```text
LINE#ID:content
```

Example:

```text
10#VK:function hello() {
11#XJ:  console.log("hi");
12#MB:}
```

Properties:

- `LINE` is 1-indexed file line number
- `ID` is short content hash derived from normalized line text
- anchor format used in tool calls is `"LINE#ID"`
- display suffix `:content` is for human/model reading only, not part of anchor

## `hashline_edit` schema

V1 uses structured location-based edits.

```ts
{
  path: string,
  edits: Array<{
    loc:
      | "append"
      | "prepend"
      | { append: "LINE#ID" }
      | { prepend: "LINE#ID" }
      | { range: { pos: "LINE#ID", end: "LINE#ID" } },
    content: string | string[] | null,
  }>
}
```

Semantics:

- `content: null` deletes targeted range
- `string[]` is preferred for multi-line edits
- `string` is split by real newlines
- all edits in one call target original file snapshot, not result of prior edits in same call

## Supported operations in v1

Supported:

- replace one line via `range.pos === range.end`
- replace inclusive line range via `range`
- delete one line or range via `content: null`
- insert after anchored line via `{ append: "LINE#ID" }`
- insert before anchored line via `{ prepend: "LINE#ID" }`
- insert at end of file via `"append"`
- insert at start of file via `"prepend"`

Not supported in v1:

- move/rename inside `hashline_edit`
- whole-file delete inside `hashline_edit`
- create-missing-file behavior inside `hashline_edit`
- substring replacement modes
- AST-aware editing through hashline tool
- cross-file batch edits in one call

Those remain responsibility of existing tools:

- `write` for create/overwrite
- `edit` for exact-text replacement fallback
- future tools for AST/chunk workflows

## Safety Invariants

These invariants are mandatory.

### Snapshot invariant

All anchors in one `hashline_edit` call are resolved against original file contents read before any mutation in that call.

### Freshness invariant

If any referenced anchor hash does not match current file line content, tool fails before any mutation.

### No guessing invariant

Tool never relocates anchors, never searches for "close enough" text, never substitutes another line because hash or content looks similar.

### Minimal mutation invariant

Tool applies only requested line-range operations. It does not reformat unrelated lines or normalize file-wide content.

### Atomicity invariant

If any edit in batch fails validation, file remains unchanged.

### Ordering invariant

Validated edits apply bottom-up so original anchors remain stable during mutation.

### File-preservation invariant

Tool preserves:

- UTF-8 BOM
- original line ending style (`LF` vs `CRLF`)

## Failure Behavior

Failures must be actionable and non-destructive.

### Stale anchor

If file changed since last read:

- throw mismatch error before mutation
- show nearby context
- mark changed lines with `>>>`
- show updated `LINE#ID` values for retry

### Bad anchor format

If anchor is malformed:

- fail clearly
- do not attempt fallback parsing beyond conservative copied-display cleanup

### Overlapping edits

If two edits overlap:

- fail before mutation
- tell caller to merge them into one edit or target disjoint ranges

### No-op edit

If all edits produce identical content:

- fail with explicit no-op diagnostic
- do not write file

## V1 Non-Goals

These are intentionally out of scope.

- making Hashline default built-in edit path
- replacing existing exact-text `edit`
- automatic migration of old `edit` calls into hashline calls
- hidden compatibility layers for legacy hash algorithms
- heuristic recovery from malformed ranges beyond clear error messages and warnings
- formatter integration specific to hashline tool
- binary file editing
- notebook-specific editing
- chunk-based or AST-based edit addressing
- write-through creation semantics for missing files

## Basic Usage

Agent workflow:

1. call `read({ path, format: "hashline" })`
2. copy exact `LINE#ID` anchors from latest output
3. call `hashline_edit({ path, edits })`
4. if file needs another edit call, read again first

SDK usage is explicit when you pass your own `tools` array. Built-in `codingTools` now includes `hashline_edit` by default.

## Rollout Boundary

V1 ends when all of this is true:

- `read(format: "hashline")` works for text files
- `hashline_edit` works for existing text files
- result includes normal Daedalus diff metadata
- BOM and CRLF are preserved
- stale refs fail hard with actionable mismatch output
- feature is documented and exported for explicit SDK/tool selection
- default built-in coding tool set includes `hashline_edit` instead of `edit`

Changing default tool selection is a later decision, gated on benchmarks and real-task validation.

A small canned benchmark script exists at `scripts/hashline-benchmark.ts` and can be run with:

```bash
bun run benchmark:hashline
```

## Implementation Boundaries

V1 implementation should reuse current Daedalus infrastructure where possible:

- `withFileMutationQueue()` for per-file serialization
- current diff rendering and `firstChangedLine` reporting
- existing BOM and line-ending helpers where appropriate
- built-in tool registration/export patterns already used by `read`, `edit`, and `write`

Hashline core logic should live in dedicated modules, not inside tool wrapper glue.

## Open Questions Deliberately Closed

To avoid scope creep, these questions are closed for v1:

- **Should Hashline replace `edit` now?** No.
- **Should `read` default to hashline when tool is active?** No.
- **Should missing files be creatable through `hashline_edit`?** No.
- **Should tool support rename/delete/move?** No.
- **Should fuzzy or legacy compatibility be added to reduce failures?** No.
- **Should tool auto-fix model formatting mistakes beyond prefix cleanup?** No.

If later evidence says one of these is worth changing, that needs a separate scope decision after benchmark data.
