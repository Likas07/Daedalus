# Incremental LanceDB Semantic Sync Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Replace Daedalus’s current full-workspace semantic-store rewrite with incremental file-level sync against the local LanceDB state, while preserving strict readiness/staleness guarantees and Forge-like practical behavior.

Architecture: Introduce a local file-manifest layer stored in LanceDB/metadata, compute local-vs-indexed file diffs during sync, then delete/rebuild chunks only for changed files instead of overwriting the full chunk table. Freshness tracking should move from coarse workspace fingerprint-only gating to file-level indexed-state comparison, with metadata still carrying schema/embedder/chunking identity so incompatible changes force a rebuild.

Tech Stack: Bun/TypeScript, LanceDB OSS, local Ollama embeddings, existing semantic-workspace lifecycle, Vitest.

---

## Context and design target

Current Daedalus behavior:
- `semantic-store.ts` scans all candidate files and accumulates all chunks in memory.
- `semantic-lancedb.ts` writes them with `table.add(..., { mode: "overwrite" })`.
- `semantic-workspace.ts` uses a workspace-level fingerprint to declare the workspace `ready` or `stale`.

Relevant current files:
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-chunking.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`

Target behavior:
- Keep Daedalus local-only.
- Diff local files against the indexed local state, not against a remote server.
- Only delete/rewrite chunk rows for changed/deleted files.
- Leave unchanged files’ chunk rows intact.
- Preserve a rebuild path when schema/chunking/embedder identity changes.
- Keep command UX and readiness semantics predictable.

Non-goals for this plan:
- Full background file watching / auto-sync daemon.
- Switching away from LanceDB.
- Changing the `sem_search` contract unless needed for compatibility with the new sync layer.

---

## High-level design

Introduce two levels of state:

1. Workspace metadata in `.daedalus/semantic-workspace.json`
- semantic stack version
- chunking version
- embedding provider/model/host/dimension
- table/index names
- sync strategy version
- last sync timestamps / counts
- optional aggregate fingerprint for fast status summaries

2. Indexed file manifest in local store
- one row per indexed file, keyed by normalized relative path
- stores file hash / size / mtime / last indexed chunk count / content health
- used as the source of truth for local-vs-indexed diffing

Sync algorithm target:
- discover candidate files
- read cheap local file stat/hash manifest
- compare against indexed manifest
- produce `new`, `modified`, `deleted`, `unchanged`, `failed`
- delete chunk rows for `deleted` and `modified`
- chunk + embed + insert only `new` and `modified`
- update manifest rows only for successful files
- keep unchanged rows untouched

This is Forge-like in update model, but the comparison target is the local LanceDB-backed manifest instead of a remote service.

---

## Proposed data model changes

### Workspace metadata additions

Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`

Add to `SemanticWorkspacePersistedState`:
```ts
syncStrategyVersion: string;
manifestTableName?: string;
chunkTableName?: string;
lastSyncSummary?: {
  scannedFiles: number;
  changedFiles: number;
  deletedFiles: number;
  unchangedFiles: number;
  failedFiles: number;
  insertedChunks: number;
  removedChunks: number;
};
```

Use versions like:
- `chunkingVersion: "v1"`
- `syncStrategyVersion: "incremental-v1"`

### New manifest row type

Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`

Add:
```ts
export interface SemanticIndexedFile {
  filePath: string;
  fileHash: string;
  fileSize: number;
  modifiedMs: number;
  chunkCount: number;
  indexedAt: number;
}

export interface SemanticSyncPlan {
  newFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  unchangedFiles: string[];
  failedFiles: Array<{ filePath: string; reason: string }>;
}
```

### New file-scan snapshot type

Also add:
```ts
export interface SemanticLocalFileState {
  filePath: string;
  fileHash: string;
  fileSize: number;
  modifiedMs: number;
}
```

---

## Implementation tasks

### Task 1: Add failing tests for incremental sync plan computation

Objective: Lock in the desired file-level diff behavior before changing implementation.

Files:
- Modify: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
- Create: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Write failing tests for local-vs-indexed diff classification

Add tests that cover:
- new file appears after previous sync
- modified file changes hash/mtime/content
- deleted file removed from workspace
- unchanged file preserved
- unreadable file reported as failed, not fatal

Suggested skeleton:
```ts
describe("semantic incremental sync planning", () => {
  it("classifies new modified deleted and unchanged files against indexed manifest", async () => {
    // fixture local states
    // fixture indexed manifest rows
    // expect plan.newFiles / modifiedFiles / deletedFiles / unchangedFiles
  });

  it("does not require rewriting unchanged files", async () => {
    // initial sync
    // mutate only one file
    // second sync should report changedFiles=1 and leave others unchanged
  });
});
```

Step 2: Run test to verify failure

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: FAIL — missing diff planner/types/store support.

Step 3: Commit the failing test

```bash
git add packages/coding-agent/test/semantic-incremental-sync.test.ts
git commit -m "test: add failing incremental semantic sync planner coverage"
```

### Task 2: Add file-manifest domain types

Objective: Introduce explicit types for local file state, indexed file state, and sync plans.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Add the new interfaces

```ts
export interface SemanticLocalFileState {
  filePath: string;
  fileHash: string;
  fileSize: number;
  modifiedMs: number;
}

