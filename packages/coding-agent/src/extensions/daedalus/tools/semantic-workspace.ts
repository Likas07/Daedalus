import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME } from "../../../config.js";
import {
	DEFAULT_OLLAMA_EMBED_MODEL,
	DEFAULT_OLLAMA_HOST,
	resolveSemanticIndexProfile,
	type SemanticIndexProfile,
} from "./semantic-config.js";
import { createOllamaSemanticEmbedder } from "./semantic-embedder.js";
import { collectSemanticCandidateFiles } from "./semantic-file-discovery.js";
import { createSemanticStoreRuntime, type SemanticStoreProgress } from "./semantic-store.js";
import type { SemanticSkipCounts } from "./semantic-types.js";

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

export type SemanticWorkspaceStateKind = "uninitialized" | "initialized" | "ready" | "stale_soft" | "stale_hard";

export interface SemanticWorkspacePersistedState {
	version: 2;
	root: string;
	initializedAt: number;
	indexedAt?: number;
	fingerprint?: string;
	chunkCount: number;
	databaseDir: string;
	embeddingProvider: string;
	embeddingModel: string;
	embeddingHost: string;
	embeddingDimension?: number;
	vectorIndexName?: string;
	ftsIndexName?: string;
	manifestTableName?: string;
	chunkTableName?: string;
	chunkingVersion: string;
	syncStrategyVersion: string;
	lastSyncSummary?: {
		scannedFiles: number;
		changedFiles: number;
		deletedFiles: number;
		unchangedFiles: number;
		failedFiles: number;
		insertedChunks: number;
		removedChunks: number;
	};
	lastDiscoverySummary?: {
		candidateFiles: number;
		skippedFiles: number;
		skippedByReason: SemanticSkipCounts;
		indexProfile: SemanticIndexProfile;
	};
	lastIndexRefreshAt?: string;
	lastIndexRefreshChunkCount?: number;
	indexRefreshStrategyVersion?: number;
}

export interface SemanticWorkspaceStatus {
	state: SemanticWorkspaceStateKind;
	initialized: boolean;
	ready: boolean;
	chunkCount: number;
	root: string;
	indexPath: string;
	databaseDir: string;
	embeddingProvider?: string;
	embeddingModel?: string;
	embeddingHost?: string;
	embeddingDimension?: number;
	vectorIndexName?: string;
	ftsIndexName?: string;
	indexedAt?: number;
	staleReason?: string;
	fingerprint?: string;
	source: "status" | "index";
	lastSyncSummary?: SemanticWorkspacePersistedState["lastSyncSummary"];
	lastDiscoverySummary?: SemanticWorkspacePersistedState["lastDiscoverySummary"];
}

export interface SemanticWorkspaceProgress extends SemanticStoreProgress {}

const CURRENT_CHUNKING_VERSION = "v2";
const CURRENT_SYNC_STRATEGY_VERSION = "incremental-v2";

