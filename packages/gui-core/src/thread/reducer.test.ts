import { describe, expect, test } from "bun:test";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { createInitialThreadLoopState, threadLoopReducer } from "./reducer";
import { selectThreadViewModel, selectTimelineEntries, selectTimelineViewModels } from "./selectors";

const thread: protocolV1.Thread = {
	threadId: "thread-1",
	projectId: "project-1",
	workspaceTargetId: "target-1",
	title: "Thread",
	status: "idle",
	updatedAt: "2026-04-30T00:00:00.000Z",
};

const userEntry: protocolV1.TimelineEntry = {
	entryId: "entry-user",
	threadId: "thread-1",
	turnId: "turn-1",
	sequence: 1,
	createdAt: "2026-04-30T00:00:01.000Z",
	kind: "user-message",
	role: "user",
	content: "Hello",
};

const terminalEntry: protocolV1.TimelineEntry = {
	entryId: "entry-terminal",
	threadId: "thread-1",
	turnId: "turn-1",
	sequence: 2,
	createdAt: "2026-04-30T00:00:02.000Z",
	kind: "terminal-output",
	summary: "lots of output",
	payloadRef: { kind: "terminal-output", terminalId: "terminal-1", cursor: { seq: 2 }, byteLength: 4096 },
};

const assistantEntry: protocolV1.TimelineEntry = {
	entryId: "entry-assistant",
	threadId: "thread-1",
	turnId: "turn-1",
	sequence: 3,
	createdAt: "2026-04-30T00:00:03.000Z",
	kind: "assistant-message",
	role: "assistant",
	content: "Hi",
};

describe("thread loop reducer", () => {
	test("applies replay windows and live events into the same visible timeline", () => {
		const replayState = threadLoopReducer(
			threadLoopReducer(createInitialThreadLoopState(), { type: "thread.loaded", thread }),
			{
				type: "thread.replayApplied",
				window: {
					threadId: "thread-1",
					entries: [userEntry, terminalEntry, assistantEntry],
					nextCursor: { seq: 3 },
					previousCursor: { seq: 1 },
					hasMoreAfter: false,
					hasMoreBefore: false,
				},
			},
		);
		const liveState = [userEntry, terminalEntry, assistantEntry].reduce(
			(state, entry) =>
				threadLoopReducer(state, {
					type: "thread.timelineEntryReceived",
					entry,
					nextCursor: { seq: entry.sequence },
				}),
			threadLoopReducer(createInitialThreadLoopState(), { type: "thread.loaded", thread }),
		);
		expect(selectTimelineEntries(replayState)).toEqual(selectTimelineEntries(liveState));
		expect(selectThreadViewModel(replayState).timeline.map((item) => item.title)).toEqual([
			"You",
			"Terminal output",
			"Daedalus",
		]);
	});

	test("dedupes live entries and renders heavy payload references as placeholders", () => {
		let state = createInitialThreadLoopState();
		state = threadLoopReducer(state, { type: "thread.timelineEntryReceived", entry: terminalEntry });
		state = threadLoopReducer(state, { type: "thread.timelineEntryReceived", entry: terminalEntry });
		expect(state.timelineOrder).toEqual(["entry-terminal"]);
		expect(selectTimelineViewModels(state)[0]?.placeholder).toBe("Terminal output placeholder (4096 bytes)");
	});

	test("tracks turn start and cancel state", () => {
		let state = threadLoopReducer(createInitialThreadLoopState(), { type: "thread.loaded", thread });
		state = threadLoopReducer(state, {
			type: "turn.started",
			turn: {
				threadId: "thread-1",
				turnId: "turn-1",
				status: "running",
				prompt: "Hello",
				createdAt: "2026-04-30T00:00:01.000Z",
				updatedAt: "2026-04-30T00:00:01.000Z",
			},
		});
		expect(state.thread?.status).toBe("running");
		state = threadLoopReducer(state, {
			type: "turn.cancelled",
			turn: {
				threadId: "thread-1",
				turnId: "turn-1",
				status: "cancelled",
				createdAt: "2026-04-30T00:00:01.000Z",
				updatedAt: "2026-04-30T00:00:02.000Z",
			},
		});
		expect(state.thread?.status).toBe("idle");
		expect(state.turnsById["turn-1"]?.status).toBe("cancelled");
	});
});
