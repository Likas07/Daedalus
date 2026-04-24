# Semantic Index Pruning and Speed Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Apply the full 1-15 semantic indexing improvement set: better irrelevant-content exclusion, faster repeated syncs, faster scan/hash/write/index phases, and clearer skip/index telemetry.

**Architecture:** Split semantic indexing into explicit stages: discover candidates, apply hard excludes, apply gitignore and semanticignore, classify low-value/generated/minified/snapshot content, cheaply detect unchanged files, chunk only meaningful changed files, insert chunks in batches, and refresh LanceDB indexes only when needed. Keep Daedalus local-first: no remote service, no background watcher required by this plan.

**Tech Stack:** TypeScript/Bun, glob/ignore-style path matching, Ollama embeddings, LanceDB, Vitest/Bun tests.

---

## Current code landmarks

- Semantic scanner/runtime: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Chunking: `packages/coding-agent/src/extensions/daedalus/tools/semantic-chunking.ts`
- Embedding: `packages/coding-agent/src/extensions/daedalus/tools/semantic-embedder.ts`
- LanceDB store: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- Workspace metadata/gating: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Command/progress UI: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- Types: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
- Existing regression tests: `packages/coding-agent/test/semantic-incremental-sync.test.ts`
- Existing workspace tests: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`
- Existing embedder tests: `packages/coding-agent/test/semantic-embedder-lancedb.test.ts`

## Non-goals

- Do not add a background file watcher.
- Do not make semantic indexing depend on a remote service.
- Do not remove the current hard denylist; gitignore and semanticignore augment it.
- Do not index dependency/build/cache trees in any profile.
- Do not silently include ignored files because a user invokes `/workspace-sync`; explicit semantic include support is out of scope unless added in a later plan.

## Acceptance criteria

1. Daedalus respects hard semantic excludes, `.gitignore`, nested `.gitignore`, and `.semanticignore` during candidate discovery.
2. Generated/minified/snapshot/lock/log/result content is excluded or capped before chunking and embedding.
3. Repeated syncs avoid content reads/hashes for unchanged files when size and mtime match manifest metadata.
4. File scanning and hashing use bounded concurrency.
5. Chunk insertions and manifest updates are batched.
6. Index refresh is skipped for small/incremental no-op syncs when existing indexes remain valid.
7. Sync telemetry reports how many files were skipped and why.
8. Index profiles exist and default to a normal source-focused profile.
9. Targeted checks pass:
   - `bun run check`
   - `bun test test/semantic-incremental-sync.test.ts test/semantic-workspace-lifecycle.test.ts test/semantic-workspace-commands-exposure.test.ts test/semantic-embedder-lancedb.test.ts`

---

## Task 1: Extract semantic discovery into a dedicated module

**Objective:** Move candidate discovery and exclusion concerns out of `semantic-store.ts` so all later work has a clear seam.

**Files:**
- Create: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Create `packages/coding-agent/test/semantic-file-discovery.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectSemanticCandidateFiles } from "../src/extensions/daedalus/tools/semantic-file-discovery.js";

function rels(files: string[], root: string) {
	return files.map((file) => file.slice(root.length + 1).split("\\").join("/")).sort();
}

