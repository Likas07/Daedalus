import * as lancedb from "@lancedb/lancedb";
import { getRegistry, LanceSchema } from "@lancedb/lancedb/embedding";
import { Float64, Int32, Utf8 } from "apache-arrow";
import { getRegisteredOllamaEmbeddingFunctionName } from "./semantic-embedder.js";
import type { SemanticStoreProgress } from "./semantic-store.js";
import type { SemanticChunk, SemanticIndexedFile, SemanticSearchHit, SemanticSearchRequest } from "./semantic-types.js";

const DEFAULT_CHUNK_TABLE_NAME = "semantic_chunks";
const DEFAULT_MANIFEST_TABLE_NAME = "semantic_indexed_files";

interface OpenSemanticLanceStoreOptions {
	databaseDir: string;
	embeddingFunctionAlias: string;
	vectorDimension?: number;
	tableName?: string;
	manifestTableName?: string;
}

export interface SemanticLanceStoreInfo {
	databaseDir: string;
	tableName: string;
	manifestTableName: string;
	rowCount: number;
	manifestRowCount: number;
	vectorIndexName?: string;
	ftsIndexName?: string;
}

export interface EmbeddedSemanticChunk extends SemanticChunk {
	vector: number[];
}

export interface SemanticLanceStore {
	replaceChunks(chunks: SemanticChunk[], onProgress?: (progress: SemanticStoreProgress) => void): Promise<void>;
	insertChunks(chunks: SemanticChunk[]): Promise<void>;
	insertEmbeddedChunks(chunks: EmbeddedSemanticChunk[]): Promise<void>;
	deleteChunksForFiles(filePaths: string[]): Promise<number>;
	deleteAllChunks(): Promise<void>;
	listIndexedFiles(): Promise<SemanticIndexedFile[]>;
	upsertIndexedFiles(files: SemanticIndexedFile[]): Promise<void>;
	deleteIndexedFiles(filePaths: string[]): Promise<void>;
	deleteAllIndexedFiles(): Promise<void>;
	ensureIndexes(onProgress?: (progress: SemanticStoreProgress) => void): Promise<void>;
	search(request: SemanticSearchRequest & { pathPrefix?: string; glob?: string }): Promise<SemanticSearchHit[]>;
	info(): Promise<SemanticLanceStoreInfo>;
}

function globToRegExp(glob: string): RegExp {
	return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
}

function snippetFromContent(content: string): string {
	return content.trimEnd();
}

function toNumberedFrom(content: string, startLine: number): string {
	return content
		.split(/\r?\n/)
		.map((line, index) => `${startLine + index}:${line}`)
		.join("\n");
}

