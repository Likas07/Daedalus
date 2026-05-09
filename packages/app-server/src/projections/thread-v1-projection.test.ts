import { describe, expect, test } from "bun:test";
import { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { Value } from "@sinclair/typebox/value";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { notificationForThreadV1StoredEvent } from "../server/thread-v1-routes";
import { buildThreadV1Snapshot, projectStoredEventToTimelineEntry, replayThreadV1 } from "./thread-v1-projection";

function seededDatabase() {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	appendEvent(database, {
		streamId: "app",
		type: "project/registered",
		payload: { projectId: "project-1", name: "Project", path: "/repo" },
	});
	appendEvent(database, {
		streamId: "app",
		type: "worktree/registered",
		payload: { worktreeId: "target-1", projectId: "project-1", path: "/repo-wt", branch: "feature" },
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "session/started",
		payload: {
			sessionId: "thread-1",
			projectId: "project-1",
			worktreeId: "target-1",
			title: "Thread title",
			runsIn: {
				projectId: "project-1",
				worktreeId: "target-1",
				canonicalPath: "/repo-wt",
				branch: "feature",
				isolationMode: "isolated-worktree",
				validationStatus: "valid",
			},
		},
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "turn/started",
		payload: { sessionId: "thread-1", turnId: "turn-1", prompt: "Hello", content: "Hello" },
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "agent/message_end",
		payload: {
			sessionId: "thread-1",
			turnId: "turn-1",
			message: { id: "message-1", role: "assistant", content: "Hi" },
		},
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "approval/requested",
		payload: { sessionId: "thread-1", approvalId: "approval-1", request: { summary: "Run command" } },
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "turn/completed",
		payload: { sessionId: "thread-1", turnId: "turn-1" },
	});
	projectRuntimeEvents(database);
	return database;
}

describe("thread v1 projection", () => {
	test("projects persisted events into Thread, Turn, and ordered TimelineEntry windows", () => {
		const database = seededDatabase();
		try {
			const snapshot = buildThreadV1Snapshot({ database, threadId: "thread-1" });
			expect(Value.Check(protocolV1.ThreadSchema, snapshot.thread)).toBe(true);
			expect(snapshot.thread).toMatchObject({
				threadId: "thread-1",
				projectId: "project-1",
				workspaceTargetId: "target-1",
				title: "Thread title",
				status: "waiting",
			});
			expect(snapshot.turns).toHaveLength(1);
			expect(snapshot.turns[0]).toMatchObject({ turnId: "turn-1", threadId: "thread-1", prompt: "Hello" });
			expect(snapshot.timeline.entries.map((entry) => [entry.kind, entry.sequence])).toEqual([
				["user-message", 4],
				["assistant-message", 5],
				["approval", 6],
				["activity", 7],
			]);
			expect(snapshot.timeline.entries.every((entry) => Value.Check(protocolV1.TimelineEntrySchema, entry))).toBe(
				true,
			);
		} finally {
			database.close();
		}
	});

	test("replays stable cursor windows without duplicate rows", () => {
		const database = seededDatabase();
		try {
			const first = replayThreadV1({ database, params: { threadId: "thread-1", limit: 2 } });
			expect(first.entries.map((entry) => entry.entryId)).toEqual(["turn:turn-1:user", "message:message-1"]);
			expect(first.nextCursor).toEqual({ seq: 5 });
			expect(first.hasMoreAfter).toBe(true);
			const second = replayThreadV1({
				database,
				params: { threadId: "thread-1", after: first.nextCursor, limit: 10 },
			});
			expect(second.entries.map((entry) => entry.entryId)).toEqual(["approval:approval-1", "turn:turn-1:completed"]);
			expect(new Set([...first.entries, ...second.entries].map((entry) => entry.entryId)).size).toBe(4);
			const repeat = replayThreadV1({
				database,
				params: { threadId: "thread-1", after: first.nextCursor, limit: 10 },
			});
			expect(repeat).toEqual(second);
		} finally {
			database.close();
		}
	});

	test("replays AppEvent-shaped nested turn prompt content from stored events", () => {
		const database = seededDatabase();
		try {
			appendEvent(database, {
				streamId: "thread-1",
				type: "turn/started",
				payload: {
					id: "event-turn-2",
					type: "turn/started",
					ts: "2026-04-30T00:00:03.000Z",
					sessionId: "thread-1",
					payload: {
						sessionId: "thread-1",
						turnId: "turn-2",
						prompt: "QA final browser turn",
						content: "QA final browser turn",
					},
				},
			});

			const snapshot = buildThreadV1Snapshot({ database, threadId: "thread-1" });
			expect(snapshot.turns.find((turn) => turn.turnId === "turn-2")).toMatchObject({
				turnId: "turn-2",
				prompt: "QA final browser turn",
			});
			expect(snapshot.timeline.entries.find((entry) => entry.entryId === "turn:turn-2:user")).toMatchObject({
				kind: "user-message",
				content: "QA final browser turn",
			});
		} finally {
			database.close();
		}
	});

	test("projects AppEvent-shaped nested turn prompts without losing normalized payload support", () => {
		const normalized = projectStoredEventToTimelineEntry({
			seq: 8,
			streamId: "thread-1",
			type: "turn/started",
			payload: { sessionId: "thread-1", turnId: "turn-normalized", prompt: "Normalized prompt" },
			createdAt: "2026-04-30T00:00:00.000Z",
		});
		expect(normalized).toMatchObject({
			entryId: "turn:turn-normalized:user",
			threadId: "thread-1",
			kind: "user-message",
			content: "Normalized prompt",
		});

		const appEventShaped = projectStoredEventToTimelineEntry({
			seq: 9,
			streamId: "thread-1",
			type: "turn/started",
			payload: {
				id: "event-9",
				type: "turn/started",
				ts: "2026-04-30T00:00:01.000Z",
				sessionId: "thread-1",
				payload: { turnId: "turn-app-event", content: "QA final browser turn" },
			},
			createdAt: "2026-04-30T00:00:01.000Z",
		});
		expect(appEventShaped).toMatchObject({
			entryId: "turn:turn-app-event:user",
			threadId: "thread-1",
			kind: "user-message",
			turnId: "turn-app-event",
			messageId: "turn-app-event",
			content: "QA final browser turn",
		});
	});

	test("thread timeline notifications include AppEvent-shaped nested turn prompt content", () => {
		const notification = notificationForThreadV1StoredEvent({
			seq: 10,
			streamId: "thread-1",
			type: "turn/started",
			payload: {
				id: "event-10",
				type: "turn/started",
				ts: "2026-04-30T00:00:02.000Z",
				sessionId: "thread-1",
				payload: { turnId: "turn-live", prompt: "QA final browser turn" },
			},
			createdAt: "2026-04-30T00:00:02.000Z",
		});

		expect(notification).toMatchObject({
			kind: "notification",
			method: "thread.timeline",
			params: {
				threadId: "thread-1",
				nextCursor: { seq: 10 },
				entry: {
					entryId: "turn:turn-live:user",
					kind: "user-message",
					content: "QA final browser turn",
				},
			},
		});
	});

	test("thread timeline notifications include assistant deltas", () => {
		const notification = notificationForThreadV1StoredEvent({
			seq: 11,
			streamId: "thread-1",
			type: "agent/message_update",
			payload: {
				id: "event-11",
				type: "agent/message_update",
				ts: "2026-04-30T00:00:03.000Z",
				sessionId: "thread-1",
				payload: { turnId: "turn-live", messageId: "message-1", delta: "Hello" },
			},
			createdAt: "2026-04-30T00:00:03.000Z",
		});

		expect(notification).toEqual({
			kind: "notification",
			method: "thread.timeline.delta",
			params: {
				threadId: "thread-1",
				turnId: "turn-live",
				entryId: "message:message-1",
				sequence: 11,
				kind: "assistant-message",
				delta: "Hello",
			},
		});
	});

	test("projects tool lifecycle command output and file changes into timeline entries", () => {
		const database = seededDatabase();
		try {
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/tool_execution_start",
				payload: { sessionId: "thread-1", turnId: "turn-1", toolCallId: "tool-1", toolName: "shell" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/tool_execution_update",
				payload: { sessionId: "thread-1", turnId: "turn-1", toolCallId: "tool-1", toolName: "shell", delta: "line" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/tool_execution_end",
				payload: { sessionId: "thread-1", turnId: "turn-1", toolCallId: "tool-1", toolName: "shell", output: "done" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/command_output",
				payload: { sessionId: "thread-1", turnId: "turn-1", commandId: "cmd-1", output: "stdout" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/file_change",
				payload: { sessionId: "thread-1", turnId: "turn-1", filePath: "src/app.ts", operation: "modified" },
			});

			const entries = replayThreadV1({ database, params: { threadId: "thread-1", limit: 100 } }).entries;
			expect(entries).toContainEqual(expect.objectContaining({ entryId: "tool:tool-1", kind: "tool", status: "running" }));
			expect(entries).toContainEqual(
				expect.objectContaining({ entryId: "tool:tool-1:end", kind: "tool", status: "completed" }),
			);
			expect(entries).toContainEqual(expect.objectContaining({ entryId: "command:cmd-1:output:11", kind: "terminal-output" }));
			expect(entries).toContainEqual(expect.objectContaining({ entryId: "file-change:12", kind: "activity" }));
		} finally {
			database.close();
		}
	});
});
