import { createHash } from "node:crypto";
import { type Stats, statSync } from "node:fs";
import path from "node:path";
import { chunkDocument } from "./semantic-chunking.js";
import {
	DEFAULT_OLLAMA_EMBED_MODEL,
	DEFAULT_OLLAMA_HOST,
	resolveSemanticChunkMaxLines,
	resolveSemanticChunkOverlapLines,
	resolveSemanticIndexProfile,
	resolveSemanticInsertChunkBatchSize,
	resolveSemanticScanConcurrency,
	type SemanticIndexProfile,
} from "./semantic-config.js";
import { createOllamaSemanticEmbedder, registerOllamaEmbeddingFunction } from "./semantic-embedder.js";
import {
	discoverSemanticFiles,
	discoverSemanticFilesFdDefault,
	type SemanticDiscoveryResult,
	semanticContentSkipReason,
	semanticSizeLimit,
} from "./semantic-file-discovery.js";
import { openSemanticLanceStore } from "./semantic-lancedb.js";
import { buildSemanticSyncPlan } from "./semantic-sync-plan.js";
import type {
	SemanticChunk,
	SemanticIndexedFile,
	SemanticLocalFileState,
	SemanticSearchHit,
	SemanticSkipCounts,
	SemanticSyncPlan,
} from "./semantic-types.js";

const SEMANTIC_DEBUG_ENV = "DAEDALUS_SEMANTIC_DEBUG";

function semanticDebugEnabled(): boolean {
	const value = process.env[SEMANTIC_DEBUG_ENV]?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function semanticDebug(scope: string, message: string, details?: Record<string, unknown>): void {
	if (!semanticDebugEnabled()) return;
	const timestamp = new Date().toISOString();
	const suffix = details ? ` ${JSON.stringify(details)}` : "";
	console.error(`[semantic-debug ${timestamp}] ${scope}: ${message}${suffix}`);
}

export interface SemanticStoreConfig {
	databaseDir: string;
	workspaceRoot: string;
	host?: string;
	model?: string;
	indexProfile?: SemanticIndexProfile;
}

export interface SemanticStoreProgress {
	phase: "preparing" | "scanning" | "writing" | "indexing" | "complete";
	message: string;
	processedFiles?: number;
	totalFiles?: number;
	chunks?: number;
	totalChunksPlanned?: number;
	currentFile?: string;
	elapsedMs: number;
	etaMs?: number;
	embeddingEtaMs?: number;
	changedFiles?: number;
	deletedFiles?: number;
	unchangedFiles?: number;
	failedFiles?: number;
	insertedChunks?: number;
	removedChunks?: number;
	skippedByReason?: SemanticSkipCounts;
	skippedFiles?: number;
	statUnchangedFiles?: number;
	hashedFiles?: number;
	embeddingBatchesCompleted?: number;
	embeddingBatchesTotal?: number;
	writeSubphase?: "planning" | "deleting-stale" | "embedding-writing" | "manifest" | "indexing";
}

export interface SemanticStoreSyncResult {
	chunks: number;
	insertedChunks: number;
	removedChunks: number;
	changedFiles: number;
	deletedFiles: number;
	unchangedFiles: number;
	failedFiles: number;
	scannedFiles: number;
	storePath: string;
	provider: string;
	model: string;
	host: string;
	dimension: number;
	vectorIndexName?: string;
	ftsIndexName?: string;
	manifestTableName?: string;
	skippedByReason?: SemanticSkipCounts;
	skippedFiles?: number;
	statUnchangedFiles?: number;
	hashedFiles?: number;
	indexProfile?: SemanticIndexProfile;
}

function toPosix(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

async function readTextFile(filePath: string): Promise<string | undefined> {
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(filePath);
	} catch {
		return undefined;
	}
	if (!stats.isFile()) return undefined;
	if (stats.size > semanticSizeLimit(filePath)) return undefined;
	try {
		const file = Bun.file(filePath);
		const content = await file.text();
		if (content.includes("\u0000")) return undefined;
		return content;
	} catch {
		return undefined;
	}
}

async function computeFileHash(filePath: string): Promise<string | undefined> {
	const content = await readTextFile(filePath);
	if (content === undefined) return undefined;
	return createHash("sha256").update(content).digest("hex");
}

function indexedFileMatchesStat(indexed: SemanticIndexedFile, stats: Stats): boolean {
	return indexed.fileSize === stats.size && indexed.modifiedMs === Math.trunc(stats.mtimeMs);
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (nextIndex < items.length) {
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await worker(items[index], index);
			}
		}),
	);
	return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