export interface SemanticIndexedFile {
  filePath: string;
  fileHash: string;
  fileSize: number;
  modifiedMs: number;
  chunkCount: number;
  indexedAt: number;
}

export interface SemanticSyncPlan {
  newFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  unchangedFiles: string[];
  failedFiles: Array<{ filePath: string; reason: string }>;
}
```

Step 2: Run tests

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: still FAIL — planner/store functions missing.

Step 3: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts
 git commit -m "feat: add semantic incremental sync domain types"
```

### Task 3: Add cheap local file-state collection

Objective: Collect local file state for diffing without reading full file content except for hash generation.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Optionally create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-sync-plan.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Add a file hashing helper

Implement something like:
```ts
async function computeFileHash(filePath: string): Promise<string | undefined> {
  const content = await readTextFile(filePath);
  if (!content) return undefined;
  return createHash("sha256").update(content).digest("hex");
}
```

Use `node:crypto` and reuse `readTextFile()`.

Step 2: Add local state collection

```ts
async function collectLocalFileStates(workspaceRoot: string): Promise<{
  files: SemanticLocalFileState[];
  failedFiles: Array<{ filePath: string; reason: string }>;
}> {
  // collectCandidateFiles
  // statSync for size/mtime
  // compute content hash
}
```

Step 3: Run targeted test

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: still FAIL — no indexed-manifest comparison yet.

Step 4: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts
 git commit -m "feat: collect local semantic file states for incremental sync"
```

### Task 4: Add indexed manifest storage in LanceDB

Objective: Store one row per indexed file locally so sync can diff against the current indexed state.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Add a manifest table schema

In `semantic-lancedb.ts`, add a second table, e.g. `semantic_indexed_files`:
```ts
file_path: new Utf8(),
file_hash: new Utf8(),
file_size: new Int64(),
modified_ms: new Int64(),
chunk_count: new Int32(),
indexed_at: new Int64(),
```

Step 2: Add store methods

Add methods like:
```ts
listIndexedFiles(): Promise<SemanticIndexedFile[]>;
upsertIndexedFiles(files: SemanticIndexedFile[]): Promise<void>;
deleteIndexedFiles(filePaths: string[]): Promise<void>;
```

Step 3: Persist manifest table names in workspace metadata

Extend workspace metadata with:
```ts
chunkTableName?: string;
manifestTableName?: string;
syncStrategyVersion: string;
```

Step 4: Run tests

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: FAIL — planner still missing.

Step 5: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts
 git commit -m "feat: add local indexed-file manifest store for semantic sync"
```

### Task 5: Implement sync-plan diffing against LanceDB manifest

Objective: Compute `new/modified/deleted/unchanged` by comparing local file states with indexed manifest rows.

Files:
- Create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-sync-plan.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Implement the planner

```ts
export function buildSemanticSyncPlan(
  localFiles: SemanticLocalFileState[],
  indexedFiles: SemanticIndexedFile[],
  failedFiles: Array<{ filePath: string; reason: string }>,
): SemanticSyncPlan {
  // compare by normalized filePath
  // same hash => unchanged
  // missing local => deleted
  // missing indexed => new
  // same path + different hash => modified
}
```

Step 2: Add planner tests

Cover:
- exact match => unchanged
- hash mismatch => modified
- only local => new
- only indexed => deleted
- failed entries preserved

Step 3: Run tests

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: PASS for planner-focused tests.

Step 4: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-sync-plan.ts packages/coding-agent/test/semantic-incremental-sync.test.ts
 git commit -m "feat: add semantic sync planner against local indexed manifest"
