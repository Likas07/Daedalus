import { afterEach, describe, expect, it, vi } from "vitest";
import { getModel } from "../src/models.js";
import { streamOpenAIResponses } from "../src/providers/openai-responses.js";

function buildSSE(): string {
	return `${[
		`data: ${JSON.stringify({
			type: "response.output_item.added",
			item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
		})}`,
		`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
		`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
		`data: ${JSON.stringify({
			type: "response.output_item.done",
			item: {
				type: "message",
				id: "msg_1",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Hello" }],
			},
		})}`,
		`data: ${JSON.stringify({
			type: "response.completed",
			response: {
				status: "completed",
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					total_tokens: 150,
					input_tokens_details: { cached_tokens: 0 },
				},
			},
		})}`,
	].join("\n\n")}\n\n`;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("openai fast mode", () => {
	it("sets service_tier priority and doubles pricing for supported models", async () => {
		const model = getModel("openai", "gpt-5.4");
		let capturedPayload: Record<string, unknown> | undefined;

		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(buildSSE(), {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			}),
		);

		const stream = streamOpenAIResponses(
			model,
			{
				systemPrompt: "sys",
				messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
			},
			{
				apiKey: "test-key",
				fastMode: true,
				onPayload: (payload) => {
					capturedPayload = payload as Record<string, unknown>;
				},
			},
		);

		const result = await stream.result();
		const baseInputCost = (model.cost.input / 1_000_000) * 100;
		const baseOutputCost = (model.cost.output / 1_000_000) * 50;
		const baseTotal = baseInputCost + baseOutputCost;

		expect(capturedPayload?.service_tier).toBe("priority");
		expect(result.usage.cost.total).toBeCloseTo(baseTotal * 2, 12);
	});

	it("omits service_tier for unsupported models even when fastMode is enabled", async () => {
		const model = getModel("openai", "gpt-4o-mini");
		let capturedPayload: Record<string, unknown> | undefined;

		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(buildSSE(), {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			}),
		);

		const stream = streamOpenAIResponses(
			model,
			{
				systemPrompt: "sys",
				messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
			},
			{
				apiKey: "test-key",
				fastMode: true,
				onPayload: (payload) => {
					capturedPayload = payload as Record<string, unknown>;
				},
			},
		);

		await stream.result();
		expect(capturedPayload?.service_tier).toBeUndefined();
	});
});
