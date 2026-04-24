import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createOllamaSemanticEmbedder,
	registerOllamaEmbeddingFunction,
} from "../src/extensions/daedalus/tools/semantic-embedder.js";
import { openSemanticLanceStore } from "../src/extensions/daedalus/tools/semantic-lancedb.js";

describe("semantic embedder LanceDB integration", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-embedder-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("batches embeddings, sends keep_alive, and respects concurrency", async () => {
		const originalFetch = globalThis.fetch;
		let inFlight = 0;
		let maxInFlight = 0;
		const requests: Array<{ input: string[]; keepAlive?: string }> = [];
		globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			const body = JSON.parse(String(init?.body)) as { input: string[]; keep_alive?: string };
			requests.push({ input: body.input, keepAlive: body.keep_alive });
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlight -= 1;
			return new Response(
				JSON.stringify({ embeddings: body.input.map((_text, index) => [index + 1, index + 2, index + 3]) }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;

		try {
			const embedder = await createOllamaSemanticEmbedder({
				model: "embeddinggemma",
				host: "http://127.0.0.1:11434",
				batchSize: 2,
				concurrency: 2,
				keepAlive: "30m",
			});
			const vectors = await embedder.embedDocuments(["a", "b", "c", "d", "e"]);
			expect(vectors).toHaveLength(5);
			expect(requests).toHaveLength(4); // includes dimension probe from create + 3 actual batches
			expect(requests.at(-3)?.input).toHaveLength(2);
			expect(requests.at(-2)?.input).toHaveLength(2);
			expect(requests.at(-1)?.input).toHaveLength(1);
			expect(requests.every((request) => request.keepAlive === "30m")).toBe(true);
			expect(maxInFlight).toBeGreaterThanOrEqual(2);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("registers an Ollama-backed LanceDB embedding function that auto-embeds inserts and text queries", async () => {
		const embedder = await createOllamaSemanticEmbedder({
			model: "embeddinggemma",
			host: "http://127.0.0.1:11434",
		});

		const functionName = await registerOllamaEmbeddingFunction(embedder);
		const store = await openSemanticLanceStore({
			databaseDir: join(tempDir, "semantic-store"),
			embeddingFunctionAlias: functionName,
		});

		await store.replaceChunks([
			{
				chunkId: "chunk-1",
				filePath: "src/refresh-token.ts",
				language: "typescript",
				content: "export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}",
				startLine: 1,
				endLine: 4,
				contentHash: "hash-1",
			},
			{
				chunkId: "chunk-2",
				filePath: "src/auth.ts",
				language: "typescript",
				content: "export function authenticate() {\n  return 'alpha';\n}",
				startLine: 1,
				endLine: 3,
				contentHash: "hash-2",
			},
		]);

		const results = await store.search({
			query: "token refresh flow",
			limit: 2,
		});

		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.filePath).toBe("src/refresh-token.ts");
		expect(results[0]?.startLine).toBe(1);
		expect(results[0]?.endLine).toBe(4);
		expect(results[0]?.snippet).toContain("refreshToken");
		expect(results[0]?.relevanceScore).toBeTypeOf("number");
	}, 120_000);
});
