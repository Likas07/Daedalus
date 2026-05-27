import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	collectLocalFileStates,
	createSemanticStoreRuntime,
	type SemanticStoreConfig,
	type SemanticStoreRuntime,
} from "../src/extensions/semantic-search/semantic-store.js";
import { buildSemanticSyncPlan } from "../src/extensions/semantic-search/semantic-sync-plan.js";
import type { SemanticIndexedFile, SemanticLocalFileState } from "../src/extensions/semantic-search/semantic-types.js";
import {
	initSemanticWorkspace,
	loadSemanticWorkspace,
	type SemanticWorkspacePersistedState,
} from "../src/extensions/semantic-search/semantic-workspace.js";
import {
	getSemanticWorkspaceIndexingUnavailableReason,
	isSemanticWorkspaceIndexingAvailable,
	semanticSetupOrSkip,
	skipSemanticTest,
} from "./semantic-test-helpers.js";

const semanticWorkspaceIndexingAvailable = await isSemanticWorkspaceIndexingAvailable();
if (!semanticWorkspaceIndexingAvailable) {
	skipSemanticTest(
		getSemanticWorkspaceIndexingUnavailableReason() ??
			"Semantic workspace indexing unavailable for incremental sync tests",
	);
}
const semanticWorkspaceIt = it.skipIf(!semanticWorkspaceIndexingAvailable);

function indexedFile(filePath: string, fileHash: string, chunkCount = 1): SemanticIndexedFile {
	return {
		filePath,
		fileHash,
		fileSize: 100,
		modifiedMs: 1000,
		chunkCount,
		indexedAt: 2000,
	};
}

function localFile(filePath: string, fileHash: string): SemanticLocalFileState {
	return {
		filePath,
		fileHash,
		fileSize: 100,
		modifiedMs: 1000,
	};
}

function runGit(args: string[], cwd: string): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
}

function loadInitializedWorkspace(cwd: string): SemanticWorkspacePersistedState {
	const workspace = loadSemanticWorkspace(cwd);
	if (!workspace) throw new Error("Semantic workspace was not initialized");
	return workspace;
}

async function createRuntimeOrSkip(
	config: SemanticStoreConfig,
	label: string,
): Promise<SemanticStoreRuntime | undefined> {
	return await semanticSetupOrSkip(() => createSemanticStoreRuntime(config), {
		label: `${label} semantic runtime creation`,
		reasonPrefix: `Semantic store runtime unavailable for ${label}`,
	});
}

