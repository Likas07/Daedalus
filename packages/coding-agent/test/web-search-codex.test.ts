import { describe, expect, test } from "bun:test";
import { executeCodexWebSearch } from "../src/core/tools/web-search/codex.js";

const accessToken = `h.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" } })).toString("base64url")}.s`;
function sse(events: unknown[]): Response {
	return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}
describe("executeCodexWebSearch", () => {
	test("posts Codex native web_search request and parses answer with sources", async () => {
		let request: { url: string; init: RequestInit } | undefined;
		const fetcher = async (url: string | URL, init?: RequestInit) => {
			request = { url: String(url), init: init ?? {} };
			return sse([
				{ type: "response.output_text.delta", delta: "fallback answer" },
				{
					type: "response.output_item.done",
					item: {
						type: "message",
						content: [
							{
								type: "output_text",
								text: "Final answer",
								annotations: [
									{ type: "url_citation", title: "Source", url: "https://example.com" },
									{ type: "url_citation", title: "Duplicate", url: "https://example.com" },
								],
							},
						],
					},
				},
				{
					type: "response.completed",
					response: {
						id: "resp_1",
						model: "gpt-5.1-codex-mini",
						usage: {
							input_tokens: 10,
							output_tokens: 5,
							total_tokens: 15,
							input_tokens_details: { cached_tokens: 2 },
						},
					},
				},
			]);
		};
		const result = await executeCodexWebSearch({
			query: "Daedalus news",
			accessToken,
			fetcher: fetcher as typeof fetch,
			searchContextSize: "high",
		});
		expect(request?.url).toBe("https://chatgpt.com/backend-api/codex/responses");
		const body = JSON.parse(String(request?.init.body));
		expect(body.tools).toEqual([{ type: "web_search", search_context_size: "high" }]);
		expect(body.input[0].content[0].text).toBe("Daedalus news");
		expect(result.answer).toBe("Final answer");
		expect(result.sources).toEqual([{ title: "Source", url: "https://example.com" }]);
		expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 5, totalTokens: 15 });
	});
});
