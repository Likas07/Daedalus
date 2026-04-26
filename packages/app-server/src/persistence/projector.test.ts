import { afterEach, describe, expect, test } from "bun:test";
import type { AppServerDatabase } from "./database";
import { openAppServerDatabase } from "./database";
import { appendEvent } from "./event-store";
import { runMigrations } from "./migrations";
import { projectRuntimeEvents } from "./projector";
import {
	listActiveApprovals,
	listIntegrationResources,
	listProjectSessions,
	listProjects,
	listSessionTurns,
	listTerminalSessions,
	listWorktrees,
} from "./read-model";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function migratedInMemoryDatabase(): AppServerDatabase {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return database;
}

describe("runtime event projector", () => {
	test("projects events into read-model tables idempotently", () => {
		const db = migratedInMemoryDatabase();

		appendEvent(db, {
			streamId: "project:project-1",
			type: "project/registered",
			payload: { projectId: "project-1", name: "Daedalus", path: "/repo" },
		});
		appendEvent(db, {
			streamId: "worktree:worktree-1",
			type: "worktree/created",
			payload: {
				worktreeId: "worktree-1",
				projectId: "project-1",
				path: "/repo/.worktrees/feature",
				branch: "feature",
				baseBranch: "main",
			},
		});
		appendEvent(db, {
			streamId: "session:session-1",
			type: "session/started",
			payload: { sessionId: "session-1", projectId: "project-1", worktreeId: "worktree-1", title: "Build GUI" },
		});
		appendEvent(db, {
			streamId: "session:session-1",
			type: "turn/started",
			payload: { turnId: "turn-1", sessionId: "session-1", role: "user", content: "implement task" },
		});
		appendEvent(db, {
			streamId: "session:session-1",
			type: "turn/completed",
			payload: { turnId: "turn-2", sessionId: "session-1", role: "assistant", content: "done" },
		});
		appendEvent(db, {
			streamId: "approval:approval-1",
			type: "approval/requested",
			payload: { approvalId: "approval-1", sessionId: "session-1", request: { command: "bun test" } },
		});
		appendEvent(db, {
			streamId: "approval:approval-2",
			type: "approval/requested",
			payload: { approvalId: "approval-2", sessionId: "session-1", request: "edit file" },
		});
		appendEvent(db, {
			streamId: "approval:approval-2",
			type: "approval/resolved",
			payload: { approvalId: "approval-2", status: "approved", response: { by: "user" } },
		});
		appendEvent(db, {
			streamId: "checkpoint:checkpoint-1",
			type: "checkpoint/created",
			payload: {
				checkpointId: "checkpoint-1",
				sessionId: "session-1",
				worktreeId: "worktree-1",
				label: "before changes",
				metadata: { sha: "abc123" },
			},
		});
		appendEvent(db, {
			streamId: "terminal:terminal-1",
			type: "terminal/started",
			payload: { terminalId: "terminal-1", projectId: "project-1", worktreeId: "worktree-1", cwd: "/repo" },
		});

		const firstRun = projectRuntimeEvents(db);
		const secondRun = projectRuntimeEvents(db);

		expect(firstRun.projected).toBe(10);
		expect(firstRun.lastSeq).toBe(10);
		expect(secondRun).toEqual({ projected: 0, lastSeq: 10 });
		expect(rowCount(db, "projects")).toBe(1);
		expect(rowCount(db, "worktrees")).toBe(1);
		expect(rowCount(db, "sessions")).toBe(1);
		expect(rowCount(db, "turns")).toBe(2);
		expect(rowCount(db, "approvals")).toBe(2);
		expect(rowCount(db, "checkpoints")).toBe(1);
		expect(rowCount(db, "terminal_sessions")).toBe(1);

		expect(listProjects(db)[0]).toMatchObject({ id: "project-1", name: "Daedalus", path: "/repo" });
		expect(listWorktrees(db, "project-1")[0]).toMatchObject({
			id: "worktree-1",
			projectId: "project-1",
			branch: "feature",
			baseBranch: "main",
			status: "active",
		});
		expect(listProjectSessions(db, "project-1")[0]).toMatchObject({
			id: "session-1",
			worktreeId: "worktree-1",
			title: "Build GUI",
		});
		expect(listSessionTurns(db, "session-1").map((turn) => [turn.id, turn.role, turn.content])).toEqual([
			["turn-1", "user", "implement task"],
			["turn-2", "assistant", "done"],
		]);
		expect(listActiveApprovals(db).map((approval) => approval.id)).toEqual(["approval-1"]);
		expect(listTerminalSessions(db, "project-1")[0]).toMatchObject({ id: "terminal-1", cwd: "/repo" });
		expect(listIntegrationResources(db)).toEqual([]);
	});

	test("survives restart-style projection and normalizes live runtime messages", () => {
		const db = migratedInMemoryDatabase();

		appendEvent(db, {
			streamId: "project:project-2",
			type: "project/registered",
			payload: { projectId: "project-2", name: "Repo", path: "/repo" },
		});
		appendEvent(db, {
			streamId: "session-2",
			type: "session/started",
			payload: { sessionId: "session-2", projectId: "project-2", title: "Restart me" },
		});
		appendEvent(db, {
			streamId: "session-2",
			type: "agent/message_end",
			payload: { message: { id: "message-1", role: "assistant", content: "durable answer" } },
		});
		appendEvent(db, {
			streamId: "terminal-2",
			type: "terminal/closed",
			payload: {
				terminalId: "terminal-2",
				projectId: "project-2",
				cwd: "/repo",
				status: "exited",
				history: "hello",
				exitCode: 0,
			},
		});

		expect(projectRuntimeEvents(db)).toMatchObject({ projected: 4, lastSeq: 4 });
		expect(projectRuntimeEvents(db)).toEqual({ projected: 0, lastSeq: 4 });

		expect(listProjectSessions(db, "project-2")[0]).toMatchObject({ id: "session-2", title: "Restart me" });
		expect(listSessionTurns(db, "session-2")).toEqual([
			expect.objectContaining({ id: "message-1", role: "assistant", content: "durable answer" }),
		]);
		expect(listTerminalSessions(db, "project-2")[0]).toMatchObject({
			id: "terminal-2",
			status: "exited",
			history: "hello",
			exitCode: 0,
		});
	});
});

function rowCount(database: AppServerDatabase, table: string): number {
	const row = database.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get();
	return row?.count ?? 0;
}