describe("semantic file discovery", () => {
	let root: string;

	beforeEach(() => {
		root = join(tmpdir(), `daedalus-semantic-discovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(root, "src"), { recursive: true });
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("collects text source files through a dedicated discovery API", () => {
		writeFileSync(join(root, "src", "app.ts"), "export const app = true;\n");
		writeFileSync(join(root, "src", "image.png"), "not really an image\n");

		expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/app.ts"]);
	});
});
```

**Step 2: Run test to verify failure**

Run:

```bash
cd /home/likas/Research/Daedalus/packages/coding-agent
bun test test/semantic-file-discovery.test.ts
```

Expected: FAIL because `semantic-file-discovery.js` does not exist.

**Step 3: Implement module**

Create `semantic-file-discovery.ts` with:

```ts
import path from "node:path";
import { globSync } from "glob";

export const SEMANTIC_TEXT_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".py", ".rs", ".go", ".java",
	".c", ".cc", ".cpp", ".h", ".hpp", ".yaml", ".yml", ".toml", ".sh", ".css", ".html",
]);

export const SEMANTIC_HARD_EXCLUDE_GLOBS = [
	"**/node_modules/**", "**/bower_components/**", "**/.git/**", "**/.hg/**", "**/.svn/**", "**/.daedalus/**",
	"**/agent/**", "**/.venv/**", "**/venv/**", "**/env/**", "**/.env/**", "**/site-packages/**", "**/site_packages/**",
	"**/__pycache__/**", "**/.pytest_cache/**", "**/.mypy_cache/**", "**/.ruff_cache/**", "**/.cache/**", "**/cache/**",
	"**/.tmp/**", "**/tmp/**", "**/temp/**", "**/dist/**", "**/dist-chrome/**", "**/dist-firefox/**", "**/build/**",
	"**/target/**", "**/out/**", "**/coverage/**", "**/.nyc_output/**", "**/.next/**", "**/.nuxt/**", "**/.svelte-kit/**",
	"**/.turbo/**", "**/.parcel-cache/**", "testing/harbor/**", "testing/terminal-bench-2/**", "testing/results/**",
	"**/package-lock.json", "**/npm-shrinkwrap.json", "**/yarn.lock", "**/pnpm-lock.yaml", "**/bun.lock", "**/Cargo.lock",
	"**/*.tsbuildinfo", "**/*.generated.*",
];

export function isSemanticTextFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return SEMANTIC_TEXT_EXTENSIONS.has(ext) || ext === "";
}

export function collectSemanticCandidateFiles(cwd: string): string[] {
	return globSync("**/*", {
		cwd,
		absolute: true,
		dot: true,
		nodir: true,
		ignore: SEMANTIC_HARD_EXCLUDE_GLOBS,
	}).filter((filePath) => isSemanticTextFile(filePath));
}
```

**Step 4: Wire store to new module**

In `semantic-store.ts`:

- Remove local `TEXT_EXTENSIONS`, `isProbablyTextFile`, `SEMANTIC_INDEX_EXCLUDE_GLOBS`, and `collectCandidateFiles`.
- Import:

```ts
import { collectSemanticCandidateFiles } from "./semantic-file-discovery.js";
```

- Replace calls to `collectCandidateFiles(...)` with `collectSemanticCandidateFiles(...)`.

**Step 5: Verify**

Run:

```bash
bun test test/semantic-file-discovery.test.ts test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 2: Add gitignore-aware candidate filtering

**Objective:** Exclude files ignored by root and nested `.gitignore` files.

**Files:**
- Modify: `packages/coding-agent/package.json`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add to `semantic-file-discovery.test.ts`:

```ts
it("honors root and nested gitignore files", () => {
	writeFileSync(join(root, ".gitignore"), "ignored-root/\n*.local.ts\n");
	mkdirSync(join(root, "ignored-root"), { recursive: true });
	writeFileSync(join(root, "ignored-root", "x.ts"), "export const x = true;\n");
	writeFileSync(join(root, "src", "kept.ts"), "export const kept = true;\n");
	writeFileSync(join(root, "src", "secret.local.ts"), "export const secret = true;\n");
	writeFileSync(join(root, "src", ".gitignore"), "nested-ignored.ts\n");
	writeFileSync(join(root, "src", "nested-ignored.ts"), "export const ignored = true;\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual([".gitignore", "src/.gitignore", "src/kept.ts"]);
});
```

**Step 2: Run test to verify failure**

Run:

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern "honors root and nested gitignore"
```

Expected: FAIL; ignored files are still collected.

**Step 3: Add dependency**

Add to `packages/coding-agent/package.json` dependencies if not present:

```json
"ignore": "^7.0.5"
```

Run:

```bash
cd /home/likas/Research/Daedalus/packages/coding-agent
bun install
```

**Step 4: Implement gitignore loading**

In `semantic-file-discovery.ts`, add:

```ts
import { existsSync, readFileSync } from "node:fs";
import ignore from "ignore";

interface IgnoreMatcher {
	baseDir: string;
	match(relativePath: string): boolean;
}

function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}

function loadGitignoreMatchers(cwd: string): IgnoreMatcher[] {
	const gitignoreFiles = globSync("**/.gitignore", {
		cwd,
		absolute: true,
		dot: true,
		nodir: true,
		ignore: SEMANTIC_HARD_EXCLUDE_GLOBS,
	});
	return gitignoreFiles.map((filePath) => {
		const baseDir = path.dirname(filePath);
		const matcher = ignore().add(readFileSync(filePath, "utf8"));
		return {
			baseDir,
			match(absolutePath: string) {
				const relative = toPosix(path.relative(baseDir, absolutePath));
				return relative !== "" && !relative.startsWith("../") && matcher.ignores(relative);
			},
		};
	});
}

function isIgnoredByMatchers(filePath: string, matchers: IgnoreMatcher[]): boolean {
	return matchers.some((matcher) => matcher.match(filePath));
}
```

Update `collectSemanticCandidateFiles`:

```ts
export function collectSemanticCandidateFiles(cwd: string): string[] {
	const matchers = loadGitignoreMatchers(cwd);
	return globSync("**/*", {
		cwd,
		absolute: true,
		dot: true,
		nodir: true,
		ignore: SEMANTIC_HARD_EXCLUDE_GLOBS,
	}).filter((filePath) => isSemanticTextFile(filePath) && !isIgnoredByMatchers(filePath, matchers));
}
```

**Step 5: Verify**

Run:

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 3: Add `.semanticignore` support

**Objective:** Let repo owners exclude tracked but semantically low-value files that should remain in git.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`
- Docs: `docs/semantic_search_stack/semantic-ignore.md`

**Step 1: Write failing test**

Add:

```ts
it("honors root and nested semanticignore files", () => {
	writeFileSync(join(root, ".semanticignore"), "benchmarks/\n*.fixture.json\n");
	mkdirSync(join(root, "benchmarks"), { recursive: true });
	writeFileSync(join(root, "benchmarks", "task.py"), "print('ignored')\n");
	writeFileSync(join(root, "src", "kept.ts"), "export const kept = true;\n");
	writeFileSync(join(root, "src", "data.fixture.json"), "{\"fixture\":true}\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual([".semanticignore", "src/kept.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern semanticignore
```

Expected: FAIL.

**Step 3: Implement matcher loading for `.semanticignore`**

Generalize `loadGitignoreMatchers` into:

```ts
function loadIgnoreMatchers(cwd: string, ignoreFileName: ".gitignore" | ".semanticignore"): IgnoreMatcher[] {
	const ignoreFiles = globSync(`**/${ignoreFileName}`, {
		cwd,
		absolute: true,
		dot: true,
		nodir: true,
		ignore: SEMANTIC_HARD_EXCLUDE_GLOBS,
	});
	return ignoreFiles.map((filePath) => {
		const baseDir = path.dirname(filePath);
		const matcher = ignore().add(readFileSync(filePath, "utf8"));
		return {
			baseDir,
			match(absolutePath: string) {
				const relative = toPosix(path.relative(baseDir, absolutePath));
				return relative !== "" && !relative.startsWith("../") && matcher.ignores(relative);
			},
		};
	});
}
```

Update collection:

```ts
const matchers = [...loadIgnoreMatchers(cwd, ".gitignore"), ...loadIgnoreMatchers(cwd, ".semanticignore")];
```

**Step 4: Add docs**

Create `docs/semantic_search_stack/semantic-ignore.md`:

```md
# Semantic Ignore

Daedalus semantic indexing always excludes dependency, build, cache, generated, and internal store paths.

For tracked files that are useful in git but low-value for semantic search, add a `.semanticignore` file. It uses gitignore-style patterns and can appear at the workspace root or in nested directories.

Examples:

```gitignore
benchmarks/
fixtures/**/*.json
*.fixture.json
snapshots/
```
```

**Step 5: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 4: Add generated-file marker detection

**Objective:** Skip generated files even when their names do not match `*.generated.*`.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("skips generated files by path and header marker", () => {
	mkdirSync(join(root, "src", "__generated__"), { recursive: true });
	writeFileSync(join(root, "src", "__generated__", "client.ts"), "export const client = true;\n");
	writeFileSync(join(root, "src", "api.pb.go"), "package api\n");
	writeFileSync(join(root, "src", "marker.ts"), "// Code generated by protoc. DO NOT EDIT.\nexport const marker = true;\n");
	writeFileSync(join(root, "src", "handwritten.ts"), "export const handwritten = true;\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/handwritten.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern generated
```

Expected: FAIL.

**Step 3: Implement generated checks**

Add hard glob patterns:

```ts
"**/generated/**",
"**/__generated__/**",
"**/*.gen.*",
"**/*.pb.*",
```

Add a header sniff:

```ts
const GENERATED_MARKERS = [
	"@generated",
	"code generated by",
	"do not edit",
	"automatically generated",
	"this file was generated",
];

function hasGeneratedHeader(filePath: string): boolean {
	try {
		const header = readFileSync(filePath, "utf8").slice(0, 2048).toLowerCase();
		return GENERATED_MARKERS.some((marker) => header.includes(marker));
	} catch {
		return false;
	}
}
```

Filter candidates:

```ts
.filter((filePath) => isSemanticTextFile(filePath) && !isIgnoredByMatchers(filePath, matchers) && !hasGeneratedHeader(filePath));
```

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 5: Expand lockfile and machine-manifest exclusions

**Objective:** Avoid indexing low-semantic-value dependency resolution files.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("skips dependency lockfiles and machine manifests", () => {
	const lockfiles = ["composer.lock", "Gemfile.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "go.sum", "deno.lock"];
	for (const file of lockfiles) writeFileSync(join(root, file), "lock data\n");
	writeFileSync(join(root, "src", "kept.ts"), "export const kept = true;\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/kept.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern lockfiles
```

Expected: FAIL.

**Step 3: Add patterns**

Append to `SEMANTIC_HARD_EXCLUDE_GLOBS`:

```ts
"**/composer.lock",
"**/Gemfile.lock",
"**/poetry.lock",
"**/uv.lock",
"**/Pipfile.lock",
"**/go.sum",
"**/deno.lock",
"**/.npm/**",
"**/.yarn/**",
"**/.pnpm-store/**",
```

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 6: Add snapshot/golden/recording/traces exclusions

**Objective:** Skip test artifacts that are usually output corpora rather than source context.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("skips snapshots golden outputs recordings and traces", () => {
	const dirs = ["__snapshots__", "snapshots", "golden", "goldens", "recordings", "cassettes", "traces"];
	for (const dir of dirs) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "artifact.json"), "{\"artifact\":true}\n");
	}
	writeFileSync(join(root, "src", "kept.ts"), "export const kept = true;\n");
	writeFileSync(join(root, "src", "component.snap"), "snapshot text\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/kept.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern snapshots
```

Expected: FAIL.

**Step 3: Add patterns**

Append:

```ts
"**/__snapshots__/**",
"**/snapshots/**",
"**/snapshot/**",
"**/golden/**",
"**/goldens/**",
"**/recordings/**",
"**/cassettes/**",
"**/traces/**",
"**/*.snap",
"**/*.har",
```

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 7: Add minified/bundled file detection

**Objective:** Skip bundled or minified files that escape path-based excludes.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("skips minified and bundled text files", () => {
	writeFileSync(join(root, "src", "vendor.min.js"), "var a=1;".repeat(500));
	writeFileSync(join(root, "src", "app.bundle.js"), "var b=2;".repeat(500));
	writeFileSync(join(root, "src", "longline.js"), `${"x".repeat(5000)}\n`);
	writeFileSync(join(root, "src", "app.ts"), "export const app = true;\n");

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/app.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern minified
```

Expected: FAIL.

**Step 3: Implement checks**

Add globs:

```ts
"**/*.min.js",
"**/*.min.css",
"**/*.bundle.js",
"**/bundle.*",
"**/vendor.*",
```

Add content heuristic:

```ts
function looksMinified(filePath: string): boolean {
	try {
		const sample = readFileSync(filePath, "utf8").slice(0, 8192);
		const lines = sample.split(/\r?\n/);
		const longestLine = Math.max(...lines.map((line) => line.length));
		const averageLine = sample.length / Math.max(lines.length, 1);
		return longestLine > 2000 || averageLine > 500;
	} catch {
		return false;
	}
}
```

Filter:

```ts
&& !looksMinified(filePath)
```

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 8: Add type-aware file size caps

**Objective:** Keep useful large source files while rejecting huge data/manifests/log-like text earlier.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("uses stricter size caps for data-like text files", () => {
	writeFileSync(join(root, "src", "large-source.ts"), `export const text = \`${"a".repeat(150_000)}\`;\n`);
	writeFileSync(join(root, "src", "large-data.json"), `{\"data\":\"${"a".repeat(150_000)}\"}\n`);
	writeFileSync(join(root, "src", "events.jsonl"), `${"{\"x\":1}\n".repeat(20_000)}`);

	expect(rels(collectSemanticCandidateFiles(root), root)).toEqual(["src/large-source.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern "stricter size"
```

Expected: FAIL.

**Step 3: Implement size policy**

Add:

```ts
const DEFAULT_SOURCE_SIZE_LIMIT = 200_000;
const DEFAULT_DOC_SIZE_LIMIT = 300_000;
const DEFAULT_DATA_SIZE_LIMIT = 100_000;

function semanticSizeLimit(filePath: string): number {
	const ext = path.extname(filePath).toLowerCase();
	if ([".json", ".jsonl", ".csv", ".log"].includes(ext)) return DEFAULT_DATA_SIZE_LIMIT;
	if ([".md", ".txt"].includes(ext)) return DEFAULT_DOC_SIZE_LIMIT;
	return DEFAULT_SOURCE_SIZE_LIMIT;
}

function isWithinSemanticSizeLimit(filePath: string): boolean {
	try {
		return statSync(filePath).size <= semanticSizeLimit(filePath);
	} catch {
		return false;
	}
}
```

Import `statSync` from `node:fs` in discovery.

Filter candidates with `isWithinSemanticSizeLimit(filePath)`.

In `semantic-store.ts`, change `readTextFile` to rely on the discovery size filter or share `semanticSizeLimit(filePath)` instead of a hardcoded `200_000`.

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 9: Add semantic value classification

**Objective:** Classify candidate files as high/medium/low value so profile selection and telemetry can reason about why files are indexed or skipped.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
import { classifySemanticPath } from "../src/extensions/daedalus/tools/semantic-file-discovery.js";

it("classifies semantic path value", () => {
	expect(classifySemanticPath("packages/coding-agent/src/core/agent-session.ts")).toBe("high");
	expect(classifySemanticPath("packages/coding-agent/test/semantic.test.ts")).toBe("medium");
	expect(classifySemanticPath("fixtures/sample.json")).toBe("low");
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern "classifies semantic path value"
```

Expected: FAIL.

**Step 3: Add type and classifier**

In `semantic-types.ts`:

```ts
export type SemanticPathValue = "high" | "medium" | "low";
```

In `semantic-file-discovery.ts`:

```ts
import type { SemanticPathValue } from "./semantic-types.js";

export function classifySemanticPath(relativePath: string): SemanticPathValue {
	const path = relativePath.split("\\").join("/");
	if (/^(packages\/[^/]+\/src\/|src\/|lib\/)/.test(path)) return "high";
	if (/^(packages\/[^/]+\/test\/|test\/|tests\/|docs\/|\.github\/)/.test(path)) return "medium";
	if (/(fixture|fixtures|sample|mock|mocks)/i.test(path)) return "low";
	return "medium";
}
```

**Step 4: Verify**

```bash
bun test test/semantic-file-discovery.test.ts
```

Expected: PASS.

---

## Task 10: Add index profile modes

**Objective:** Let Daedalus choose how broad indexing should be without changing code.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`

**Step 1: Write failing test**

Add:

```ts
it("supports minimal normal broad and exhaustive profiles", () => {
	writeFileSync(join(root, "src", "app.ts"), "export const app = true;\n");
	mkdirSync(join(root, "tests"), { recursive: true });
	writeFileSync(join(root, "tests", "app.test.ts"), "test('app', () => {});\n");
	mkdirSync(join(root, "fixtures"), { recursive: true });
	writeFileSync(join(root, "fixtures", "tiny.json"), "{\"fixture\":true}\n");

	expect(rels(collectSemanticCandidateFiles(root, { profile: "minimal" }), root)).toEqual(["src/app.ts"]);
	expect(rels(collectSemanticCandidateFiles(root, { profile: "normal" }), root)).toEqual(["src/app.ts", "tests/app.test.ts"]);
	expect(rels(collectSemanticCandidateFiles(root, { profile: "broad" }), root)).toEqual(["fixtures/tiny.json", "src/app.ts", "tests/app.test.ts"]);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern profiles
```

Expected: FAIL.

**Step 3: Add config**

In `semantic-config.ts`:

```ts
export type SemanticIndexProfile = "minimal" | "normal" | "broad" | "exhaustive";
export const DEFAULT_SEMANTIC_INDEX_PROFILE: SemanticIndexProfile = "normal";
export const SEMANTIC_INDEX_PROFILE_ENV = "DAEDALUS_SEMANTIC_INDEX_PROFILE";
```

Add parser:

```ts
export function resolveSemanticIndexProfile(value = process.env[SEMANTIC_INDEX_PROFILE_ENV]): SemanticIndexProfile {
	if (value === "minimal" || value === "normal" || value === "broad" || value === "exhaustive") return value;
	return DEFAULT_SEMANTIC_INDEX_PROFILE;
}
```

**Step 4: Apply profile in discovery**

Add options:

```ts
export interface SemanticFileDiscoveryOptions {
	profile?: SemanticIndexProfile;
}
```

Profile policy:

```ts
function includeByProfile(value: SemanticPathValue, profile: SemanticIndexProfile): boolean {
	if (profile === "exhaustive") return true;
	if (profile === "broad") return true;
	if (profile === "normal") return value !== "low";
	return value === "high";
}
```

Use `path.relative(cwd, filePath)` and `classifySemanticPath` during filtering.

**Step 5: Wire store**

In `SemanticStoreConfig`, add:

```ts
indexProfile?: SemanticIndexProfile;
```

When collecting:

```ts
const candidateFiles = collectSemanticCandidateFiles(config.workspaceRoot, { profile: config.indexProfile ?? resolveSemanticIndexProfile() });
```

**Step 6: Verify**

```bash
bun test test/semantic-file-discovery.test.ts test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 11: Add skip telemetry

**Objective:** Report skip reasons so users can see why indexing is faster and what was excluded.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-file-discovery.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-types.ts`
- Test: `packages/coding-agent/test/semantic-file-discovery.test.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

**Step 1: Write failing test**

Add:

```ts
import { discoverSemanticFiles } from "../src/extensions/daedalus/tools/semantic-file-discovery.js";

it("reports skip telemetry by reason", () => {
	writeFileSync(join(root, "src", "app.ts"), "export const app = true;\n");
	mkdirSync(join(root, "dist"), { recursive: true });
	writeFileSync(join(root, "dist", "bundle.js"), "export const bundle = true;\n");
	writeFileSync(join(root, "package-lock.json"), "{}\n");

	const result = discoverSemanticFiles(root);
	expect(rels(result.files, root)).toEqual(["src/app.ts"]);
	expect(result.skippedByReason.hardExclude).toBeGreaterThanOrEqual(1);
	expect(result.skippedByReason.lockfile).toBeGreaterThanOrEqual(1);
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-file-discovery.test.ts --test-name-pattern telemetry
```

Expected: FAIL.

**Step 3: Define telemetry types**

In `semantic-types.ts`:

```ts
export type SemanticSkipReason =
	| "hardExclude"
	| "gitignore"
	| "semanticignore"
	| "nonText"
	| "sizeLimit"
	| "generated"
	| "minified"
	| "lockfile"
	| "profile";

export type SemanticSkipCounts = Partial<Record<SemanticSkipReason, number>>;
```

**Step 4: Implement `discoverSemanticFiles`**

In discovery module:

```ts
export interface SemanticDiscoveryResult {
	files: string[];
	skippedByReason: SemanticSkipCounts;
}

function increment(counts: SemanticSkipCounts, reason: SemanticSkipReason): void {
	counts[reason] = (counts[reason] ?? 0) + 1;
}

export function discoverSemanticFiles(cwd: string, options: SemanticFileDiscoveryOptions = {}): SemanticDiscoveryResult {
	// Implement using globSync("**/*", { dot: true, nodir: true }) and explicit filters.
	// Do not rely only on glob ignore because telemetry needs reason counts.
	// Keep `collectSemanticCandidateFiles` as `return discoverSemanticFiles(cwd, options).files`.
}
```

Reason specificity rule:
- First matching reason wins.
- Hard exclude directory/file patterns should be counted as `hardExclude`, except known lockfiles count as `lockfile`.
- Gitignore and semanticignore should be counted separately.

**Step 5: Add progress/result fields**

In `SemanticStoreProgress` and `SemanticStoreSyncResult`:

```ts
skippedByReason?: SemanticSkipCounts;
skippedFiles?: number;
```

At sync start:

```ts
const discovery = discoverSemanticFiles(config.workspaceRoot, { profile });
const candidateFiles = discovery.files;
```

Emit `skippedByReason` and `skippedFiles` in all progress events.

**Step 6: Show UI line**

In `semantic-workspace-tools.ts`, add to progress widget:

```ts
if (progress.skippedFiles != null && progress.skippedFiles > 0) {
	lines.push(`Skipped: ${progress.skippedFiles}`);
}
```

Optionally summarize top reasons:

```ts
const topSkipReasons = Object.entries(progress.skippedByReason ?? {})
	.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
	.slice(0, 3)
	.map(([reason, count]) => `${reason} ${count}`)
	.join(", ");
if (topSkipReasons) lines.push(`Skip reasons: ${topSkipReasons}`);
```

**Step 7: Verify**

```bash
bun test test/semantic-file-discovery.test.ts test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 12: Add cheap stat precheck to avoid hashing unchanged files

**Objective:** Speed repeated syncs by skipping content reads/hashes when indexed manifest size and mtime match local stat metadata.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

**Step 1: Write failing test**

Add to `semantic-incremental-sync.test.ts`:

```ts
it("does not reread unchanged indexed files when stat metadata matches", async () => {
	writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 'alpha';\n");
	await initSemanticWorkspace(tempDir);
	const workspace = loadSemanticWorkspace(tempDir)!;
	const runtime = await createSemanticStoreRuntime({
		databaseDir: workspace.databaseDir,
		workspaceRoot: tempDir,
		host: workspace.embeddingHost,
		model: workspace.embeddingModel,
	});

	await runtime.sync();
	const before = await runtime.listIndexedFiles();
	const second = await runtime.sync();

	expect(second.changedFiles).toBe(0);
	expect(second.unchangedFiles).toBe(1);
	expect(await runtime.listIndexedFiles()).toEqual(before);
});
```

This test asserts behavior but not read count. If stronger proof is needed, inject a reader dependency in a later refactor.

**Step 2: Run test**

```bash
bun test test/semantic-incremental-sync.test.ts --test-name-pattern "does not reread unchanged"
```

Expected: PASS today behaviorally, but use this as a guard before refactor.

**Step 3: Refactor local state collection**

Change sync flow:

1. Collect candidate file stats without reading file contents.
2. Load indexed manifest.
3. If a candidate path exists in manifest and `fileSize` and truncated `modifiedMs` match, create local state using existing manifest hash.
4. Only read/hash new files and files with stat mismatch.

Suggested helper:

```ts
function indexedFileMatchesStat(indexed: SemanticIndexedFile, stats: ReturnType<typeof statSync>): boolean {
	return indexed.fileSize === stats.size && indexed.modifiedMs === Math.trunc(stats.mtimeMs);
}
```

During scan:

```ts
const indexedByPath = new Map(indexedFiles.map((file) => [file.filePath, file]));
const indexed = indexedByPath.get(relativePath);
if (indexed && indexedFileMatchesStat(indexed, stats)) {
	localFiles.push({
		filePath: relativePath,
		fileHash: indexed.fileHash,
		fileSize: stats.size,
		modifiedMs: Math.trunc(stats.mtimeMs),
	});
	// no readTextFile / computeFileHash
} else {
	const fileHash = await computeFileHash(absolutePath);
	...
}
```

**Step 4: Add debug/telemetry fields**

Add to progress/result:

```ts
statUnchangedFiles?: number;
hashedFiles?: number;
```

**Step 5: Verify**

```bash
bun test test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 13: Add bounded concurrency for stat/hash scanning

**Objective:** Speed scan/planning on large repos without unbounded file IO.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

**Step 1: Add config constants**

In `semantic-config.ts`:

```ts
export const DEFAULT_SEMANTIC_SCAN_CONCURRENCY = 32;
export const SEMANTIC_SCAN_CONCURRENCY_ENV = "DAEDALUS_SEMANTIC_SCAN_CONCURRENCY";

export function resolveSemanticScanConcurrency(value = process.env[SEMANTIC_SCAN_CONCURRENCY_ENV]): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 128) : DEFAULT_SEMANTIC_SCAN_CONCURRENCY;
}
```

**Step 2: Write failing-ish test for preservation**

Add a many-file sync test:

```ts
it("syncs many files correctly with concurrent scanning", async () => {
	for (let index = 0; index < 50; index += 1) {
		writeFileSync(join(tempDir, "src", `file-${index}.ts`), `export const value${index} = ${index};\n`);
	}
	await initSemanticWorkspace(tempDir);
	const workspace = loadSemanticWorkspace(tempDir)!;
	const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
	const result = await runtime.sync();
	expect(result.changedFiles).toBe(50);
	expect((await runtime.listIndexedFiles()).map((file) => file.filePath)).toHaveLength(50);
});
```

**Step 3: Implement helper**

In `semantic-store.ts`:

```ts
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await worker(items[index], index);
		}
	}));
	return results;
}
```

Use it for candidate stat/hash processing while emitting progress as workers finish.

**Step 4: Verify**

```bash
bun test test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 14: Batch chunk insertion and manifest updates

**Objective:** Reduce LanceDB overhead and provide real write/embedding batch progress.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

**Step 1: Add config**

In `semantic-config.ts`:

```ts
export const DEFAULT_SEMANTIC_INSERT_CHUNK_BATCH_SIZE = 256;
export const SEMANTIC_INSERT_CHUNK_BATCH_SIZE_ENV = "DAEDALUS_SEMANTIC_INSERT_CHUNK_BATCH_SIZE";
```

Add resolver with sane min/max.

**Step 2: Add progress fields**

In `SemanticStoreProgress`:

```ts
embeddingBatchesCompleted?: number;
embeddingBatchesTotal?: number;
writeSubphase?: "planning" | "deleting-stale" | "embedding-writing" | "manifest" | "indexing";
```

**Step 3: Write failing test**

Capture progress:

```ts
it("reports chunk batch progress while inserting changed chunks", async () => {
	for (let index = 0; index < 5; index += 1) {
		writeFileSync(join(tempDir, "src", `file-${index}.ts`), Array.from({ length: 100 }, (_, line) => `export const x${line} = ${line};`).join("\n"));
	}
	await initSemanticWorkspace(tempDir);
	const workspace = loadSemanticWorkspace(tempDir)!;
	const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
	const progress: any[] = [];
	await runtime.sync((event) => progress.push(event));
	expect(progress.some((event) => event.embeddingBatchesTotal && event.embeddingBatchesCompleted != null)).toBe(true);
});
```

**Step 4: Implement chunk batching**

Flatten chunk plans:

```ts
const allChangedChunks = changedChunkPlans.flatMap((plan) => plan.chunks);
const chunkBatches = chunkArray(allChangedChunks, insertChunkBatchSize);
```

Insert each batch:

```ts
for (const [batchIndex, batch] of chunkBatches.entries()) {
	await store.insertChunks(batch);
	insertedChunks += batch.length;
	emitProgress({
		phase: "writing",
		writeSubphase: "embedding-writing",
		embeddingBatchesCompleted: batchIndex + 1,
		embeddingBatchesTotal: chunkBatches.length,
		chunks: insertedChunks,
		totalChunksPlanned,
		...
	});
}
```

Then batch manifest updates:

```ts
await store.upsertIndexedFiles(changedChunkPlans.map(({ filePath, localState, chunks }) => ({ ... })));
```

**Step 5: UI line**

In `progressWidgetLines`:

```ts
if (progress.embeddingBatchesTotal != null) {
	lines.push(`Embedding batches: ${progress.embeddingBatchesCompleted ?? 0}/${progress.embeddingBatchesTotal}`);
}
if (progress.writeSubphase) lines.push(`Substep: ${progress.writeSubphase}`);
```

**Step 6: Verify**

```bash
bun test test/semantic-incremental-sync.test.ts test/semantic-workspace-commands-exposure.test.ts
```

Expected: PASS.

---

## Task 15: Reduce chunk overlap and make chunking profile-aware

**Objective:** Reduce embedding volume without damaging retrieval quality too much.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-chunking.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-config.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Test: `packages/coding-agent/test/semantic-chunking.test.ts`

**Step 1: Write tests**

Create `semantic-chunking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunkDocument } from "../src/extensions/daedalus/tools/semantic-chunking.js";

describe("semantic chunking", () => {
	it("uses smaller overlap by default", () => {
		const content = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`).join("\n");
		const chunks = chunkDocument("src/app.ts", content);
		expect(chunks.length).toBeLessThanOrEqual(3);
	});

	it("uses no overlap for data-like files", () => {
		const content = Array.from({ length: 200 }, (_, index) => `{"line":${index + 1}}`).join("\n");
		const chunks = chunkDocument("src/data.json", content);
		expect(chunks[1]?.startLine).toBe(81);
	});
});
```

**Step 2: Run test to verify failure**

```bash
bun test test/semantic-chunking.test.ts
```

Expected: FAIL under current 80/20 overlap.

**Step 3: Implement defaults**

Change `semantic-chunking.ts`:

```ts
const DEFAULT_MAX_LINES = 100;
const DEFAULT_OVERLAP_LINES = 10;

function defaultOverlapForFile(filePath: string): number {
	const ext = path.extname(filePath).toLowerCase();
	if ([".json", ".jsonl", ".csv", ".toml", ".yaml", ".yml"].includes(ext)) return 0;
	if ([".md", ".txt"].includes(ext)) return 5;
	return DEFAULT_OVERLAP_LINES;
}
```

Use:

```ts
const overlapLines = Math.max(0, Math.min(maxLines - 1, config.overlapLines ?? defaultOverlapForFile(filePath)));
```

**Step 4: Add env knobs**

In `semantic-config.ts`, add:

```ts
export const DAEDALUS_SEMANTIC_CHUNK_MAX_LINES_ENV = "DAEDALUS_SEMANTIC_CHUNK_MAX_LINES";
export const DAEDALUS_SEMANTIC_CHUNK_OVERLAP_LINES_ENV = "DAEDALUS_SEMANTIC_CHUNK_OVERLAP_LINES";
```

Wire to `semantic-store.ts` when calling `chunkDocument`.

**Step 5: Verify**

```bash
bun test test/semantic-chunking.test.ts test/semantic-incremental-sync.test.ts
```

Expected: PASS.

---

## Task 16: Avoid unnecessary index rebuilds

**Objective:** Make small/no-op incremental syncs avoid expensive LanceDB index refresh when indexes already exist and changes are below threshold.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-lancedb.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Test: `packages/coding-agent/test/semantic-incremental-sync.test.ts`

**Step 1: Add metadata fields**

In workspace metadata, add:

```ts
lastIndexRefreshAt?: string;
lastIndexRefreshChunkCount?: number;
indexRefreshStrategyVersion?: number;
```

**Step 2: Write behavior test**

Add progress capture test:

```ts
it("skips index refresh for no-op syncs when indexes already exist", async () => {
	writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 1;\n");
	await initSemanticWorkspace(tempDir);
	const workspace = loadSemanticWorkspace(tempDir)!;
	const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
	await runtime.sync();
	const progress: any[] = [];
	await runtime.sync((event) => progress.push(event));
	expect(progress.some((event) => event.phase === "indexing" && /skipped/i.test(event.message))).toBe(true);
});
```

**Step 3: Implement policy**

In `semantic-store.ts`:

```ts
const shouldRefreshIndexes = insertedChunks > 0 || removedChunks > 0 || !storeInfo.vectorIndexName || !storeInfo.ftsIndexName;
if (shouldRefreshIndexes) {
	await store.ensureIndexes(...);
} else {
	emitProgress({ phase: "indexing", message: "Skipping index refresh; indexes are already current", ... });
}
```

Later enhancement: add threshold env:

```ts
DAEDALUS_SEMANTIC_REINDEX_CHANGE_RATIO=0.05
```

**Step 4: Verify**

```bash
bun test test/semantic-incremental-sync.test.ts test/semantic-workspace-lifecycle.test.ts
```

Expected: PASS.

---

## Task 17: Add end-to-end discovery telemetry to workspace summary

**Objective:** Make skip/index decisions visible in command output and persisted metadata.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/semantic-workspace-tools.ts`
- Modify: `packages/coding-agent/test/semantic-workspace-lifecycle.test.ts`

**Step 1: Add metadata shape**

Persist in workspace metadata:

```ts
lastDiscoverySummary?: {
	candidateFiles: number;
	skippedFiles: number;
	skippedByReason: SemanticSkipCounts;
	indexProfile: SemanticIndexProfile;
};
```

**Step 2: Update summary text**

In `buildCompletionSummary`, append:

```ts
progress?.skippedFiles != null ? `${progress.skippedFiles} skipped file${progress.skippedFiles === 1 ? "" : "s"}` : undefined
```

**Step 3: Test lifecycle metadata**

Extend lifecycle test to assert `lastDiscoverySummary` exists after sync and includes candidate/skipped counts.

**Step 4: Verify**

```bash
bun test test/semantic-workspace-lifecycle.test.ts test/semantic-workspace-commands-exposure.test.ts
```

Expected: PASS.

---

## Task 18: Full targeted verification

**Objective:** Prove semantic stack remains green after all 1-15 improvements.

**Files:**
- No source changes unless failures reveal a real bug.

**Step 1: Run semantic targeted checks**

```bash
cd /home/likas/Research/Daedalus/packages/coding-agent
bun run check && bun test \
  test/semantic-file-discovery.test.ts \
  test/semantic-chunking.test.ts \
  test/semantic-incremental-sync.test.ts \
  test/semantic-workspace-lifecycle.test.ts \
  test/semantic-workspace-commands-exposure.test.ts \
  test/semantic-embedder-lancedb.test.ts
```

Expected:
- `tsgo -p tsconfig.json` succeeds.
- All listed tests pass.

**Step 2: Run root verification if time permits**

```bash
cd /home/likas/Research/Daedalus
bun run check
bun run test
```

Expected: PASS under the repository's current default scripts.

**Step 3: Manual performance sanity check**

Run a one-off debug sync in a temp copy or current workspace:

```bash
cd /home/likas/Research/Daedalus/packages/coding-agent
DAEDALUS_SEMANTIC_DEBUG=1 bun test test/semantic-incremental-sync.test.ts
```

Expected debug evidence:
- discovery candidate count lower than before
- skipped counts reported
- unchanged files stat-short-circuited on second sync
- embedding batch progress emitted
- index refresh skipped for no-op sync

---

## Suggested commit sequence

1. `refactor: extract semantic file discovery`
2. `feat: honor gitignore during semantic discovery`
3. `feat: add semanticignore support`
4. `feat: skip generated semantic index candidates`
5. `feat: expand semantic lockfile exclusions`
6. `feat: skip semantic snapshot artifacts`
7. `feat: skip minified semantic candidates`
8. `feat: add type-aware semantic size caps`
9. `feat: classify semantic path value`
10. `feat: add semantic index profiles`
11. `feat: report semantic skip telemetry`
12. `perf: skip hashing stat-unchanged semantic files`
13. `perf: scan semantic candidates concurrently`
14. `perf: batch semantic chunk writes`
15. `perf: reduce semantic chunk overlap`
16. `perf: skip unnecessary semantic index refreshes`
17. `feat: persist semantic discovery summaries`
18. `test: verify semantic indexing performance stack`

## Risk notes

- Gitignore behavior may hide files users expect semantic search to find. Mitigation: document `.semanticignore`, profiles, and future explicit include support.
- Stat precheck can theoretically miss content changes with identical size and mtime. Mitigation: optional deep verification env later, or force deep sync flag later.
- Generated marker detection can false-positive handwritten files containing "do not edit" in documentation comments. Mitigation: restrict marker check to first 2 KB and require strong marker combinations when needed.
- Reducing overlap can affect retrieval quality. Mitigation: keep env knobs and add retrieval regression tests later.
- Skipping index refresh may make LanceDB search quality stale if LanceDB requires explicit index maintenance after inserts. Mitigation: first implement only no-op skip, then add thresholds after validating behavior.

## Expected outcome

This plan should change semantic indexing from "embed every text-shaped thing under the tree" into a curated source-memory pipeline:

- fewer candidates
- fewer reads
- fewer hashes
- fewer chunks
- fewer embedding calls
- fewer DB writes
- fewer index rebuilds
- more transparent progress

The index should become less like sediment and more like a working map.