function toPosix(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

function workspaceFilePath(cwd: string): string {
	return path.join(cwd, CONFIG_DIR_NAME, "semantic-workspace.json");
}

function databaseDirPath(cwd: string): string {
	return path.join(cwd, CONFIG_DIR_NAME, "semantic-store");
}

function ensureWorkspaceDir(cwd: string): string {
	const dir = path.join(cwd, CONFIG_DIR_NAME);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function buildFingerprint(cwd: string, profile: SemanticIndexProfile = resolveSemanticIndexProfile()): string {
	const hash = createHash("sha256");
	for (const filePath of collectSemanticCandidateFiles(cwd, { profile })) {
		const relativePath = toPosix(path.relative(cwd, filePath));
		const stats = statSync(filePath);
		hash.update(relativePath);
		hash.update(":");
		hash.update(String(stats.size));
		hash.update(":");
		hash.update(String(Math.trunc(stats.mtimeMs)));
		hash.update("\n");
	}
	return hash.digest("hex");
}

export function loadSemanticWorkspace(cwd: string): SemanticWorkspacePersistedState | undefined {
	const filePath = workspaceFilePath(cwd);
	if (!existsSync(filePath)) return undefined;
	const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as SemanticWorkspacePersistedState;
	if (parsed.version !== 2) return undefined;
	return parsed;
}

export async function initSemanticWorkspace(
	cwd: string,
	onProgress?: (progress: SemanticWorkspaceProgress) => void,
): Promise<SemanticWorkspacePersistedState> {
	const startedAt = Date.now();
	const emitProgress = (progress: Omit<SemanticWorkspaceProgress, "elapsedMs">): void => {
		onProgress?.({ ...progress, elapsedMs: Date.now() - startedAt });
	};
	emitProgress({ phase: "preparing", message: "Preparing semantic workspace directories" });
	ensureWorkspaceDir(cwd);
	mkdirSync(databaseDirPath(cwd), { recursive: true });
	emitProgress({ phase: "preparing", message: "Connecting local semantic store" });
	await createSemanticStoreRuntime({
		databaseDir: databaseDirPath(cwd),
		workspaceRoot: cwd,
		host: DEFAULT_OLLAMA_HOST,
		model: DEFAULT_OLLAMA_EMBED_MODEL,
	});
	emitProgress({ phase: "preparing", message: "Loading embedding model metadata" });
	const embedder = await createOllamaSemanticEmbedder({
		host: DEFAULT_OLLAMA_HOST,
		model: DEFAULT_OLLAMA_EMBED_MODEL,
	});
	const info = await embedder.getModelInfo();
	const state: SemanticWorkspacePersistedState = {
		version: 2,
		root: cwd,
		initializedAt: Date.now(),
		chunkCount: 0,
		databaseDir: databaseDirPath(cwd),
		embeddingProvider: info.provider,
		embeddingModel: info.model,
		embeddingHost: info.host,
		embeddingDimension: info.dimension,
		chunkingVersion: CURRENT_CHUNKING_VERSION,
		syncStrategyVersion: CURRENT_SYNC_STRATEGY_VERSION,
		chunkTableName: "semantic_chunks",
		manifestTableName: "semantic_indexed_files",
	};
	writeSemanticWorkspace(cwd, state);
	emitProgress({ phase: "complete", message: "Semantic workspace initialized", chunks: 0 });
	return state;
}

export async function syncSemanticWorkspace(
	cwd: string,
	onProgress?: (progress: SemanticWorkspaceProgress) => void,
): Promise<SemanticWorkspacePersistedState> {
	const startedAt = Date.now();
	const emitProgress = (progress: Omit<SemanticWorkspaceProgress, "elapsedMs">): void => {
		onProgress?.({ ...progress, elapsedMs: Date.now() - startedAt });
	};
	semanticDebug("semantic-workspace.sync", "starting workspace sync", {
		cwd,
	});
	ensureWorkspaceDir(cwd);
	const current = loadSemanticWorkspace(cwd) ?? (await initSemanticWorkspace(cwd, onProgress));
	const runtime = await createSemanticStoreRuntime({
		databaseDir: current.databaseDir,
		workspaceRoot: cwd,
		host: current.embeddingHost,
		model: current.embeddingModel,
	});
	const syncInfo = await runtime.sync(emitProgress);
	const fingerprint = buildFingerprint(cwd, syncInfo.indexProfile ?? resolveSemanticIndexProfile());
	semanticDebug("semantic-workspace.sync", "sync runtime completed", {
		cwd,
		chunks: syncInfo.chunks,
		changedFiles: syncInfo.changedFiles,
		deletedFiles: syncInfo.deletedFiles,
		unchangedFiles: syncInfo.unchangedFiles,
		failedFiles: syncInfo.failedFiles,
		insertedChunks: syncInfo.insertedChunks,
		removedChunks: syncInfo.removedChunks,
	});
	const next: SemanticWorkspacePersistedState = {
		...current,
		root: cwd,
		indexedAt: Date.now(),
		fingerprint,
		chunkCount: syncInfo.chunks,
		databaseDir: syncInfo.storePath,
		embeddingProvider: syncInfo.provider,
		embeddingModel: syncInfo.model,
		embeddingHost: syncInfo.host,
		embeddingDimension: syncInfo.dimension,
		vectorIndexName: syncInfo.vectorIndexName,
		ftsIndexName: syncInfo.ftsIndexName,
		manifestTableName: syncInfo.manifestTableName,
		chunkTableName: current.chunkTableName ?? "semantic_chunks",
		chunkingVersion: CURRENT_CHUNKING_VERSION,
		syncStrategyVersion: CURRENT_SYNC_STRATEGY_VERSION,
		lastSyncSummary: {
			scannedFiles: syncInfo.scannedFiles,
			changedFiles: syncInfo.changedFiles,
			deletedFiles: syncInfo.deletedFiles,
			unchangedFiles: syncInfo.unchangedFiles,
			failedFiles: syncInfo.failedFiles,
			insertedChunks: syncInfo.insertedChunks,
			removedChunks: syncInfo.removedChunks,
		},
		lastDiscoverySummary: {
			candidateFiles: syncInfo.scannedFiles,
			skippedFiles: syncInfo.skippedFiles ?? 0,
			skippedByReason: syncInfo.skippedByReason ?? {},
			indexProfile: syncInfo.indexProfile ?? "normal",
		},
		lastIndexRefreshAt:
			syncInfo.insertedChunks > 0 || syncInfo.removedChunks > 0
				? new Date().toISOString()
				: current.lastIndexRefreshAt,
		lastIndexRefreshChunkCount:
			syncInfo.insertedChunks > 0 || syncInfo.removedChunks > 0
				? syncInfo.chunks
				: current.lastIndexRefreshChunkCount,
		indexRefreshStrategyVersion: 1,
	};
	writeSemanticWorkspace(cwd, next);
	emitProgress({
		phase: "complete",
		message: `Semantic workspace ready with ${syncInfo.chunks} chunk${syncInfo.chunks === 1 ? "" : "s"}`,
		chunks: syncInfo.chunks,
		changedFiles: syncInfo.changedFiles,
		deletedFiles: syncInfo.deletedFiles,
		unchangedFiles: syncInfo.unchangedFiles,
		failedFiles: syncInfo.failedFiles,
		insertedChunks: syncInfo.insertedChunks,
		removedChunks: syncInfo.removedChunks,
		skippedFiles: syncInfo.skippedFiles,
		skippedByReason: syncInfo.skippedByReason,
	});
	return next;
}

export function writeSemanticWorkspace(cwd: string, state: SemanticWorkspacePersistedState): void {
	ensureWorkspaceDir(cwd);
	writeFileSync(workspaceFilePath(cwd), JSON.stringify(state, null, 2), "utf-8");
}

export function getSemanticWorkspaceStatus(cwd: string): SemanticWorkspaceStatus {
	const persisted = loadSemanticWorkspace(cwd);
	const indexPath = workspaceFilePath(cwd);
	const databaseDir = persisted?.databaseDir ?? databaseDirPath(cwd);
	if (!persisted) {
		return {
			state: "uninitialized",
			initialized: false,
			ready: false,
			chunkCount: 0,
			root: cwd,
			indexPath,
			databaseDir,
			source: "status",
		};
	}
	if (
		persisted.chunkingVersion !== CURRENT_CHUNKING_VERSION ||
		persisted.syncStrategyVersion !== CURRENT_SYNC_STRATEGY_VERSION
	) {
		return {
			state: "stale_hard",
			initialized: true,
			ready: false,
			chunkCount: persisted.chunkCount,
			root: cwd,
			indexPath,
			databaseDir,
			embeddingProvider: persisted.embeddingProvider,
			embeddingModel: persisted.embeddingModel,
			embeddingHost: persisted.embeddingHost,
			embeddingDimension: persisted.embeddingDimension,
			vectorIndexName: persisted.vectorIndexName,
			ftsIndexName: persisted.ftsIndexName,
			indexedAt: persisted.indexedAt,
			staleReason: "semantic workspace version changed and requires rebuild",
			fingerprint: persisted.fingerprint,
			source: "status",
			lastSyncSummary: persisted.lastSyncSummary,
			lastDiscoverySummary: persisted.lastDiscoverySummary,
		};
	}
	if (!persisted.indexedAt || !persisted.fingerprint || persisted.chunkCount === 0) {
		return {
			state: "initialized",
			initialized: true,
			ready: false,
			chunkCount: persisted.chunkCount,
			root: cwd,
			indexPath,
			databaseDir,
			embeddingProvider: persisted.embeddingProvider,
			embeddingModel: persisted.embeddingModel,
			embeddingHost: persisted.embeddingHost,
			embeddingDimension: persisted.embeddingDimension,
			indexedAt: persisted.indexedAt,
			source: "status",
			lastSyncSummary: persisted.lastSyncSummary,
			lastDiscoverySummary: persisted.lastDiscoverySummary,
		};
	}
	if (!existsSync(persisted.databaseDir)) {
		return {
			state: "stale_hard",
			initialized: true,
			ready: false,
			chunkCount: persisted.chunkCount,
			root: cwd,
			indexPath,
			databaseDir,
			embeddingProvider: persisted.embeddingProvider,
			embeddingModel: persisted.embeddingModel,
			embeddingHost: persisted.embeddingHost,
			embeddingDimension: persisted.embeddingDimension,
			indexedAt: persisted.indexedAt,
			staleReason: "semantic database directory is missing",
			fingerprint: persisted.fingerprint,
			source: "status",
			lastSyncSummary: persisted.lastSyncSummary,
			lastDiscoverySummary: persisted.lastDiscoverySummary,
		};
	}
	const currentFingerprint = buildFingerprint(
		cwd,
		persisted.lastDiscoverySummary?.indexProfile ?? resolveSemanticIndexProfile(),
	);
	if (currentFingerprint !== persisted.fingerprint) {
		return {
			state: "stale_soft",
			initialized: true,
			ready: true,
			chunkCount: persisted.chunkCount,
			root: cwd,
			indexPath,
			databaseDir,
			embeddingProvider: persisted.embeddingProvider,
			embeddingModel: persisted.embeddingModel,
			embeddingHost: persisted.embeddingHost,
			embeddingDimension: persisted.embeddingDimension,
			vectorIndexName: persisted.vectorIndexName,
			ftsIndexName: persisted.ftsIndexName,
			indexedAt: persisted.indexedAt,
			staleReason: "workspace contents changed since last sync",
			fingerprint: persisted.fingerprint,
			source: "status",
			lastSyncSummary: persisted.lastSyncSummary,
			lastDiscoverySummary: persisted.lastDiscoverySummary,
		};
	}
	if ((persisted.lastSyncSummary?.failedFiles ?? 0) > 0) {
		return {
			state: "stale_hard",
			initialized: true,
			ready: false,
			chunkCount: persisted.chunkCount,
			root: cwd,
			indexPath,
			databaseDir,
			embeddingProvider: persisted.embeddingProvider,
			embeddingModel: persisted.embeddingModel,
			embeddingHost: persisted.embeddingHost,
			embeddingDimension: persisted.embeddingDimension,
			vectorIndexName: persisted.vectorIndexName,
			ftsIndexName: persisted.ftsIndexName,
			indexedAt: persisted.indexedAt,
			staleReason: "last semantic sync had failed files",
			fingerprint: persisted.fingerprint,
			source: "status",
			lastSyncSummary: persisted.lastSyncSummary,
			lastDiscoverySummary: persisted.lastDiscoverySummary,
		};
	}
	return {
		state: "ready",
		initialized: true,
		ready: true,
		chunkCount: persisted.chunkCount,
		root: cwd,
		indexPath,
		databaseDir,
		embeddingProvider: persisted.embeddingProvider,
		embeddingModel: persisted.embeddingModel,
		embeddingHost: persisted.embeddingHost,
		embeddingDimension: persisted.embeddingDimension,
		vectorIndexName: persisted.vectorIndexName,
		ftsIndexName: persisted.ftsIndexName,
		indexedAt: persisted.indexedAt,
		fingerprint: persisted.fingerprint,
		source: "status",
		lastSyncSummary: persisted.lastSyncSummary,
		lastDiscoverySummary: persisted.lastDiscoverySummary,
	};
}

export function requireSearchableSemanticWorkspace(cwd: string): {
	status: SemanticWorkspaceStatus;
	state: SemanticWorkspacePersistedState;
} {
	const status = getSemanticWorkspaceStatus(cwd);
	const state = loadSemanticWorkspace(cwd);
	if (!state || status.state === "uninitialized") {
		throw new Error("Semantic workspace is uninitialized. Run /workspace-init, then /workspace-sync.");
	}
	if (status.state === "initialized") {
		throw new Error(
			"Semantic workspace is initialized but not indexed. Run /workspace-sync before using sem_search.",
		);
	}
	if (status.state === "stale_hard") {
		throw new Error(
			"Semantic workspace index is invalid and requires /workspace-sync before sem_search can run.",
		);
	}
	return { status: { ...status, source: "index" }, state };
}


export function requireReadySemanticWorkspace(cwd: string): {
	status: SemanticWorkspaceStatus;
	state: SemanticWorkspacePersistedState;
} {
	const status = getSemanticWorkspaceStatus(cwd);
	const state = loadSemanticWorkspace(cwd);
	if (!state || status.state === "uninitialized") {
		throw new Error("Semantic workspace is uninitialized. Run /workspace-init, then /workspace-sync.");
	}
	if (status.state === "initialized") {
		throw new Error(
			"Semantic workspace is initialized but not indexed. Run /workspace-sync before using sem_search.",
		);
	}
	if (status.state === "stale_hard") {
		throw new Error(
			"Semantic workspace index is invalid and requires /workspace-sync before sem_search can run.",
		);
	}
	return { status: { ...status, source: "index" }, state };
}
