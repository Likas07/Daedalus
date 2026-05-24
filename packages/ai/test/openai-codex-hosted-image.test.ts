import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamOpenAICodexResponses } from "../src/providers/openai-codex-responses.js";
import type { Context, Model } from "../src/types.js";

const originalFetch = global.fetch;

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

function mockToken(): string {
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
		"utf8",
	).toString("base64");
	return `aaa.${payload}.bbb`;
}

const model: Model<"openai-codex-responses"> = {
	id: "gpt-5.1-codex",
	name: "GPT-5.1 Codex",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 400000,
	maxTokens: 128000,
};

const baseContext: Context = {
	systemPrompt: "You are a helpful assistant.",
	messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
};

function completedSse(): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({
						type: "response.completed",
						response: { status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
					})}\n\n`,
				),
			);
			controller.close();
		},
	});
}

async function capturePayload(
	context: Context,
	options: Parameters<typeof streamOpenAICodexResponses>[2] = {},
): Promise<Record<string, unknown>> {
	let payload: Record<string, unknown> | undefined;
	global.fetch = vi.fn(async (input: string | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === "https://chatgpt.com/backend-api/codex/responses") {
			return new Response(completedSse(), { status: 200, headers: { "content-type": "text/event-stream" } });
		}
		return new Response("not found", { status: 404 });
	}) as unknown as typeof fetch;

	await streamOpenAICodexResponses(model, context, {
		apiKey: mockToken(),
		...options,
		onPayload: (body) => {
			payload = body as Record<string, unknown>;
			return body;
		},
	}).result();

	if (!payload) throw new Error("payload was not captured");
	return payload;
}

function imageTools(payload: Record<string, unknown>): Record<string, unknown>[] {
	return ((payload.tools as Record<string, unknown>[] | undefined) ?? []).filter(
		(tool) => tool.type === "image_generation",
	);
}

describe("openai-codex hosted image generation payload", () => {
	it("does not add hosted image_generation when omitted", async () => {
		const payload = await capturePayload(baseContext);
		expect(imageTools(payload)).toHaveLength(0);
	});

	it("does not add hosted image_generation when disabled", async () => {
		const payload = await capturePayload(baseContext, { hostedImageGeneration: false });
		expect(imageTools(payload)).toHaveLength(0);
	});

	it("appends one PNG hosted image_generation tool when enabled", async () => {
		const payload = await capturePayload(baseContext, { hostedImageGeneration: true });
		expect(imageTools(payload)).toEqual([{ type: "image_generation", output_format: "png" }]);
	});

	it("supports explicit PNG option and preserves converted function tools", async () => {
		const payload = await capturePayload(
			{
				...baseContext,
				tools: [
					{
						name: "lookup",
						description: "Look something up",
						parameters: Type.Object({ query: Type.String() }),
					},
				],
			},
			{ hostedImageGeneration: { outputFormat: "png" } },
		);

		expect(payload.tools).toEqual([
			{
				type: "function",
				name: "lookup",
				description: "Look something up",
				parameters: Type.Object({ query: Type.String() }),
				strict: null,
			},
			{ type: "image_generation", output_format: "png" },
		]);
	});
});
