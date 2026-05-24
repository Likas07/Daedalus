import type { ResponseStreamEvent } from "openai/resources/responses/responses.js";
import { describe, expect, it } from "vitest";
import { processResponsesStream } from "../src/providers/openai-responses-shared.js";
import type { AssistantMessage, AssistantMessageEvent, Model } from "../src/types.js";
import { AssistantMessageEventStream } from "../src/utils/event-stream.js";

const model: Model<"openai-responses"> = {
	id: "gpt-test",
	name: "GPT Test",
	api: "openai-responses",
	provider: "openai",
	baseUrl: "https://api.openai.com/v1",
	reasoning: false,
	input: ["text", "image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128000,
	maxTokens: 4096,
};

function emptyAssistant(): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

async function runEvents(events: AsyncIterable<unknown>, options?: Parameters<typeof processResponsesStream>[4]) {
	const output = emptyAssistant();
	const stream = new AssistantMessageEventStream();
	const seen: AssistantMessageEvent[] = [];
	const collector = (async () => {
		for await (const event of stream) {
			seen.push(event);
		}
	})();

	await processResponsesStream(events as AsyncIterable<ResponseStreamEvent>, output, stream, model, options);
	stream.end(output);
	await collector;
	return { output, events: seen };
}

async function* iterable(events: unknown[]) {
	for (const event of events) {
		yield event;
	}
}

const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("OpenAI Responses image generation stream parsing", () => {
	it("parses completed image_generation_call items into generatedImage content and stream events", async () => {
		const { output, events } = await runEvents(
			iterable([
				{
					type: "response.output_item.added",
					item: { type: "image_generation_call", id: "ig_123", call_id: "call_123", status: "in_progress" },
				},
				{
					type: "response.output_item.done",
					item: {
						type: "image_generation_call",
						id: "ig_123",
						call_id: "call_123",
						status: "completed",
						mime_type: "image/png",
						result: tinyPngBase64,
					},
				},
				{ type: "response.completed", response: { id: "resp_123", status: "completed" } },
			]),
		);

		expect(events.map((event) => event.type)).toEqual(["generated_image_start", "generated_image_end"]);
		expect(output.content).toHaveLength(1);
		const block = output.content[0];
		expect(block).toMatchObject({
			type: "generatedImage",
			id: "call_123",
			providerItemId: "ig_123",
			mimeType: "image/png",
			data: tinyPngBase64,
			status: "completed",
		});
	});

	it("preserves text parsing when no image_generation_call appears", async () => {
		const { output, events } = await runEvents(
			iterable([
				{
					type: "response.output_item.added",
					item: { type: "message", id: "msg_1", role: "assistant", content: [], status: "in_progress" },
				},
				{ type: "response.content_part.added", part: { type: "output_text", text: "", annotations: [] } },
				{ type: "response.output_text.delta", delta: "hello" },
				{ type: "response.output_text.delta", delta: " world" },
				{
					type: "response.output_item.done",
					item: {
						type: "message",
						id: "msg_1",
						role: "assistant",
						content: [{ type: "output_text", text: "hello world", annotations: [] }],
						status: "completed",
					},
				},
				{ type: "response.completed", response: { id: "resp_1", status: "completed" } },
			]),
		);

		expect(events.map((event) => event.type)).toEqual(["text_start", "text_delta", "text_delta", "text_end"]);
		expect(output.content).toHaveLength(1);
		expect(output.content[0]).toMatchObject({ type: "text", text: "hello world" });
	});

	it("merges persisted artifact metadata and omits base64 data", async () => {
		const { output } = await runEvents(
			iterable([
				{ type: "response.output_item.added", item: { type: "image_generation_call", id: "ig_456" } },
				{
					type: "response.output_item.done",
					item: { type: "image_generation_call", id: "ig_456", status: "completed", result: tinyPngBase64 },
				},
			]),
			{
				onGeneratedImage: async (image) => {
					expect(image.data).toBe(tinyPngBase64);
					return {
						path: "/tmp/generated.png",
						fileUri: "file:///tmp/generated.png",
						visiblePath: "generated.png",
						persisted: true,
					};
				},
			},
		);

		const block = output.content[0];
		expect(block).toMatchObject({
			type: "generatedImage",
			path: "/tmp/generated.png",
			fileUri: "file:///tmp/generated.png",
			visiblePath: "generated.png",
		});
		expect(block).not.toHaveProperty("data");
	});
});