function escapeSqlString(value: string): string {
	return value.replace(/'/g, "''");
}

function filePathPredicate(filePaths: string[]): string {
	return filePaths.length === 1
		? `file_path = '${escapeSqlString(filePaths[0])}'`
		: `file_path IN (${filePaths.map((filePath) => `'${escapeSqlString(filePath)}'`).join(", ")})`;
}

function mapChunkRows(chunks: SemanticChunk[]): Array<Record<string, unknown>> {
	return chunks.map((chunk) => ({
		chunk_id: chunk.chunkId,
		file_path: chunk.filePath,
		language: chunk.language ?? "",
		content: chunk.content,
		search_text: `${chunk.filePath}\n${chunk.content}`,
		start_line: chunk.startLine,
		end_line: chunk.endLine,
		content_hash: chunk.contentHash,
	}));
}

function mapEmbeddedChunkRows(chunks: EmbeddedSemanticChunk[]): Array<Record<string, unknown>> {
	return chunks.map((chunk) => ({
		chunk_id: chunk.chunkId,
		file_path: chunk.filePath,
		language: chunk.language ?? "",
		content: chunk.content,
		search_text: `${chunk.filePath}\n${chunk.content}`,
		vector: chunk.vector,
		start_line: chunk.startLine,
		end_line: chunk.endLine,
		content_hash: chunk.contentHash,
	}));
}

function mapIndexedFileRows(files: SemanticIndexedFile[]): Array<Record<string, unknown>> {
	return files.map((file) => ({
		file_path: file.filePath,
		file_hash: file.fileHash,
		file_size: file.fileSize,
		modified_ms: file.modifiedMs,
		chunk_count: file.chunkCount,
		indexed_at: file.indexedAt,
	}));
}

export async function openSemanticLanceStore(options: OpenSemanticLanceStoreOptions): Promise<SemanticLanceStore> {
	const db = await lancedb.connect(options.databaseDir);
	const tableName = options.tableName ?? DEFAULT_CHUNK_TABLE_NAME;
	const manifestTableName = options.manifestTableName ?? DEFAULT_MANIFEST_TABLE_NAME;
	const existingTables = await db.tableNames();
	let chunkTable: lancedb.Table;
	let manifestTable: lancedb.Table;

	if (existingTables.includes(tableName)) {
		chunkTable = await db.openTable(tableName);
	} else {
		const func = await getRegistry()
			.get(getRegisteredOllamaEmbeddingFunctionName())!
			.create({ alias: options.embeddingFunctionAlias });
		const schema = LanceSchema({
			chunk_id: new Utf8(),
			file_path: new Utf8(),
			language: new Utf8(),
			content: new Utf8(),
			search_text: func.sourceField(new Utf8()),
			vector: func.vectorField(),
			start_line: new Int32(),
			end_line: new Int32(),
			content_hash: new Utf8(),
		});
		chunkTable = await db.createEmptyTable(tableName, schema, { mode: "overwrite" });
	}

	if (existingTables.includes(manifestTableName)) {
		manifestTable = await db.openTable(manifestTableName);
	} else {
		const manifestSchema = LanceSchema({
			file_path: new Utf8(),
			file_hash: new Utf8(),
			file_size: new Float64(),
			modified_ms: new Float64(),
			chunk_count: new Int32(),
			indexed_at: new Float64(),
		});
		manifestTable = await db.createEmptyTable(manifestTableName, manifestSchema, { mode: "overwrite" });
	}

	async function ensureChunkIndexes(onProgress?: (progress: SemanticStoreProgress) => void): Promise<void> {
		const indices = await chunkTable.listIndices();
		const names = new Set(indices.map((index) => index.name));
		if (!names.has("search_text_idx")) {
			onProgress?.({ phase: "indexing", message: "Building full-text search index", elapsedMs: 0 });
			await chunkTable.createIndex("search_text", { config: lancedb.Index.fts() });
		}
		if (!names.has("vector_idx") && (await chunkTable.countRows()) > 0) {
			onProgress?.({ phase: "indexing", message: "Building vector index", elapsedMs: 0 });
			await chunkTable.createIndex("vector", { config: lancedb.Index.ivfFlat({ distanceType: "cosine" }) });
		}
	}

	return {
		async replaceChunks(chunks: SemanticChunk[], onProgress): Promise<void> {
			onProgress?.({
				phase: "writing",
				message: `Persisting ${chunks.length} semantic chunk${chunks.length === 1 ? "" : "s"}`,
				chunks: chunks.length,
				elapsedMs: 0,
			});
			await chunkTable.add(mapChunkRows(chunks), { mode: "overwrite" });
			onProgress?.({ phase: "indexing", message: "Refreshing search indexes", chunks: chunks.length, elapsedMs: 0 });
			await ensureChunkIndexes(onProgress);
		},

		async insertChunks(chunks: SemanticChunk[]): Promise<void> {
			if (chunks.length === 0) return;
			await chunkTable.add(mapChunkRows(chunks));
		},

		async insertEmbeddedChunks(chunks: EmbeddedSemanticChunk[]): Promise<void> {
			if (chunks.length === 0) return;
			await chunkTable.add(mapEmbeddedChunkRows(chunks));
		},

		async deleteChunksForFiles(filePaths: string[]): Promise<number> {
			if (filePaths.length === 0) return 0;
			const before = await chunkTable.countRows();
			await chunkTable.delete(filePathPredicate(filePaths));
			const after = await chunkTable.countRows();
			return Math.max(0, before - after);
		},

		async deleteAllChunks(): Promise<void> {
			await chunkTable.delete("true");
		},

		async listIndexedFiles(): Promise<SemanticIndexedFile[]> {
			const rows = (await manifestTable
				.query()
				.select(["file_path", "file_hash", "file_size", "modified_ms", "chunk_count", "indexed_at"])
				.toArray()) as Array<Record<string, unknown>>;
			return rows.map((row) => ({
				filePath: String(row.file_path),
				fileHash: String(row.file_hash),
				fileSize: Number(row.file_size),
				modifiedMs: Number(row.modified_ms),
				chunkCount: Number(row.chunk_count),
				indexedAt: Number(row.indexed_at),
			}));
		},

		async upsertIndexedFiles(files: SemanticIndexedFile[]): Promise<void> {
			if (files.length === 0) return;
			await manifestTable.delete(filePathPredicate(files.map((file) => file.filePath)));
			await manifestTable.add(mapIndexedFileRows(files));
		},

		async deleteIndexedFiles(filePaths: string[]): Promise<void> {
			if (filePaths.length === 0) return;
			await manifestTable.delete(filePathPredicate(filePaths));
		},

		async deleteAllIndexedFiles(): Promise<void> {
			await manifestTable.delete("true");
		},

		async ensureIndexes(onProgress?: (progress: SemanticStoreProgress) => void): Promise<void> {
			await ensureChunkIndexes(onProgress);
		},

		async search(request): Promise<SemanticSearchHit[]> {
			await ensureChunkIndexes();
			const searchInput = request.useCase ? `${request.query} ${request.useCase}` : request.query;
			const rawRows = (await chunkTable
				.search(searchInput, "hybrid", ["search_text"])
				.limit(Math.max(request.topK ?? request.limit ?? 10, request.limit ?? 10))
				.toArray()) as Array<Record<string, unknown>>;

			const globPattern = request.glob ? globToRegExp(request.glob) : undefined;
			const filtered = rawRows.filter((row) => {
				const filePath = String(row.file_path);
				if (request.pathPrefix && !filePath.startsWith(request.pathPrefix)) return false;
				if (request.startsWith && !filePath.startsWith(request.startsWith)) return false;
				if (
					request.endsWith &&
					request.endsWith.length > 0 &&
					!request.endsWith.some((suffix: string) => filePath.endsWith(suffix))
				)
					return false;
				if (globPattern && !globPattern.test(filePath.split("/").pop() ?? filePath)) return false;
				return true;
			});

			return filtered.slice(0, request.limit ?? 10).map((row) => ({
				chunkId: String(row.chunk_id),
				filePath: String(row.file_path),
				startLine: Number(row.start_line),
				endLine: Number(row.end_line),
				snippet: toNumberedFrom(snippetFromContent(String(row.content)), Number(row.start_line)),
				relevanceScore: Number(row._relevance_score ?? 0),
				distance: row._distance == null ? undefined : Number(row._distance),
				language: row.language ? String(row.language) : undefined,
				contentHash: String(row.content_hash),
			}));
		},

		async info(): Promise<SemanticLanceStoreInfo> {
			const indices = await chunkTable.listIndices();
			return {
				databaseDir: options.databaseDir,
				tableName,
				manifestTableName,
				rowCount: await chunkTable.countRows(),
				manifestRowCount: await manifestTable.countRows(),
				vectorIndexName: indices.find((index: any) => index.name === "vector_idx")?.name,
				ftsIndexName: indices.find((index: any) => index.name === "search_text_idx")?.name,
			};
		},
	};
}