```

### Task 6: Add targeted chunk deletion by file path

Objective: Make it possible to remove chunks only for modified/deleted files.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Add chunk deletion API

Add methods like:
```ts
deleteChunksForFiles(filePaths: string[]): Promise<number>;
deleteAllChunks(): Promise<void>; // keep rebuild escape hatch
```

Use Lance table delete support with predicates or per-file loops.

Step 2: Add tests or fake-store coverage

Verify:
- deleting one file path removes only its chunks
- deleting multiple paths leaves unrelated file chunks intact

Step 3: Run tests

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: PASS for deletion behavior.

Step 4: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts
 git commit -m "feat: support targeted semantic chunk deletion by file path"
```

### Task 7: Implement incremental sync execution flow

Objective: Replace full overwrite sync with diff-based per-file sync.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`
- Test: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`

Step 1: Refactor `SemanticStoreRuntime.sync()`

Current behavior to replace:
- collect all chunks
- `replaceChunks(chunks, ...)`

Target behavior:
```ts
const { files, failedFiles } = await collectLocalFileStates(config.workspaceRoot);
const indexedFiles = await store.listIndexedFiles();
const plan = buildSemanticSyncPlan(files, indexedFiles, failedFiles);

await store.deleteChunksForFiles([...plan.deletedFiles, ...plan.modifiedFiles]);
await store.deleteIndexedFiles(plan.deletedFiles);

for (const filePath of [...plan.newFiles, ...plan.modifiedFiles]) {
  const content = await readTextFile(absPath);
  const chunks = chunkDocument(filePath, content);
  await store.insertChunks(chunks);
  await store.upsertIndexedFiles([manifestRow]);
}

await store.ensureIndexes();
```

Important: introduce `insertChunks()` so incremental insert does not imply overwrite mode.

Step 2: Track counts in the sync result

Change sync return shape from only total chunks to something like:
```ts
{
  chunks: number;
  insertedChunks: number;
  removedChunks: number;
  changedFiles: number;
  deletedFiles: number;
  unchangedFiles: number;
  failedFiles: number;
  storePath: string;
  ...
}
```

Step 3: Feed summary back into workspace metadata

Persist last sync summary so `/workspace-info` can explain what happened on the last run.

Step 4: Run lifecycle and incremental tests

Run:
`bun test test/semantic-incremental-sync.test.ts test/semantic-workspace-lifecycle.test.ts`

Expected: PASS for new incremental sync behavior.

Step 5: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts packages/coding-agent/test/semantic-incremental-sync.test.ts packages/coding-agent/test/semantic-workspace-lifecycle.test.ts
 git commit -m "feat: implement incremental file-level semantic sync"
```

### Task 8: Add explicit rebuild gating for incompatible identity changes

Objective: Make sure schema/chunking/embedder changes force a rebuild instead of unsafe incremental reuse.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`

Step 1: Add identity checks

Mark workspace stale/rebuild-required when any of these differ from persisted metadata:
- chunking version
- sync strategy version
- embedding provider/model/host/dimension
- chunk/manifest table schema version

Step 2: Add rebuild path

Introduce helper:
```ts
async function rebuildSemanticWorkspace(...) {
  await store.deleteAllChunks();
  await store.deleteAllIndexedFiles();
  return full incremental sync from empty manifest;
}
```

Step 3: Add tests

Verify:
- changing embedding model marks stale
- changing chunking version marks stale
- sync after version drift rebuilds from empty state

Step 4: Run tests

Run:
`bun test test/semantic-workspace-lifecycle.test.ts`

Expected: PASS.

Step 5: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts
 git commit -m "feat: add semantic workspace rebuild gating for incompatible state"
```

### Task 9: Update command UX and status output for incremental sync

Objective: Make the new sync model understandable to users.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- Test: `packages/coding-agent/test/semantic-workspace-commands-exposure.test.ts`

Step 1: Expand progress phases

Update progress text to show counts like:
- scanned files
- changed files
- deleted files
- inserted chunks
- removed chunks
- unchanged files

Step 2: Update completion summary

Example desired summary:
```text
Semantic workspace sync complete: 3 changed files, 1 deleted file, 94 inserted chunks, 41 removed chunks, 408 unchanged files in 7s.
```

Step 3: Run tests

Run:
`bun test test/semantic-workspace-commands-exposure.test.ts`

Expected: PASS after message assertions are updated to the current command model.

Step 4: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts packages/coding-agent/test/semantic-workspace-commands-exposure.test.ts
 git commit -m "feat: surface incremental semantic sync progress and summaries"
```

### Task 10: Tighten readiness and stale semantics around partial failures

Objective: Avoid declaring the workspace ready when sync partially failed.