describe("semantic incremental sync", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-incremental-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(tempDir, "src"), { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("classifies new modified deleted unchanged and failed files against indexed manifest", () => {
		const plan = buildSemanticSyncPlan(
			[localFile("src/a.ts", "same"), localFile("src/b.ts", "new-hash"), localFile("src/d.ts", "only-local")],
			[indexedFile("src/a.ts", "same"), indexedFile("src/b.ts", "old-hash"), indexedFile("src/c.ts", "only-remote")],
			[{ filePath: "src/e.ts", reason: "unreadable" }],
		);

		expect(plan).toEqual({
			newFiles: ["src/d.ts"],
			modifiedFiles: ["src/b.ts"],
			deletedFiles: ["src/c.ts"],
			unchangedFiles: ["src/a.ts"],
			failedFiles: [{ filePath: "src/e.ts", reason: "unreadable" }],
		});
	});

	it("does not collect dependency and virtualenv folders for semantic indexing", async () => {
		writeFileSync(join(tempDir, "src", "app.ts"), "export const app = true;\n");
		mkdirSync(join(tempDir, "node_modules", "dep"), { recursive: true });
		writeFileSync(join(tempDir, "node_modules", "dep", "index.js"), "export const dep = true;\n");
		mkdirSync(join(tempDir, ".venv", "lib", "python3.13", "site-packages", "click"), { recursive: true });
		writeFileSync(
			join(tempDir, ".venv", "lib", "python3.13", "site-packages", "click", "exceptions.py"),
			"class ClickException(Exception):\n    pass\n",
		);
		mkdirSync(join(tempDir, "venv", "lib", "python3.13", "site_packages", "example"), { recursive: true });
		writeFileSync(join(tempDir, "venv", "lib", "python3.13", "site_packages", "example", "module.py"), "x = 1\n");
		mkdirSync(join(tempDir, "dist"), { recursive: true });
		writeFileSync(join(tempDir, "dist", "bundle.js"), "export const bundled = true;\n");
		mkdirSync(join(tempDir, "packages", "demo", "build"), { recursive: true });
		writeFileSync(join(tempDir, "packages", "demo", "build", "generated.js"), "export const built = true;\n");
		mkdirSync(join(tempDir, "coverage"), { recursive: true });
		writeFileSync(join(tempDir, "coverage", "summary.json"), '{"covered":true}\n');
		mkdirSync(join(tempDir, "testing", "harbor"), { recursive: true });
		writeFileSync(join(tempDir, "testing", "harbor", "registry.json"), '{"benchmark":true}\n');
		mkdirSync(join(tempDir, "testing", "terminal-bench-2", "sample"), { recursive: true });
		writeFileSync(join(tempDir, "testing", "terminal-bench-2", "sample", "solution.sh"), "#!/bin/sh\ntrue\n");
		mkdirSync(join(tempDir, "testing", "results", "run"), { recursive: true });
		writeFileSync(join(tempDir, "testing", "results", "run", "output.json"), '{"result":true}\n');
		mkdirSync(join(tempDir, ".tmp", "plugins"), { recursive: true });
		writeFileSync(join(tempDir, ".tmp", "plugins", "scratch.ts"), "export const scratch = true;\n");
		mkdirSync(join(tempDir, "cache"), { recursive: true });
		writeFileSync(join(tempDir, "cache", "cached.json"), '{"cached":true}\n');
		writeFileSync(join(tempDir, "package-lock.json"), '{"lockfileVersion":3}\n');
		writeFileSync(join(tempDir, "src", "schema.generated.ts"), "export const generated = true;\n");

		const { files, failedFiles } = await collectLocalFileStates(tempDir);

		expect(failedFiles).toEqual([]);
		expect(files.map((file) => file.filePath)).toEqual(["src/app.ts"]);
	});

	semanticWorkspaceIt(
		"does not reread unchanged indexed files when stat metadata matches",
		async () => {
			writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 'alpha';\n");
			await initSemanticWorkspace(tempDir);
			const workspace = loadInitializedWorkspace(tempDir);
			const runtime = await createRuntimeOrSkip(
				{
					databaseDir: workspace.databaseDir,
					workspaceRoot: tempDir,
					host: workspace.embeddingHost,
					model: workspace.embeddingModel,
				},
				"unchanged stat metadata test",
			);
			if (!runtime) return;

			const firstSync = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "unchanged stat metadata initial semantic sync",
				reasonPrefix: "Semantic initial sync unavailable for unchanged stat metadata test",
			});
			if (!firstSync) return;
			const before = await semanticSetupOrSkip(() => runtime.listIndexedFiles(), {
				label: "unchanged stat metadata manifest read before no-op sync",
				reasonPrefix: "Semantic manifest read unavailable for unchanged stat metadata test",
			});
			if (!before) return;
			const second = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "unchanged stat metadata no-op semantic sync",
				reasonPrefix: "Semantic no-op sync unavailable for unchanged stat metadata test",
			});
			if (!second) return;
			const after = await semanticSetupOrSkip(() => runtime.listIndexedFiles(), {
				label: "unchanged stat metadata manifest read after no-op sync",
				reasonPrefix: "Semantic manifest read unavailable after unchanged stat metadata sync",
			});
			if (!after) return;

			expect(second.changedFiles).toBe(0);
			expect(second.unchangedFiles).toBe(1);
			expect(second.statUnchangedFiles).toBe(1);
			expect(second.hashedFiles).toBe(0);
			expect(after).toEqual(before);
		},
		120_000,
	);

	semanticWorkspaceIt(
		"syncs many files correctly with concurrent scanning",
		async () => {
			runGit(["init"], tempDir);
			for (let index = 0; index < 50; index += 1) {
				writeFileSync(join(tempDir, "src", `file-${index}.ts`), `export const value${index} = ${index};\n`);
			}
			runGit(["add", "src"], tempDir);
			await initSemanticWorkspace(tempDir);
			const workspace = loadInitializedWorkspace(tempDir);
			const runtime = await createRuntimeOrSkip(
				{
					databaseDir: workspace.databaseDir,
					workspaceRoot: tempDir,
				},
				"concurrent scanning test",
			);
			if (!runtime) return;
			const result = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "concurrent scanning semantic sync",
				reasonPrefix: "Semantic sync unavailable for concurrent scanning test",
			});
			if (!result) return;
			const indexedFiles = await semanticSetupOrSkip(() => runtime.listIndexedFiles(), {
				label: "concurrent scanning indexed-file manifest read",
				reasonPrefix: "Semantic manifest read unavailable for concurrent scanning test",
			});
			if (!indexedFiles) return;
			expect(result.changedFiles).toBe(50);
			expect(indexedFiles.map((file) => file.filePath)).toHaveLength(50);
		},
		120_000,
	);

	semanticWorkspaceIt(
		"reports chunk batch progress while inserting changed chunks",
		async () => {
			for (let index = 0; index < 3; index += 1) {
				writeFileSync(
					join(tempDir, "src", `file-${index}.ts`),
					Array.from({ length: 100 }, (_, line) => `export const x${line} = ${line};`).join("\n"),
				);
			}
			await initSemanticWorkspace(tempDir);
			const workspace = loadInitializedWorkspace(tempDir);
			const runtime = await createRuntimeOrSkip(
				{
					databaseDir: workspace.databaseDir,
					workspaceRoot: tempDir,
				},
				"chunk batch progress test",
			);
			if (!runtime) return;
			const progress: any[] = [];
			const result = await semanticSetupOrSkip(() => runtime.sync((event) => progress.push(event)), {
				label: "chunk batch progress semantic sync",
				reasonPrefix: "Semantic sync unavailable for chunk batch progress test",
			});
			if (!result) return;
			expect(progress.some((event) => event.embeddingBatchesTotal && event.embeddingBatchesCompleted != null)).toBe(
				true,
			);
		},
		120_000,
	);

	semanticWorkspaceIt(
		"skips index refresh for no-op syncs when indexes already exist",
		async () => {
			writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 1;\n");
			await initSemanticWorkspace(tempDir);
			const workspace = loadInitializedWorkspace(tempDir);
			const runtime = await createRuntimeOrSkip(
				{
					databaseDir: workspace.databaseDir,
					workspaceRoot: tempDir,
				},
				"no-op index refresh test",
			);
			if (!runtime) return;
			const firstSync = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "no-op index refresh initial semantic sync",
				reasonPrefix: "Semantic initial sync unavailable for no-op index refresh test",
			});
			if (!firstSync) return;
			const progress: any[] = [];
			const secondSync = await semanticSetupOrSkip(() => runtime.sync((event) => progress.push(event)), {
				label: "no-op index refresh second semantic sync",
				reasonPrefix: "Semantic no-op sync unavailable for no-op index refresh test",
			});
			if (!secondSync) return;
			expect(progress.some((event) => event.phase === "indexing" && /skipped/i.test(event.message))).toBe(true);
		},
		120_000,
	);

	semanticWorkspaceIt(
		"preserves unchanged indexed files across incremental syncs",
		async () => {
			writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 'alpha';\n");
			writeFileSync(join(tempDir, "src", "b.ts"), "export const b = 'bravo';\n");
			writeFileSync(join(tempDir, "src", "c.ts"), "export const c = 'charlie';\n");

			await initSemanticWorkspace(tempDir);
			const workspace = loadInitializedWorkspace(tempDir);
			const runtime = await createRuntimeOrSkip(
				{
					databaseDir: workspace.databaseDir,
					workspaceRoot: tempDir,
					host: workspace.embeddingHost,
					model: workspace.embeddingModel,
				},
				"incremental preservation test",
			);
			if (!runtime) return;

			const firstSync = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "incremental preservation initial semantic sync",
				reasonPrefix: "Semantic initial sync unavailable for incremental preservation test",
			});
			if (!firstSync) return;
			expect(firstSync.changedFiles).toBe(3);
			expect(firstSync.unchangedFiles).toBe(0);

			const firstManifest = await semanticSetupOrSkip(() => runtime.listIndexedFiles(), {
				label: "incremental preservation initial manifest read",
				reasonPrefix: "Semantic initial manifest read unavailable for incremental preservation test",
			});
			if (!firstManifest) return;
			expect(firstManifest).toHaveLength(3);
			const firstA = firstManifest.find((file) => file.filePath === "src/a.ts");
			const firstC = firstManifest.find((file) => file.filePath === "src/c.ts");
			expect(firstA).toBeDefined();
			expect(firstC).toBeDefined();

			writeFileSync(join(tempDir, "src", "b.ts"), "export const b = 'beta';\n");

			const secondSync = await semanticSetupOrSkip(() => runtime.sync(), {
				label: "incremental preservation second semantic sync",
				reasonPrefix: "Semantic second sync unavailable for incremental preservation test",
			});
			if (!secondSync) return;
			expect(secondSync.changedFiles).toBe(1);
			expect(secondSync.deletedFiles).toBe(0);
			expect(secondSync.unchangedFiles).toBe(2);

			const secondManifest = await semanticSetupOrSkip(() => runtime.listIndexedFiles(), {
				label: "incremental preservation second manifest read",
				reasonPrefix: "Semantic second manifest read unavailable for incremental preservation test",
			});
			if (!secondManifest) return;
			expect(secondManifest).toHaveLength(3);
			const secondA = secondManifest.find((file) => file.filePath === "src/a.ts");
			const secondC = secondManifest.find((file) => file.filePath === "src/c.ts");
			const secondB = secondManifest.find((file) => file.filePath === "src/b.ts");
			expect(secondA).toEqual(firstA);
			expect(secondC).toEqual(firstC);
			expect(secondB?.fileHash).not.toBe(firstManifest.find((file) => file.filePath === "src/b.ts")?.fileHash);
		},
		120_000,
	);
});