function skippedFiles(discovery: SemanticDiscoveryResult): number {
	return Object.values(discovery.skippedByReason).reduce((sum, count) => sum + (count ?? 0), 0);
}

function incrementSkip(counts: SemanticSkipCounts, reason: keyof SemanticSkipCounts): void {
	counts[reason] = (counts[reason] ?? 0) + 1;
}

export async function collectLocalFileStates(
	workspaceRoot: string,
	candidateFiles?: string[],
	options: { indexedFiles?: SemanticIndexedFile[]; scanConcurrency?: number } = {},
): Promise<{
	files: SemanticLocalFileState[];
	failedFiles: Array<{ filePath: string; reason: string }>;
	statUnchangedFiles: number;
	hashedFiles: number;
}> {
	const files: SemanticLocalFileState[] = [];
	const failedFiles: Array<{ filePath: string; reason: string }> = [];
	let statUnchangedFiles = 0;
	let hashedFiles = 0;
	const indexedByPath = new Map((options.indexedFiles ?? []).map((file) => [file.filePath, file]));
	const candidates = candidateFiles ?? discoverSemanticFiles(workspaceRoot).files;
	const results = await mapWithConcurrency(
		candidates,
		options.scanConcurrency ?? resolveSemanticScanConcurrency(),
		async (absolutePath) => {
			const filePath = toPosix(path.relative(workspaceRoot, absolutePath));
			let stats: ReturnType<typeof statSync>;
			try {
				stats = statSync(absolutePath);
			} catch (error) {
				return { failed: { filePath, reason: error instanceof Error ? error.message : String(error) } };
			}
			if (!stats.isFile()) return { failed: { filePath, reason: "not a regular file" } };
			const indexed = indexedByPath.get(filePath);
			if (indexed && indexedFileMatchesStat(indexed, stats)) {
				return {
					file: {
						filePath,
						fileHash: indexed.fileHash,
						fileSize: stats.size,
						modifiedMs: Math.trunc(stats.mtimeMs),
					},
					statUnchanged: true,
				};
			}
			const contentSkipReason = semanticContentSkipReason(absolutePath);
			if (contentSkipReason) return { contentSkipped: true };
			const fileHash = await computeFileHash(absolutePath);
			if (!fileHash) return { failed: { filePath, reason: "file could not be read as UTF-8 text" } };
			return {
				file: { filePath, fileHash, fileSize: stats.size, modifiedMs: Math.trunc(stats.mtimeMs) },
				hashed: true,
			};
		},
	);
	for (const result of results) {
		if (result.file) files.push(result.file);
		if (result.failed) failedFiles.push(result.failed);
		if (result.statUnchanged) statUnchangedFiles += 1;
		if (result.hashed) hashedFiles += 1;
	}
	return {
		files: files.sort((a, b) => a.filePath.localeCompare(b.filePath)),
		failedFiles: failedFiles.sort((a, b) => a.filePath.localeCompare(b.filePath)),
		statUnchangedFiles,
		hashedFiles,
	};
}

export interface SemanticStoreRuntime {
	sync(onProgress?: (progress: SemanticStoreProgress) => void): Promise<SemanticStoreSyncResult>;
	search(options: {
		query: string;
		useCase?: string;
		limit?: number;
		topK?: number;
		pathPrefix?: string;
		glob?: string;
		startsWith?: string;
		endsWith?: string[];
	}): Promise<SemanticSearchHit[]>;
	listIndexedFiles(): Promise<SemanticIndexedFile[]>;
	planSync(): Promise<{
		localFiles: SemanticLocalFileState[];
		indexedFiles: SemanticIndexedFile[];
		plan: SemanticSyncPlan;
	}>;
}

