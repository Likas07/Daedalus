import { describe, expect, test } from "bun:test";
import { CanonicalAgentEventNormalizer, type RuntimeAgentEvent } from "./canonical-agent-events";

const options = { sessionId: "session-1", turnId: "turn-1" };

function normalize(events: readonly RuntimeAgentEvent[]) {
	const normalizer = new CanonicalAgentEventNormalizer();
	return events.flatMap((event) => normalizer.normalize(event, options).events);
}

describe("canonical agent event normalizer", () => {
	test("maps raw text_start to agent/message_start", () => {
		const events = normalize([
			{
				type: "text_start",
				partial: {
					role: "assistant",
					responseId: "response-1",
					provider: "openai",
					model: "gpt-test",
				},
			},
		]);

		expect(events).toEqual([
			{
				type: "agent/message_start",
				payload: {
					sessionId: "session-1",
					turnId: "turn-1",
					messageId: "response-1",
					role: "assistant",
					responseId: "response-1",
					provider: "openai",
					model: "gpt-test",
				},
			},
		]);
	});

	test("keeps only explicit incremental deltas from cumulative text partials", () => {
		const events = normalize([
			{
				type: "message_update",
				message: {
					role: "assistant",
					responseId: "response-1",
					content: [{ type: "text", text: "Hello" }],
				},
				assistantMessageEvent: {
					type: "text_delta",
					delta: "Hello",
					partial: { role: "assistant", responseId: "response-1", content: [{ type: "text", text: "Hello" }] },
				},
			},
			{
				type: "message_update",
				message: {
					role: "assistant",
					responseId: "response-1",
					content: [{ type: "text", text: "Hello there" }],
				},
				assistantMessageEvent: {
					type: "text_delta",
					delta: " there",
					partial: {
						role: "assistant",
						responseId: "response-1",
						content: [{ type: "text", text: "Hello there" }],
					},
				},
			},
			{
				type: "message_update",
				message: {
					role: "assistant",
					responseId: "response-1",
					content: [{ type: "text", text: "Hello there!" }],
				},
			},
		]);

		expect(events.map((event) => event.type)).toEqual([
			"agent/message_start",
			"agent/message_delta",
			"agent/message_delta",
		]);
		expect(
			events.filter((event) => event.type === "agent/message_delta").map((event) => event.payload.delta),
		).toEqual(["Hello", " there"]);
	});

	test("does not turn raw text_end into a duplicate delta", () => {
		const events = normalize([
			{ type: "text_start", partial: { role: "assistant", responseId: "response-1" } },
			{
				type: "text_delta",
				delta: "Hello",
				partial: { role: "assistant", responseId: "response-1", content: [{ type: "text", text: "Hello" }] },
			},
			{
				type: "text_end",
				content: "Hello",
				partial: { role: "assistant", responseId: "response-1", content: [{ type: "text", text: "Hello" }] },
			},
		]);

		expect(events.map((event) => event.type)).toEqual(["agent/message_start", "agent/message_delta"]);
	});

	test("maps message_end content arrays to final text", () => {
		const events = normalize([
			{
				type: "message_end",
				message: {
					role: "assistant",
					id: "message-1",
					content: [
						{ type: "text", text: "Hello" },
						{ type: "text", text: " there" },
					],
				},
				usage: { outputTokens: 2 },
			},
		]);

		expect(events).toEqual([
			{
				type: "agent/message_start",
				payload: {
					sessionId: "session-1",
					turnId: "turn-1",
					messageId: "message-1",
					role: "assistant",
				},
			},
			{
				type: "agent/message_end",
				payload: {
					sessionId: "session-1",
					turnId: "turn-1",
					messageId: "message-1",
					role: "assistant",
					content: "Hello there",
					usage: { outputTokens: 2 },
				},
			},
		]);
	});

	test("uses a stable fallback id when response id is missing", () => {
		const events = normalize([
			{ type: "text_start", partial: { role: "assistant", content: [] } },
			{
				type: "text_delta",
				delta: "Hello",
				partial: { role: "assistant", content: [{ type: "text", text: "Hello" }] },
			},
			{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Hello" }] } },
		]);

		expect(events.map((event) => ("messageId" in event.payload ? event.payload.messageId : undefined))).toEqual([
			"turn-1:assistant",
			"turn-1:assistant",
			"turn-1:assistant",
		]);
	});

	test("keeps two assistant messages in one turn on distinct stable ids", () => {
		const events = normalize([
			{ type: "message_start", message: { role: "assistant", content: [] } },
			{ type: "message_end", message: { role: "assistant", content: "First" } },
			{ type: "message_start", message: { role: "assistant", content: [] } },
			{ type: "message_end", message: { role: "assistant", content: "Second" } },
		]);

		const finalMessages = events.filter((event) => event.type === "agent/message_end");
		expect(finalMessages.map((event) => event.payload.messageId)).toEqual(["turn-1:assistant", "turn-1:assistant:2"]);
		expect(finalMessages.map((event) => event.payload.content)).toEqual(["First", "Second"]);
	});
});
