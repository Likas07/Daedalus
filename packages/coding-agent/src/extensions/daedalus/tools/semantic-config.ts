export interface OllamaSemanticEmbedderConfig {
	host?: string;
	model?: string;
	batchSize?: number;
	concurrency?: number;
	keepAlive?: string;
}

function positiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_EMBED_MODEL = "embeddinggemma";
export const DEFAULT_OLLAMA_EMBED_BATCH_SIZE = positiveIntegerEnv("DAEDALUS_OLLAMA_EMBED_BATCH_SIZE", 64);
export const DEFAULT_OLLAMA_EMBED_CONCURRENCY = positiveIntegerEnv("DAEDALUS_OLLAMA_EMBED_CONCURRENCY", 4);
export const DEFAULT_OLLAMA_EMBED_KEEP_ALIVE = process.env.DAEDALUS_OLLAMA_EMBED_KEEP_ALIVE || "15m";

export type SemanticIndexProfile = "minimal" | "normal" | "broad" | "exhaustive";
export const DEFAULT_SEMANTIC_INDEX_PROFILE: SemanticIndexProfile = "normal";
export const SEMANTIC_INDEX_PROFILE_ENV = "DAEDALUS_SEMANTIC_INDEX_PROFILE";

export function resolveSemanticIndexProfile(value = process.env[SEMANTIC_INDEX_PROFILE_ENV]): SemanticIndexProfile {
	if (value === "minimal" || value === "normal" || value === "broad" || value === "exhaustive") return value;
	return DEFAULT_SEMANTIC_INDEX_PROFILE;
}

export const DEFAULT_SEMANTIC_SCAN_CONCURRENCY = 32;
export const SEMANTIC_SCAN_CONCURRENCY_ENV = "DAEDALUS_SEMANTIC_SCAN_CONCURRENCY";

export function resolveSemanticScanConcurrency(value = process.env[SEMANTIC_SCAN_CONCURRENCY_ENV]): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 128) : DEFAULT_SEMANTIC_SCAN_CONCURRENCY;
}

export const DEFAULT_SEMANTIC_INSERT_CHUNK_BATCH_SIZE = 256;
export const SEMANTIC_INSERT_CHUNK_BATCH_SIZE_ENV = "DAEDALUS_SEMANTIC_INSERT_CHUNK_BATCH_SIZE";

export function resolveSemanticInsertChunkBatchSize(value = process.env[SEMANTIC_INSERT_CHUNK_BATCH_SIZE_ENV]): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0
		? Math.min(Math.max(parsed, 1), 4096)
		: DEFAULT_SEMANTIC_INSERT_CHUNK_BATCH_SIZE;
}

export const DAEDALUS_SEMANTIC_CHUNK_MAX_LINES_ENV = "DAEDALUS_SEMANTIC_CHUNK_MAX_LINES";
export const DAEDALUS_SEMANTIC_CHUNK_OVERLAP_LINES_ENV = "DAEDALUS_SEMANTIC_CHUNK_OVERLAP_LINES";

export function resolveSemanticChunkMaxLines(
	value = process.env[DAEDALUS_SEMANTIC_CHUNK_MAX_LINES_ENV],
): number | undefined {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : undefined;
}

export function resolveSemanticChunkOverlapLines(
	value = process.env[DAEDALUS_SEMANTIC_CHUNK_OVERLAP_LINES_ENV],
): number | undefined {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 500) : undefined;
}