export async function createSemanticStoreRuntime(config: SemanticStoreConfig): Promise<SemanticStoreRuntime> {
	const embedder = await createOllamaSemanticEmbedder({
		host: config.host ?? DEFAULT_OLLAMA_HOST,
		model: config.model ?? DEFAULT_OLLAMA_EMBED_MODEL,
	});
	const alias = await registerOllamaEmbeddingFunction(embedder);
	const store = await openSemanticLanceStore({ databaseDir: config.databaseDir, embeddingFunctionAlias: alias });

	return {
		async sync(onProgress) {
			const startedAt = Date.now();
			const profile = config.indexProfile ?? resolveSemanticIndexProfile();
			const emitProgress = (progress: Omit<SemanticStoreProgress, "elapsedMs">): void => {
				onProgress?.({ ...progress, elapsedMs: Date.now() - startedAt });
			};
			semanticDebug("semantic-store.sync", "starting sync", {
				workspaceRoot: config.workspaceRoot,
				databaseDir: config.databaseDir,
				model: config.model ?? DEFAULT_OLLAMA_EMBED_MODEL,
				host: config.host ?? DEFAULT_OLLAMA_HOST,
				profile,
			});
			const discovery = await discoverSemanticFilesFdDefault(config.workspaceRoot, {
				profile,
				skipContentHeuristics: true,
			});
			const candidateFiles = discovery.files;
			const skippedByReason: SemanticSkipCounts = { ...discovery.skippedByReason };
			let skipped = skippedFiles(discovery);
			emitProgress({
				phase: "preparing",
				message: `Preparing semantic sync for ${candidateFiles.length} file${candidateFiles.length === 1 ? "" : "s"}`,
				processedFiles: 0,
				totalFiles: candidateFiles.length,
				chunks: 0,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
			});

			const indexedFiles = await store.listIndexedFiles();
			const localFiles: SemanticLocalFileState[] = [];
			const failedFiles: Array<{ filePath: string; reason: string }> = [];
			let statUnchangedFiles = 0;
			let hashedFiles = 0;
			let processedFiles = 0;
			const indexedByPath = new Map(indexedFiles.map((file) => [file.filePath, file]));
			await mapWithConcurrency(candidateFiles, resolveSemanticScanConcurrency(), async (absolutePath) => {
				const relativePath = toPosix(path.relative(config.workspaceRoot, absolutePath));
				let stats: ReturnType<typeof statSync>;
				try {
					stats = statSync(absolutePath);
				} catch (error) {
					failedFiles.push({
						filePath: relativePath,
						reason: error instanceof Error ? error.message : String(error),
					});
					processedFiles += 1;
					emitProgress({
						phase: "scanning",
						message: `Scanning files ${processedFiles}/${candidateFiles.length}`,
						processedFiles,
						totalFiles: candidateFiles.length,
						chunks: 0,
						currentFile: relativePath,
						failedFiles: failedFiles.length,
						skippedFiles: skipped,
						skippedByReason: skippedByReason,
						statUnchangedFiles,
						hashedFiles,
					});
					return;
				}
				if (!stats.isFile()) {
					failedFiles.push({ filePath: relativePath, reason: "not a regular file" });
				} else {
					const indexed = indexedByPath.get(relativePath);
					if (indexed && indexedFileMatchesStat(indexed, stats)) {
						statUnchangedFiles += 1;
						localFiles.push({
							filePath: relativePath,
							fileHash: indexed.fileHash,
							fileSize: stats.size,
							modifiedMs: Math.trunc(stats.mtimeMs),
						});
					} else {
						const contentSkipReason = semanticContentSkipReason(absolutePath);
						if (contentSkipReason) {
							incrementSkip(skippedByReason, contentSkipReason);
							skipped += 1;
						} else {
							const fileHash = await computeFileHash(absolutePath);
							if (!fileHash) {
								failedFiles.push({ filePath: relativePath, reason: "file could not be read as UTF-8 text" });
							} else {
								hashedFiles += 1;
								localFiles.push({
									filePath: relativePath,
									fileHash,
									fileSize: stats.size,
									modifiedMs: Math.trunc(stats.mtimeMs),
								});
							}
						}
					}
				}
				processedFiles += 1;
				const elapsedMs = Date.now() - startedAt;
				const averageMsPerFile = processedFiles > 0 ? elapsedMs / processedFiles : undefined;
				const remainingFiles = candidateFiles.length - processedFiles;
				emitProgress({
					phase: "scanning",
					message: `Scanning files ${processedFiles}/${candidateFiles.length}`,
					processedFiles,
					totalFiles: candidateFiles.length,
					chunks: 0,
					currentFile: relativePath,
					etaMs: averageMsPerFile ? Math.max(0, Math.round(averageMsPerFile * remainingFiles)) : undefined,
					failedFiles: failedFiles.length,
					skippedFiles: skipped,
					skippedByReason: skippedByReason,
					statUnchangedFiles,
					hashedFiles,
				});
			});
			localFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
			failedFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));

			const plan = buildSemanticSyncPlan(localFiles, indexedFiles, failedFiles);
			semanticDebug("semantic-store.sync", "computed sync plan", {
				candidateFiles: candidateFiles.length,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
				indexedFiles: indexedFiles.length,
				newFiles: plan.newFiles,
				modifiedFiles: plan.modifiedFiles,
				deletedFiles: plan.deletedFiles,
				unchangedFiles: plan.unchangedFiles,
				failedFiles: plan.failedFiles,
				statUnchangedFiles,
				hashedFiles,
			});
			const changedFiles = plan.newFiles.length + plan.modifiedFiles.length;
			const changedChunkPlans: Array<{
				filePath: string;
				localState: SemanticLocalFileState;
				chunks: SemanticChunk[];
			}> = [];
			let totalChunksPlanned = 0;
			const chunkingConfig = {
				maxLines: resolveSemanticChunkMaxLines(),
				overlapLines: resolveSemanticChunkOverlapLines(),
			};
			const localByPath = new Map(localFiles.map((entry) => [entry.filePath, entry]));
			for (const filePath of [...plan.newFiles, ...plan.modifiedFiles]) {
				const absolutePath = path.join(config.workspaceRoot, filePath);
				const content = await readTextFile(absolutePath);
				if (content === undefined) {
					plan.failedFiles.push({ filePath, reason: "file became unreadable during chunk planning" });
					continue;
				}
				const localState = localByPath.get(filePath);
				if (!localState) {
					plan.failedFiles.push({ filePath, reason: "local state missing for changed file" });
					continue;
				}
				const chunks = chunkDocument(filePath, content, chunkingConfig);
				totalChunksPlanned += chunks.length;
				changedChunkPlans.push({ filePath, localState, chunks });
			}
			emitProgress({
				phase: "writing",
				writeSubphase: "planning",
				message: `Applying semantic sync plan for ${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`,
				processedFiles: localFiles.length + failedFiles.length,
				totalFiles: candidateFiles.length,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				chunks: 0,
				totalChunksPlanned,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
				statUnchangedFiles,
				hashedFiles,
			});

			emitProgress({
				phase: "writing",
				writeSubphase: "deleting-stale",
				message: "Deleting stale semantic chunks",
				processedFiles: localFiles.length + failedFiles.length,
				totalFiles: candidateFiles.length,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				chunks: 0,
				totalChunksPlanned,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
				statUnchangedFiles,
				hashedFiles,
			});
			const removedChunks = await store.deleteChunksForFiles([...plan.deletedFiles, ...plan.modifiedFiles]);
			await store.deleteIndexedFiles([...plan.deletedFiles, ...plan.modifiedFiles]);

			let insertedChunks = 0;
			const writingStartedAt = Date.now();
			const allChangedChunks = changedChunkPlans.flatMap((entry) => entry.chunks);
			const chunkBatches = chunkArray(allChangedChunks, resolveSemanticInsertChunkBatchSize());
			for (const [batchIndex, batch] of chunkBatches.entries()) {
				await store.insertChunks(batch);
				insertedChunks += batch.length;
				const writingElapsedMs = Date.now() - writingStartedAt;
				const chunksPerSecond =
					insertedChunks > 0 ? insertedChunks / Math.max(writingElapsedMs / 1000, 0.001) : undefined;
				const remainingChunks = Math.max(0, totalChunksPlanned - insertedChunks);
				const embeddingEtaMs =
					chunksPerSecond && Number.isFinite(chunksPerSecond) && chunksPerSecond > 0
						? Math.round((remainingChunks / chunksPerSecond) * 1000)
						: undefined;
				emitProgress({
					phase: "writing",
					writeSubphase: "embedding-writing",
					message: `Indexed chunk batch ${batchIndex + 1}/${chunkBatches.length}`,
					processedFiles: localFiles.length + failedFiles.length,
					totalFiles: candidateFiles.length,
					changedFiles,
					deletedFiles: plan.deletedFiles.length,
					unchangedFiles: plan.unchangedFiles.length,
					failedFiles: plan.failedFiles.length,
					chunks: insertedChunks,
					totalChunksPlanned,
					insertedChunks,
					removedChunks,
					embeddingEtaMs,
					embeddingBatchesCompleted: batchIndex + 1,
					embeddingBatchesTotal: chunkBatches.length,
					skippedFiles: skipped,
					skippedByReason: skippedByReason,
					statUnchangedFiles,
					hashedFiles,
				});
			}

			const manifestRows = changedChunkPlans.map(({ filePath, localState, chunks }) => ({
				filePath,
				fileHash: localState.fileHash,
				fileSize: localState.fileSize,
				modifiedMs: localState.modifiedMs,
				chunkCount: chunks.length,
				indexedAt: Date.now(),
			}));
			emitProgress({
				phase: "writing",
				writeSubphase: "manifest",
				message: "Updating semantic manifest",
				processedFiles: localFiles.length + failedFiles.length,
				totalFiles: candidateFiles.length,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				chunks: insertedChunks,
				totalChunksPlanned,
				insertedChunks,
				removedChunks,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
				statUnchangedFiles,
				hashedFiles,
			});
			await store.upsertIndexedFiles(manifestRows);

			let storeInfo = await store.info();
			const shouldRefreshIndexes =
				insertedChunks > 0 ||
				removedChunks > 0 ||
				storeInfo.rowCount === 0 ||
				!storeInfo.ftsIndexName ||
				!storeInfo.vectorIndexName;
			if (shouldRefreshIndexes) {
				await store.ensureIndexes((progress) =>
					emitProgress({
						...progress,
						writeSubphase: "indexing",
						processedFiles: localFiles.length + failedFiles.length,
						totalFiles: candidateFiles.length,
						changedFiles,
						deletedFiles: plan.deletedFiles.length,
						unchangedFiles: plan.unchangedFiles.length,
						failedFiles: plan.failedFiles.length,
						insertedChunks,
						removedChunks,
						chunks: insertedChunks,
						totalChunksPlanned,
						embeddingEtaMs: 0,
						skippedFiles: skipped,
						skippedByReason: skippedByReason,
						statUnchangedFiles,
						hashedFiles,
					}),
				);
				storeInfo = await store.info();
			} else {
				emitProgress({
					phase: "indexing",
					message: "Skipped index refresh; indexes are already current",
					processedFiles: localFiles.length + failedFiles.length,
					totalFiles: candidateFiles.length,
					changedFiles,
					deletedFiles: plan.deletedFiles.length,
					unchangedFiles: plan.unchangedFiles.length,
					failedFiles: plan.failedFiles.length,
					insertedChunks,
					removedChunks,
					chunks: insertedChunks,
					totalChunksPlanned,
					embeddingEtaMs: 0,
					skippedFiles: skipped,
					skippedByReason: skippedByReason,
					statUnchangedFiles,
					hashedFiles,
				});
			}

			const info = await embedder.getModelInfo();
			semanticDebug("semantic-store.sync", "completed sync", {
				scannedFiles: candidateFiles.length,
				skippedFiles: skipped,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				totalChunksPlanned,
				insertedChunks,
				removedChunks,
				totalChunks: storeInfo.rowCount,
				manifestRows: storeInfo.manifestRowCount,
				vectorIndexName: storeInfo.vectorIndexName,
				ftsIndexName: storeInfo.ftsIndexName,
			});
			emitProgress({
				phase: "complete",
				message: `Semantic sync complete with ${storeInfo.rowCount} total chunk${storeInfo.rowCount === 1 ? "" : "s"}`,
				processedFiles: localFiles.length + failedFiles.length,
				totalFiles: candidateFiles.length,
				chunks: storeInfo.rowCount,
				totalChunksPlanned,
				embeddingEtaMs: 0,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				insertedChunks,
				removedChunks,
				skippedFiles: skipped,
				skippedByReason: skippedByReason,
				statUnchangedFiles,
				hashedFiles,
			});
			return {
				chunks: storeInfo.rowCount,
				insertedChunks,
				removedChunks,
				changedFiles,
				deletedFiles: plan.deletedFiles.length,
				unchangedFiles: plan.unchangedFiles.length,
				failedFiles: plan.failedFiles.length,
				scannedFiles: candidateFiles.length,
				storePath: config.databaseDir,
				provider: info.provider,
				model: info.model,
				dimension: info.dimension,
				host: info.host,
				vectorIndexName: storeInfo.vectorIndexName,
				ftsIndexName: storeInfo.ftsIndexName,
				manifestTableName: storeInfo.manifestTableName,
				skippedByReason: skippedByReason,
				skippedFiles: skipped,
				statUnchangedFiles,
				hashedFiles,
				indexProfile: profile,
			};
		},
		async search(options) {
			return store.search(options);
		},
		async listIndexedFiles() {
			return store.listIndexedFiles();
		},
		async planSync() {
			const indexedFiles = await store.listIndexedFiles();
			const discovery = await discoverSemanticFilesFdDefault(config.workspaceRoot, {
				profile: config.indexProfile ?? resolveSemanticIndexProfile(),
			});
			const { files, failedFiles } = await collectLocalFileStates(config.workspaceRoot, discovery.files, {
				indexedFiles,
			});
			return { localFiles: files, indexedFiles, plan: buildSemanticSyncPlan(files, indexedFiles, failedFiles) };
		},
	};
}
