import { buildCodexSseHeaders, extractCodexAccountId, resolveCodexResponsesUrl } from "@daedalus-pi/ai";
import type { WebSearchResponse, WebSearchSource, WebSearchUsage } from "./types.js";

const DEFAULT_CODEX_SEARCH_MODEL = "gpt-5.1-codex-mini";
const DEFAULT_INSTRUCTIONS =
	"Search the web to answer the user's query. Prefer primary sources. Include concise citations.";
export interface ExecuteCodexWebSearchOptions {
	query: string;
	accessToken: string;
	model?: string;
	baseUrl?: string;
	searchContextSize?: "low" | "medium" | "high";
	maxSources?: number;
	signal?: AbortSignal;
	fetcher?: typeof fetch;
	userAgent?: string;
	sessionId?: string;
}
export async function executeCodexWebSearch(options: ExecuteCodexWebSearchOptions): Promise<WebSearchResponse> {
	const accountId = extractCodexAccountId(options.accessToken);
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher(resolveCodexResponsesUrl(options.baseUrl), {
		method: "POST",
		headers: buildCodexSseHeaders({
			accountId,
			token: options.accessToken,
			userAgent: options.userAgent,
			sessionId: options.sessionId,
		}),
		body: JSON.stringify({
			model: options.model ?? DEFAULT_CODEX_SEARCH_MODEL,
			stream: true,
			store: false,
			input: [{ type: "message", role: "user", content: [{ type: "input_text", text: options.query }] }],
			tools: [{ type: "web_search", search_context_size: options.searchContextSize ?? "high" }],
			instructions: DEFAULT_INSTRUCTIONS,
		}),
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`Codex web search failed (${response.status}): ${await response.text()}`);
	if (!response.body) throw new Error("Codex web search returned no response body");
	return parseCodexSearchSse(response.body, { maxSources: options.maxSources });
}
function isImagePlaceholder(text: string): boolean {
	return text.trim().toLowerCase() === "(see attached image)";
}
function addSource(sources: WebSearchSource[], source: WebSearchSource): void {
	if (!sources.some((existing) => existing.url === source.url)) sources.push(source);
}
export async function parseCodexSearchSse(
	body: ReadableStream<Uint8Array>,
	options: { maxSources?: number } = {},
): Promise<WebSearchResponse> {
	const decoder = new TextDecoder();
	const reader = body.getReader();
	let buffer = "";
	const finalParts: string[] = [];
	const streamedParts: string[] = [];
	const sources: WebSearchSource[] = [];
	let model: string | undefined;
	let requestId: string | undefined;
	let usage: WebSearchUsage | undefined;
	function handleEvent(raw: string) {
		if (raw === "[DONE]") return;
		const event = JSON.parse(raw) as any;
		if (event.type === "response.output_text.delta" && typeof event.delta === "string")
			streamedParts.push(event.delta);
		if (event.type === "response.output_item.done" && event.item?.type === "message")
			for (const part of event.item.content ?? []) {
				if (part.type !== "output_text") continue;
				if (typeof part.text === "string") finalParts.push(part.text);
				for (const annotation of part.annotations ?? [])
					if (annotation.type === "url_citation" && typeof annotation.url === "string")
						addSource(sources, { title: annotation.title ?? annotation.url, url: annotation.url });
			}
		if (event.type === "response.completed" || event.type === "response.done") {
			const response = event.response ?? {};
			model = response.model ?? model;
			requestId = response.id ?? requestId;
			if (response.usage) {
				const cached = response.usage.input_tokens_details?.cached_tokens ?? 0;
				usage = {
					inputTokens: (response.usage.input_tokens ?? 0) - cached,
					outputTokens: response.usage.output_tokens ?? 0,
					totalTokens: response.usage.total_tokens ?? 0,
				};
			}
		}
		if (event.type === "error") throw new Error(`Codex web search error: ${event.message ?? "Unknown error"}`);
		if (event.type === "response.failed")
			throw new Error(`Codex web search failed: ${event.response?.error?.message ?? "Request failed"}`);
	}
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		while (true) {
			const boundary = buffer.indexOf("\n\n");
			if (boundary === -1) break;
			const chunk = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			for (const line of chunk.split(/\r?\n/)) if (line.startsWith("data: ")) handleEvent(line.slice(6));
		}
	}
	const finalAnswer = finalParts.join("\n\n").trim();
	const streamedAnswer = streamedParts.join("").trim();
	const answer = finalAnswer.length > 0 && !isImagePlaceholder(finalAnswer) ? finalAnswer : streamedAnswer;
	return {
		provider: "codex",
		answer: answer || undefined,
		sources: sources.slice(0, options.maxSources),
		model,
		requestId,
		usage,
	};
}
