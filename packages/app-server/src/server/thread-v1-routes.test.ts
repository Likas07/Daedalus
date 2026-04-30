import { describe, expect, test } from "bun:test";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { AppRouter } from "./router";
import { handleThreadV1Request } from "./thread-v1-routes";

function databaseWithThread() {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	appendEvent(database, {
		streamId: "app",
		type: "project/registered",
		payload: { projectId: "project-1", path: "/repo" },
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "session/started",
		payload: {
			sessionId: "thread-1",
			projectId: "project-1",
			title: "Thread",
			runsIn: {
				projectId: "project-1",
				canonicalPath: "/repo",
				branch: "main",
				isolationMode: "base-checkout",
				validationStatus: "valid",
			},
		},
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "turn/started",
		payload: { sessionId: "thread-1", turnId: "turn-1", prompt: "Hello" },
	});
	projectRuntimeEvents(database);
	return database;
}

describe("thread v1 routes", () => {
	test("router handles thread.get and thread.replay without exposing sessionId", async () => {
		const database = databaseWithThread();
		try {
			const router = new AppRouter({
				database,
				publish: () => {},
				controller: {
					readState: () => ({ sessions: [] }),
					startTurn: async () => ({ turnId: "turn-new" }),
					interruptTurn: async () => {},
				} as never,
			});
			const get = (await router.handle({
				kind: "request",
				id: "v1-get",
				method: "thread.get",
				params: { threadId: "thread-1" },
			} as never)) as { thread: { threadId: string }; timeline: { entries: unknown[] } };
			expect(get.thread.threadId).toBe("thread-1");
			expect(JSON.stringify(get)).not.toContain("sessionId");
			const replay = (await router.handle({
				kind: "request",
				id: "v1-replay",
				method: "thread.replay",
				params: { threadId: "thread-1", limit: 1 },
			} as never)) as { entries: unknown[]; nextCursor?: { seq: number } };
			expect(replay.entries).toHaveLength(1);
			expect(replay.nextCursor).toEqual({ seq: 3 });
		} finally {
			database.close();
		}
	});

	test("turn.start and turn.cancel route through runtime authority", async () => {
		const database = databaseWithThread();
		const calls: string[] = [];
		try {
			const start = await handleThreadV1Request(
				{
					database,
					authority: {
						startTurn: async (input) => {
							calls.push(`start:${input.threadId}:${input.prompt}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/started",
								payload: { sessionId: input.threadId, turnId: "turn-2", prompt: input.prompt },
							});
							return { turnId: "turn-2" };
						},
						cancelTurn: async (input) => {
							calls.push(`cancel:${input.threadId}:${input.turnId}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/interrupted",
								payload: { sessionId: input.threadId, turnId: input.turnId },
							});
						},
					},
				},
				{ method: "turn.start", params: { threadId: "thread-1", prompt: "Next" } },
			);
			expect(calls).toEqual(["start:thread-1:Next"]);
			expect(start.result).toMatchObject({ turn: { turnId: "turn-2", threadId: "thread-1", status: "running" } });
			const cancel = await handleThreadV1Request(
				{
					database,
					authority: {
						startTurn: async () => ({ turnId: "unused" }),
						cancelTurn: async (input) => {
							calls.push(`cancel:${input.threadId}:${input.turnId}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/interrupted",
								payload: { sessionId: input.threadId, turnId: input.turnId },
							});
						},
					},
				},
				{ method: "turn.cancel", params: { threadId: "thread-1", turnId: "turn-2" } },
			);
			expect(calls.at(-1)).toBe("cancel:thread-1:turn-2");
			expect(cancel.result).toMatchObject({ turn: { turnId: "turn-2", status: "cancelled" } });
		} finally {
			database.close();
		}
	});
});
