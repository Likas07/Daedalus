import { afterEach, describe, expect, test } from "bun:test";
import { parseSessionJsonl, type SessionEntry } from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";
import { SqliteSessionManager } from "./sqlite-session-manager";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function store(): SqliteSessionStore {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return new SqliteSessionStore({ database });
}

function userEntry(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: [{ type: "text", text }], timestamp: Date.parse("2026-04-26T00:00:01.000Z") },
	};
}

describe("SqliteSessionManager", () => {
	test("creates, appends, builds context, trees, and exports JSONL", async () => {
		const sessionStore = store();
		const manager = await SqliteSessionManager.create({ store: sessionStore, cwd: "/repo" }).initialized();

		expect(manager.isPersisted()).toBe(true);
		expect(manager.getCwd()).toBe("/repo");
		expect(manager.getSessionFile()).toBe(`sqlite://${manager.getSessionId()}`);

		const first = manager.appendMessage({ role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 });
		manager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			timestamp: 2,
			api: "test",
			provider: "test",
			model: "test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
		});
		manager.appendSessionInfo("GUI session");

		expect(manager.getEntries()).toHaveLength(3);
		expect(manager.getSessionName()).toBe("GUI session");
		expect(manager.buildSessionContext().messages.map((message) => message.role)).toEqual(["user", "assistant"]);
		expect(manager.getTree()[0]?.entry.id).toBe(first);

		const reopened = await SqliteSessionManager.create({ store: sessionStore, cwd: "/repo", sessionId: manager.getSessionId() }).initialized();
		expect(reopened.getEntries()).toHaveLength(3);
		expect(parseSessionJsonl(await reopened.exportJsonl()).header.id).toBe(manager.getSessionId());
	});

	test("opens imported JSONL before resume", async () => {
		const sessionStore = store();
		await sessionStore.import({
			session: {
				header: { type: "session", version: 3, id: "imported", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
				entries: [userEntry("msg-1", "from jsonl")],
			},
		});

		const manager = await SqliteSessionManager.create({ store: sessionStore, cwd: "/repo", sessionId: "imported" }).initialized();
		expect(manager.getSessionId()).toBe("imported");
		expect(manager.buildSessionContext().messages).toHaveLength(1);
		expect(await manager.exportJsonl()).toContain('"id":"imported"');
	});
});
