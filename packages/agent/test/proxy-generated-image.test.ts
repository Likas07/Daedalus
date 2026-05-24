import type { AssistantMessageEvent, Model } from "@daedalus-pi/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamProxy } from "../src/proxy.js";

function createModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function sseResponse(events: unknown[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				}
				controller.close();
			},
		}),
		{ status: 200, statusText: "OK" },
	);
}

describe("streamProxy generated image reconstruction", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reconstructs generated image start and end events with partial messages", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			sseResponse([
				{ type: "start" },
				{
					type: "generated_image_start",
					contentIndex: 0,
					id: "img_1",
					providerItemId: "item_1",
					mimeType: "image/png",
					status: "in_progress",
				},
				{
					type: "generated_image_end",
					contentIndex: 0,
					id: "img_1",
					providerItemId: "item_1",
					mimeType: "image/png",
					data: "iVBORw0KGgo=",
					path: "/tmp/image.png",
					fileUri: "file:///tmp/image.png",
					visiblePath: "image.png",
					status: "completed",
				},
				{
					type: "done",
					reason: "stop",
					usage: {
						input: 1,
						output: 2,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 3,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
				},
			]),
		);

		const stream = streamProxy(
			createModel(),
			{ messages: [] },
			{ authToken: "token", proxyUrl: "https://proxy.example.invalid" },
		);
		const events: AssistantMessageEvent[] = [];
		for await (const event of stream) events.push(event);
		const result = await stream.result();

		expect(events.map((event) => event.type)).toEqual([
			"start",
			"generated_image_start",
			"generated_image_end",
			"done",
		]);

		const start = events[1];
		expect(start.type).toBe("generated_image_start");
		if (start.type !== "generated_image_start") throw new Error("expected generated_image_start");
		expect(start.image).toMatchObject({
			type: "generatedImage",
			id: "img_1",
			providerItemId: "item_1",
			mimeType: "image/png",
			status: "in_progress",
		});

		const end = events[2];
		expect(end.type).toBe("generated_image_end");
		if (end.type !== "generated_image_end") throw new Error("expected generated_image_end");
		expect(end.image).toMatchObject({
			type: "generatedImage",
			id: "img_1",
			providerItemId: "item_1",
			mimeType: "image/png",
			data: "iVBORw0KGgo=",
			path: "/tmp/image.png",
			fileUri: "file:///tmp/image.png",
			visiblePath: "image.png",
			status: "completed",
		});
		expect(result.content[0]).toMatchObject(end.image);
	});
});
