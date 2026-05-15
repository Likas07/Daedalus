import { describe, expect, test } from "bun:test";
import { mapCanonicalAgentEvent, mapRuntimeEvent } from "./event-mapper";

describe("runtime event mapper", () => {
	test("maps runtime message and tool events into durable agent events", () => {
		let id = 0;
		const options = {
			sessionId: "thread-1",
			turnId: "turn-1",
			nextEventId: () => `event-${++id}`,
			now: () => new Date("2026-05-08T00:00:00.000Z"),
		};

		expect(
			mapRuntimeEvent({ type: "message_update", messageId: "message-1", delta: "hi" }, options).event,
		).toMatchObject({
			id: "event-1",
			type: "agent/message_update",
			sessionId: "thread-1",
			payload: { type: "message_update", messageId: "message-1", delta: "hi" },
		});
		expect(
			mapRuntimeEvent({ type: "tool_execution_update", toolCallId: "tool-1", delta: "out" }, options).event,
		).toMatchObject({
			id: "event-2",
			type: "agent/tool_execution_update",
			sessionId: "thread-1",
			payload: { type: "tool_execution_update", toolCallId: "tool-1", delta: "out" },
		});
	});

	test("maps canonical runtime events without rewriting their type or payload", () => {
		let id = 0;
		const mapped = mapCanonicalAgentEvent(
			{
				type: "agent/message_delta",
				payload: {
					sessionId: "thread-1",
					turnId: "turn-1",
					messageId: "message-1",
					delta: "hi",
				},
			},
			{
				sessionId: "thread-1",
				nextEventId: () => `event-${++id}`,
				now: () => new Date("2026-05-08T00:00:00.000Z"),
			},
		);

		expect(mapped).toEqual({
			event: {
				id: "event-1",
				type: "agent/message_delta",
				ts: "2026-05-08T00:00:00.000Z",
				sessionId: "thread-1",
				payload: {
					sessionId: "thread-1",
					turnId: "turn-1",
					messageId: "message-1",
					delta: "hi",
				},
			},
		});
	});
});
