import { afterEach, describe, expect, test } from "bun:test";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import type { PtyAdapter } from "./pty-adapter";
import { TerminalService } from "./terminal-service";

function fakePty() {
	let onData: (data: string) => void = () => {};
	let onExit: (event: { exitCode: number | null; signal: string | null }) => void = () => {};
	const writes: string[] = [];
	const resizes: Array<[number, number]> = [];
	const kills: Array<string | undefined> = [];
	const adapter: PtyAdapter = {
		spawn: () => ({
			pid: 123,
			write: (data) => writes.push(data),
			resize: (cols, rows) => resizes.push([cols, rows]),
			kill: (signal) => {
				kills.push(signal);
				onExit({ exitCode: null, signal: signal ?? null });
			},
			onData: (listener) => {
				onData = listener;
				return () => {};
			},
			onExit: (listener) => {
				onExit = listener;
				return () => {};
			},
		}),
	};
	return {
		adapter,
		writes,
		resizes,
		kills,
		emitData: (data: string) => onData(data),
		emitExit: (exitCode: number | null, signal: string | null = null) => onExit({ exitCode, signal }),
	};
}

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

describe("TerminalService", () => {
	test("write, resize, close, replay, and history use the fake PTY", async () => {
		const pty = fakePty();
		const notifications: unknown[] = [];
		const service = new TerminalService({
			pty: pty.adapter,
			publish: (message) => notifications.push(message),
			maxScrollbackChunks: 10,
		});
		const terminal = await service.create({ cwd: "/tmp", shell: "/bin/sh" });
		pty.emitData("one\n");
		expect(service.detach(terminal.terminalId).attached).toBe(false);
		pty.emitData("two\n");
		service.input(terminal.terminalId, "echo ok\n");
		expect(pty.writes).toEqual(["echo ok\n"]);
		expect(service.resize(terminal.terminalId, { cols: 120, rows: 40 }).dimensions).toEqual({ cols: 120, rows: 40 });
		expect(pty.resizes).toEqual([[120, 40]]);
		expect(service.replay(terminal.terminalId, 1).chunks.map((chunk) => chunk.data)).toEqual(["two\n"]);
		const attached = service.attach(terminal.terminalId);
		expect(attached.history).toBe("one\ntwo\n");
		pty.emitData("three\n");
		expect(service.replay(terminal.terminalId, 0).chunks.map((chunk) => chunk.data)).toEqual([
			"one\n",
			"two\n",
			"three\n",
		]);
		const killed = service.kill(terminal.terminalId);
		expect(killed.status).toBe("killed");
		expect(pty.kills).toEqual([undefined]);
		expect(() => service.input(terminal.terminalId, "after\n")).toThrow();
		expect(notifications).toContainEqual({
			kind: "notification",
			method: "terminal/event",
			params: { terminalId: terminal.terminalId, event: { type: "output", seq: 1, data: "one\n" } },
		});
	});

	test("caps replay buffer and history by byte and line limits", async () => {
		const pty = fakePty();
		const service = new TerminalService({
			pty: pty.adapter,
			maxScrollbackChunks: 10,
			maxHistoryBytes: 8,
			maxHistoryLines: 2,
		});
		const terminal = await service.create({ cwd: "/tmp", shell: "/bin/sh" });
		pty.emitData("one\n");
		pty.emitData("two\n");
		pty.emitData("three\n");
		const snapshot = service.attach(terminal.terminalId);
		expect(snapshot.history).toBe("three\n");
		expect(
			service
				.replay(terminal.terminalId, 0)
				.chunks.map((chunk) => chunk.data)
				.join(""),
		).toBe("three\n");
	});

	test("persists canonical scoped snapshots and replays history after restart", async () => {
		const pty = fakePty();
		const db = migratedInMemoryDatabase();
		db.query("INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run("project-1", "tmp", "/tmp", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
		db.query("INSERT INTO worktrees (id, project_id, path, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("worktree-1", "project-1", "/tmp", "main", "active", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
		db.query("INSERT INTO sessions (id, project_id, worktree_id, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("session-1", "project-1", "worktree-1", "active", "Session", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
		const service = new TerminalService({ pty: pty.adapter, database: db });
		const terminal = await service.create({
			cwd: "/tmp",
			projectId: "project-1",
			worktreeId: "worktree-1",
			sessionId: "session-1",
			shell: "/bin/sh",
		});
		pty.emitData("persisted\n");
		service.kill(terminal.terminalId);
		const restored = new TerminalService({ pty: pty.adapter, database: db });
		const [snapshot] = restored.list({ projectId: "project-1", worktreeId: "worktree-1" });
		expect(snapshot).toMatchObject({
			terminalId: terminal.terminalId,
			projectId: "project-1",
			worktreeId: "worktree-1",
			sessionId: "session-1",
			cwd: "/tmp",
			status: "killed",
			history: "persisted\n",
		});
		expect(snapshot).not.toHaveProperty("id");
		expect(restored.replay(terminal.terminalId, 0).chunks).toEqual([{ seq: 1, data: "persisted\n" }]);
	});
});
