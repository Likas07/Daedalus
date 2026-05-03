import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SemanticStoreConfig } from "../src/extensions/daedalus/tools/semantic-store.js";

const mockState = {
	operations: [] as string[],
	failEmbedding: false,
};

vi.mock("../src/extensions/daedalus/tools/semantic-embedder.js", () => ({
	createOllamaSemanticEmbedder: async () => ({
		async getModelInfo() {
			return { provider: "mock", model: "mock-embed", dimension: 3, host: "mock-host" };
		},
		async embedDocuments(
			texts: string[],
			options?: {
				onBatch?: (metrics: {
					batchIndex: number;
					batchSize: number;
					elapsedMs: number;
					completedTexts: number;
					totalTexts: number;
					concurrency: number;
				}) => void;
			},
		) {
			mockState.operations.push("embed");
			if (mockState.failEmbedding) throw new Error("The operation timed out");
			options?.onBatch?.({
				batchIndex: 0,
				batchSize: texts.length,
				elapsedMs: 1,
				completedTexts: texts.length,
				totalTexts: texts.length,
				concurrency: 1,
			});
			return texts.map(() => [1, 2, 3]);
		},
	}),
	registerOllamaEmbeddingFunction: async () => "mock-alias",
	getRegisteredOllamaEmbeddingFunctionName: () => "mock-embedding-function",
}));

vi.mock("../src/extensions/daedalus/tools/semantic-lancedb.js", () => ({
	openSemanticLanceStore: async () => ({
		async replaceChunks() {},
		async insertChunks() {},
		async insertEmbeddedChunks() {
			mockState.operations.push("insert");
		},
		async deleteChunksForFiles(filePaths: string[]) {
			if (filePaths.length > 0) mockState.operations.push("delete-chunks");
			return filePaths.length > 0 ? 1 : 0;
		},
		async deleteAllChunks() {},
		async listIndexedFiles() {
			return [
				{
					filePath: "src/a.ts",
					fileHash: "old-hash",
					fileSize: 1,
					modifiedMs: 1,
					chunkCount: 1,
					indexedAt: 1,
				},
			];
		},
		async upsertIndexedFiles() {
			mockState.operations.push("upsert-manifest");
		},
		async deleteIndexedFiles(filePaths: string[]) {
			if (filePaths.length > 0) mockState.operations.push("delete-manifest");
		},
		async deleteAllIndexedFiles() {},
		async ensureIndexes() {
			mockState.operations.push("ensure-indexes");
		},
		async search() {
			return [];
		},
		async info() {
			return {
				databaseDir: "mock-db",
				tableName: "semantic_chunks",
				manifestTableName: "semantic_indexed_files",
				rowCount: 1,
				manifestRowCount: 1,
				vectorIndexName: "vector_idx",
				ftsIndexName: "fts_idx",
			};
		},
	}),
}));

const { createSemanticStoreRuntime } = await import("../src/extensions/daedalus/tools/semantic-store.js");

describe("semantic store sync write ordering", () => {
	let tempDir: string;

	beforeEach(() => {
		mockState.operations.length = 0;
		mockState.failEmbedding = false;
		tempDir = join(tmpdir(), `daedalus-semantic-store-order-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(join(tempDir, "src", "a.ts"), "export const a = 'new content';\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	async function createRuntime() {
		const config: SemanticStoreConfig = {
			databaseDir: join(tempDir, ".semantic"),
			workspaceRoot: tempDir,
		};
		return await createSemanticStoreRuntime(config);
	}

	it("embeds changed chunks before deleting stale rows", async () => {
		const runtime = await createRuntime();

		await runtime.sync();

		expect(mockState.operations.indexOf("embed")).toBeLessThan(mockState.operations.indexOf("delete-chunks"));
		expect(mockState.operations).toEqual([
			"embed",
			"delete-chunks",
			"delete-manifest",
			"insert",
			"upsert-manifest",
			"ensure-indexes",
		]);
	});

	it("does not delete stale rows when embedding fails and preserves timeout context", async () => {
		mockState.failEmbedding = true;
		const runtime = await createRuntime();

		await expect(runtime.sync()).rejects.toThrow(
			"Semantic embedding failed while preparing chunk batch 1/1 for src/a.ts (1 text): The operation timed out",
		);
		expect(mockState.operations).toEqual(["embed"]);
	});
});