Files:
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`

Step 1: Define partial-failure semantics

Recommended rule:
- any unreadable/failed changed file keeps workspace `stale`
- unchanged failures from previously ignored files should be recorded but not silently flip `ready` unless they were meant to be indexed

Step 2: Persist the failure summary

Add to metadata:
```ts
lastSyncSummary?.failedFiles
staleReason?: string
```

Step 3: Run tests

Run:
`bun test test/semantic-workspace-lifecycle.test.ts`

Expected: PASS.

Step 4: Commit

```bash
git add packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts
 git commit -m "fix: keep semantic workspace stale after partial sync failures"
```

### Task 11: Add regression coverage for unchanged-file preservation

Objective: Prove the new sync model avoids full table overwrite on ordinary updates.

Files:
- Modify: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

Step 1: Add an end-to-end preservation test

Suggested shape:
- create 3 files
- sync
- record indexed manifest + chunk ids per file
- modify only 1 file
- sync again
- assert other 2 files’ manifest rows and chunk ids remain unchanged

Step 2: Run tests

Run:
`bun test test/semantic-incremental-sync.test.ts`

Expected: PASS.

Step 3: Commit

```bash
git add packages/coding-agent/test/semantic-incremental-sync.test.ts
 git commit -m "test: verify unchanged files survive incremental semantic sync"
```

### Task 12: Final verification pass

Objective: Verify the feature end to end before any broader rollout.

Files:
- Modify if needed: touched files from earlier tasks only

Step 1: Run focused tests

```bash
bun test test/semantic-incremental-sync.test.ts test/semantic-workspace-lifecycle.test.ts test/semantic-workspace-commands-exposure.test.ts
```

Step 2: Run package checks

```bash
bun run check
```

If unrelated pre-existing failures remain, record them explicitly in the final summary instead of conflating them with the new work.

Step 3: Manual verification in a real workspace

From `packages/coding-agent` or a small fixture workspace:
```bash
bun --cwd=packages/coding-agent src/cli.ts
# then inside Daedalus:
/workspace-init
/workspace-sync
# edit one file
/workspace-sync
/workspace-info
```

Expected:
- second sync reports only targeted changes
- unchanged files are not rewritten
- search still works
- stale detection still behaves strictly

Step 4: Final commit

```bash
git add [modified files]
git commit -m "feat: add incremental LanceDB-backed semantic sync"
```

---

## File-by-file implementation summary

Primary code changes:
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
  - add manifest and sync-plan types
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
  - collect local file state
  - build sync plan
  - run incremental sync
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
  - add manifest table
  - add insert/delete/list manifest APIs
  - add targeted chunk deletion and non-overwrite insert path
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
  - persist sync strategy metadata
  - rebuild gating
  - readiness semantics tied to incremental sync success
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
  - expose incremental sync counts in UX
- `packages/coding-agent/src/extensions/daedalus/tools/semantic-sync-plan.ts`
  - optional dedicated planner module

Primary tests:
- `packages/coding-agent/test/semantic-incremental-sync.test.ts`
- `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
- `packages/coding-agent/test/semantic-workspace-commands-exposure.test.ts`

---

## Risks and mitigations

### Risk 1: LanceDB predicate deletion is awkward
Mitigation:
- start with per-file deletion loops if necessary
- optimize later only if performance is demonstrably insufficient

### Risk 2: Hashing every file still requires reading every file
Mitigation:
- keep v1 simple and correct
- optionally later add a stat-first short circuit if `size + mtime` unchanged and trust mode is acceptable
- do not compromise correctness in v1

### Risk 3: Manifest drift from chunk rows
Mitigation:
- update manifest and chunk rows in the same sync transaction boundary where possible
- on mismatch, mark workspace stale and force rebuild

### Risk 4: Partial failure leaves mixed state
Mitigation:
- never mark ready if any targeted file failed
- persist failure summary
- keep rebuild path available

---

## Acceptance criteria

This work is complete only when all of the following are true:
- `/workspace-sync` no longer overwrites the full chunk table on ordinary edits.
- Sync compares local files against the local indexed manifest, not only a workspace fingerprint.
- Unchanged files remain untouched across syncs.
- Modified files have their old chunks removed and their new chunks inserted.
- Deleted files have their chunks and manifest rows removed.
- Workspace metadata still enforces strict stale/readiness semantics.
- Schema/chunking/embedder identity changes force rebuilds safely.
- Progress and summaries expose changed/deleted/unchanged outcomes clearly.
- Regression tests prove unchanged-file preservation and targeted updates.

---

Plan complete and saved. Ready to execute using subagent-driven-development — I’ll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?