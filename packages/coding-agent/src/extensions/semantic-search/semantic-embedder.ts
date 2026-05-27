import { getRegistry, register, TextEmbeddingFunction } from "@lancedb/lancedb/embedding";
import { Float32 } from "apache-arrow";
import {
	DEFAULT_OLLAMA_EMBED_BATCH_SIZE,
	DEFAULT_OLLAMA_EMBED_CONCURRENCY,
	DEFAULT_OLLAMA_EMBED_KEEP_ALIVE,
	DEFAULT_OLLAMA_EMBED_MODEL,
	DEFAULT_OLLAMA_HOST,
	type OllamaSemanticEmbedderConfig,
	resolveOllamaEmbedRequestTimeoutMs,
} from "./semantic-config.js";
import type { SemanticEmbedDocumentsOptions, SemanticEmbedder, SemanticEmbedderModelInfo } from "./semantic-types.js";

interface OllamaEmbedResponse {
	embeddings?: number[][];
	embedding?: number[];
}

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

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function wrapEmbeddingError(message: string, error: unknown): Error {
	return new Error(`${message}: ${errorMessage(error)}`, { cause: error });
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (true) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				if (currentIndex >= items.length) return;
				results[currentIndex] = await worker(items[currentIndex], currentIndex);
			}
		}),
	);
	return results;
}

class OllamaSemanticEmbedderImpl implements SemanticEmbedder {
	private readonly host: string;
	private readonly model: string;
	private readonly batchSize: number;
	private readonly concurrency: number;
	private readonly keepAlive: string;
	private readonly requestTimeoutMs?: number;
	private dimension?: number;

	constructor(config: OllamaSemanticEmbedderConfig = {}) {
		this.host = config.host ?? DEFAULT_OLLAMA_HOST;
		this.model = config.model ?? DEFAULT_OLLAMA_EMBED_MODEL;
		this.batchSize = Math.max(1, Math.trunc(config.batchSize ?? DEFAULT_OLLAMA_EMBED_BATCH_SIZE));
		this.concurrency = Math.max(1, Math.trunc(config.concurrency ?? DEFAULT_OLLAMA_EMBED_CONCURRENCY));
		this.keepAlive = config.keepAlive ?? DEFAULT_OLLAMA_EMBED_KEEP_ALIVE;
		this.requestTimeoutMs = config.requestTimeoutMs ?? resolveOllamaEmbedRequestTimeoutMs();
	}

