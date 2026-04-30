import { describe, expect, test } from "bun:test";
import { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { Value } from "@sinclair/typebox/value";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { buildThreadV1Snapshot, replayThreadV1 } from "./thread-v1-projection";

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
});
