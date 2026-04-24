import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectLocalFileStates, createSemanticStoreRuntime } from "../src/extensions/daedalus/tools/semantic-store.js";
import { buildSemanticSyncPlan } from "../src/extensions/daedalus/tools/semantic-sync-plan.js";
import type { SemanticIndexedFile, SemanticLocalFileState } from "../src/extensions/daedalus/tools/semantic-types.js";
import { initSemanticWorkspace, loadSemanticWorkspace } from "../src/extensions/daedalus/tools/semantic-workspace.js";

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
		expect(second.statUnchangedFiles).toBe(1);
		expect(second.hashedFiles).toBe(0);
		expect(await runtime.listIndexedFiles()).toEqual(before);
	});

	it("syncs many files correctly with concurrent scanning", async () => {
		runGit(["init"], tempDir);
		for (let index = 0; index < 50; index += 1) {
			writeFileSync(join(tempDir, "src", `file-${index}.ts`), `export const value${index} = ${index};\n`);
		}
		runGit(["add", "src"], tempDir);
		await initSemanticWorkspace(tempDir);
		const workspace = loadSemanticWorkspace(tempDir)!;
		const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
		const result = await runtime.sync();
		expect(result.changedFiles).toBe(50);
		expect((await runtime.listIndexedFiles()).map((file) => file.filePath)).toHaveLength(50);
	});

	it("reports chunk batch progress while inserting changed chunks", async () => {
		for (let index = 0; index < 3; index += 1) {
			writeFileSync(
				join(tempDir, "src", `file-${index}.ts`),
				Array.from({ length: 100 }, (_, line) => `export const x${line} = ${line};`).join("\n"),
			);
		}
		await initSemanticWorkspace(tempDir);
		const workspace = loadSemanticWorkspace(tempDir)!;
		const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
		const progress: any[] = [];
		await runtime.sync((event) => progress.push(event));
		expect(progress.some((event) => event.embeddingBatchesTotal && event.embeddingBatchesCompleted != null)).toBe(
			true,
		);
	}, 15000);

	it("skips index refresh for no-op syncs when indexes already exist", async () => {
		writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 1;\n");
		await initSemanticWorkspace(tempDir);
		const workspace = loadSemanticWorkspace(tempDir)!;
		const runtime = await createSemanticStoreRuntime({ databaseDir: workspace.databaseDir, workspaceRoot: tempDir });
		await runtime.sync();
		const progress: any[] = [];
		await runtime.sync((event) => progress.push(event));
		expect(progress.some((event) => event.phase === "indexing" && /skipped/i.test(event.message))).toBe(true);
	}, 15000);

	it("preserves unchanged indexed files across incremental syncs", async () => {
		writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 'alpha';\n");
		writeFileSync(join(tempDir, "src", "b.ts"), "export const b = 'bravo';\n");
		writeFileSync(join(tempDir, "src", "c.ts"), "export const c = 'charlie';\n");

		await initSemanticWorkspace(tempDir);
		const workspace = loadSemanticWorkspace(tempDir);
		expect(workspace).toBeDefined();
		const runtime = await createSemanticStoreRuntime({
			databaseDir: workspace!.databaseDir,
			workspaceRoot: tempDir,
			host: workspace!.embeddingHost,
			model: workspace!.embeddingModel,
		});

		const firstSync = await runtime.sync();
		expect(firstSync.changedFiles).toBe(3);
		expect(firstSync.unchangedFiles).toBe(0);

		const firstManifest = await runtime.listIndexedFiles();
		expect(firstManifest).toHaveLength(3);
		const firstA = firstManifest.find((file) => file.filePath === "src/a.ts");
		const firstC = firstManifest.find((file) => file.filePath === "src/c.ts");
		expect(firstA).toBeDefined();
		expect(firstC).toBeDefined();

		writeFileSync(join(tempDir, "src", "b.ts"), "export const b = 'beta';\n");

		const secondSync = await runtime.sync();
		expect(secondSync.changedFiles).toBe(1);
		expect(secondSync.deletedFiles).toBe(0);
		expect(secondSync.unchangedFiles).toBe(2);

		const secondManifest = await runtime.listIndexedFiles();
		expect(secondManifest).toHaveLength(3);
		const secondA = secondManifest.find((file) => file.filePath === "src/a.ts");
		const secondC = secondManifest.find((file) => file.filePath === "src/c.ts");
		const secondB = secondManifest.find((file) => file.filePath === "src/b.ts");
		expect(secondA).toEqual(firstA);
		expect(secondC).toEqual(firstC);
		expect(secondB?.fileHash).not.toBe(firstManifest.find((file) => file.filePath === "src/b.ts")?.fileHash);
	});
});