	private async embedBatch(texts: string[], batchIndex: number): Promise<number[][]> {
		const startedAt = Date.now();
		semanticDebug("semantic-embedder.batch", "starting embedding batch", {
			model: this.model,
			host: this.host,
			batchIndex,
			batchSize: texts.length,
			configuredBatchSize: this.batchSize,
			concurrency: this.concurrency,
			keepAlive: this.keepAlive,
		});
		const timeoutMs = this.requestTimeoutMs;
		const controller = timeoutMs ? new AbortController() : undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		if (controller && timeoutMs) {
			timeout = setTimeout(() => controller.abort(), timeoutMs);
		}
		let response: Response;
		try {
			response = await fetch(new URL("/api/embed", this.host), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ model: this.model, input: texts, keep_alive: this.keepAlive }),
				signal: controller?.signal,
			});
		} catch (error) {
			if (controller?.signal.aborted) {
				throw new Error(`Ollama embedding request timed out after ${timeoutMs}ms`);
			}
			throw error;
		} finally {
			if (timeout) clearTimeout(timeout);
		}
		if (!response.ok) {
			throw new Error(`Ollama embedding request failed: ${response.status} ${response.statusText}`);
		}
		const payload = (await response.json()) as OllamaEmbedResponse;
		const embeddings = payload.embeddings ?? (payload.embedding ? [payload.embedding] : undefined);
		if (!embeddings || embeddings.length === 0) {
			throw new Error("Ollama embedding response did not include embeddings");
		}
		this.dimension ??= embeddings[0]?.length;
		semanticDebug("semantic-embedder.batch", "completed embedding batch", {
			model: this.model,
			batchIndex,
			batchSize: texts.length,
			elapsedMs: Date.now() - startedAt,
			returnedEmbeddings: embeddings.length,
			dimension: this.dimension,
		});
		return embeddings;
	}

	async embedDocuments(texts: string[], options: SemanticEmbedDocumentsOptions = {}): Promise<number[][]> {
		if (texts.length === 0) return [];
		const startedAt = Date.now();
		const batches = chunkArray(texts, this.batchSize);
		semanticDebug("semantic-embedder.embedDocuments", "starting batched embedding run", {
			model: this.model,
			host: this.host,
			textCount: texts.length,
			batchCount: batches.length,
			batchSize: this.batchSize,
			concurrency: this.concurrency,
			keepAlive: this.keepAlive,
		});
		let completedTexts = 0;
		const results = await mapWithConcurrency(batches, this.concurrency, async (batch, batchIndex) => {
			const batchStartedAt = Date.now();
			let embeddings: number[][];
			try {
				embeddings = await this.embedBatch(batch, batchIndex);
			} catch (error) {
				throw wrapEmbeddingError(
					`Ollama embedding batch ${batchIndex + 1}/${batches.length} failed for ${batch.length} text${batch.length === 1 ? "" : "s"}`,
					error,
				);
			}
			completedTexts += batch.length;
			options.onBatch?.({
				batchIndex,
				totalBatches: batches.length,
				batchSize: batch.length,
				elapsedMs: Date.now() - batchStartedAt,
				completedTexts,
				totalTexts: texts.length,
				concurrency: this.concurrency,
			});
			return embeddings;
		});
		const embeddings = results.flat();
		semanticDebug("semantic-embedder.embedDocuments", "completed batched embedding run", {
			model: this.model,
			textCount: texts.length,
			batchCount: batches.length,
			elapsedMs: Date.now() - startedAt,
			returnedEmbeddings: embeddings.length,
			dimension: this.dimension,
		});
		return embeddings;
	}

	async embedQuery(text: string): Promise<number[]> {
		const [embedding] = await this.embedDocuments([text]);
		return embedding;
	}

	async getModelInfo(): Promise<SemanticEmbedderModelInfo> {
		if (!this.dimension) {
			await this.embedQuery("dimension probe");
		}
		return {
			provider: "ollama",
			model: this.model,
			dimension: this.dimension ?? 0,
			host: this.host,
		};
	}
}

export async function createOllamaSemanticEmbedder(
	config: OllamaSemanticEmbedderConfig = {},
): Promise<SemanticEmbedder> {
	const embedder = new OllamaSemanticEmbedderImpl(config);
	await embedder.getModelInfo();
	return embedder;
}

const registeredEmbedders = new Map<string, SemanticEmbedder>();
const registeredDimensions = new Map<string, number>();
let latestRegisteredAlias: string | undefined;

function sanitizeSegment(value: string): string {
	return value
		.replace(/[^a-z0-9]+/gi, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
}

function buildAlias(info: SemanticEmbedderModelInfo): string {
	return `daedalus_ollama_embedding_${sanitizeSegment(info.model)}_${sanitizeSegment(info.host)}`;
}

class DeferredRegisteredOllamaEmbeddingFunction extends TextEmbeddingFunction<{ alias: string }> {
	private alias: string;

	constructor(optionsRaw: { alias: string }) {
		super();
		const options = this.resolveVariables(optionsRaw ?? {}) as { alias?: string };
		this.alias = options.alias ?? latestRegisteredAlias ?? "";
		if (!this.alias) throw new Error("Ollama embedding function requires alias");
	}

	ndims() {
		return registeredDimensions.get(this.alias);
	}

	embeddingDataType() {
		return new Float32();
	}

	toJSON() {
		return { alias: this.alias };
	}

	async generateEmbeddings(texts: string[]) {
		const registered = registeredEmbedders.get(this.alias);
		if (!registered) throw new Error(`No registered semantic embedder found for alias '${this.alias}'`);
		return registered.embedDocuments(texts);
	}
}

if (!getRegistry().get("daedalus_ollama_embedding")) {
	register("daedalus_ollama_embedding")(DeferredRegisteredOllamaEmbeddingFunction as any);
}

export async function registerOllamaEmbeddingFunction(embedder: SemanticEmbedder): Promise<string> {
	const info = await embedder.getModelInfo();
	const alias = buildAlias(info);
	registeredEmbedders.set(alias, embedder);
	registeredDimensions.set(alias, info.dimension);
	latestRegisteredAlias = alias;
	return alias;
}

export function getRegisteredOllamaEmbeddingFunctionName(): string {
	return "daedalus_ollama_embedding";
}
