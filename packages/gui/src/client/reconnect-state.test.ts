import { describe, expect, test } from "bun:test";
import {
	createReconnectState,
	eventCursor,
	nextReconnectDelay,
	setConnected,
	setDisconnected,
	setFailed,
	setReplaying,
	shouldAcceptEvent,
} from "./reconnect-state";

describe("reconnect state", () => {
	test("moves through connection statuses", () => {
		const state = createReconnectState({ baseDelayMs: 5 });
		expect(state.status).toBe("connecting");
		setConnected(state, { baseDelayMs: 5 });
		expect(state.status).toBe("connected");
		setDisconnected(state, new Error("closed"));
		expect(state.status).toBe("disconnected");
		expect(state.lastError).toBe("closed");
		setReplaying(state);
		expect(state.status).toBe("replaying");
		setFailed(state, "boom");
		expect(state.status).toBe("failed");
	});

	test("tracks cursors and suppresses duplicates", () => {
		const state = createReconnectState();
		expect(eventCursor({ seq: 42, id: "event-1" })).toBe("42");
		expect(shouldAcceptEvent(state, { id: "event-1" })).toBe(true);
		expect(state.lastEventCursor).toBe("event-1");
		expect(shouldAcceptEvent(state, { id: "event-1" })).toBe(false);
		expect(shouldAcceptEvent(state, { seq: 2 })).toBe(true);
		expect(state.lastEventCursor).toBe("2");
	});

	test("uses bounded exponential backoff", () => {
		const state = createReconnectState({ baseDelayMs: 10 });
		expect(nextReconnectDelay(state, { baseDelayMs: 10, maxDelayMs: 25 })).toBe(10);
		expect(nextReconnectDelay(state, { baseDelayMs: 10, maxDelayMs: 25 })).toBe(20);
		expect(nextReconnectDelay(state, { baseDelayMs: 10, maxDelayMs: 25 })).toBe(25);
	});
});
