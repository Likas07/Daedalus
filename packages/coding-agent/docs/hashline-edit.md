# Hashline Edit

Status: implemented, experimental, default coding edit tool.

`hashline_edit` is Daedalus's stale-safe bulk file mutation tool. It pairs with `read({ path, format: "hashline" })`, which displays each line as `LINE#ID:content`. The `LINE#ID` anchor identifies both the line number and the content hash so stale references fail before mutation.

## Workflow

1. Read each anchored target file with `read({ path, format: "hashline" })`.
2. Copy exact `LINE#ID` anchors from the latest read output.
3. Call `hashline_edit({ edits: [...] })` with one entry per logical mutation.
4. If a file needs another edit after a successful call, re-read that file first.

## Public Schema

`hashline_edit` uses one clean bulk shape. There is no top-level `path`, no `loc`, and no `content` field.

```ts
{
  edits: Array<
    | { path: string, op: "replace", pos: "LINE#ID", end?: "LINE#ID", lines: string | string[] | null }
    | { path: string, op: "append", pos?: "LINE#ID", lines: string | string[] }
    | { path: string, op: "prepend", pos?: "LINE#ID", lines: string | string[] }
    | { path: string, op: "delete" }
    | { path: string, op: "move", to: string }
  >
}
```

## Operation Semantics

- `replace` with `pos` only replaces one line.
- `replace` with `pos` and `end` replaces the inclusive range `pos..end`.
- `replace` with `lines: null` deletes the consumed line/range.
- `append` with `pos` inserts after the anchored line.
- `prepend` with `pos` inserts before the anchored line.
- `append` without `pos` appends at EOF and may create a missing file.
- `prepend` without `pos` prepends at BOF and may create a missing file.
- `delete` removes the file.
- `move` moves/renames the file to `to`.

All edits in one call reference the original file snapshots. Do not adjust line numbers for earlier edits in the same call; Daedalus applies edits bottom-up per file.

## Examples

### Multi-file bulk edit

```ts
await hashline_edit({
  edits: [
    { path: "src/a.ts", op: "replace", pos: "12#VK", end: "14#MB", lines: ["\treturn next;"] },
    { path: "src/b.ts", op: "append", pos: "30#QR", lines: ["", "export const enabled = true;"] },
  ],
});
```

### Delete a line range

```ts
await hashline_edit({
  edits: [
    { path: "src/a.ts", op: "replace", pos: "20#TN", end: "24#WS", lines: null },
  ],
});
```

### Create, delete, and move files

```ts
await hashline_edit({
  edits: [
    { path: "src/new.ts", op: "append", lines: ["export const created = true;"] },
    { path: "src/dead.ts", op: "delete" },
    { path: "src/old.ts", op: "move", to: "src/archive/old.ts" },
  ],
});
```

## Safety Invariants

- **Snapshot invariant:** anchors in one call resolve against original file content.
- **Freshness invariant:** stale hashes fail before mutation.
- **No guessing invariant:** the tool never relocates anchors or fuzzy-matches content.
- **Minimal mutation invariant:** only requested line operations are applied.
- **Ordering invariant:** edits apply bottom-up so original anchors remain valid during mutation.
- **File-preservation invariant:** UTF-8 BOM and original LF/CRLF line endings are preserved.

## Failure Behavior

- Stale anchors throw `HashlineMismatchError` with nearby updated `LINE#ID` context.
- Malformed anchors fail clearly.
- Overlapping replacement ranges fail before mutation.
- Inserts anchored inside consumed replacement ranges fail before mutation.
- No-op edits fail with an explicit no-change diagnostic.

## Notes

`hashline_edit` is for line-addressed source edits. Use `ast_edit` for syntax-aware codemods and `write` for intentional whole-file replacement when anchored edits are not the right abstraction.
