import { afterEach, describe, expect, test } from "bun:test";
import { serializeSessionJsonl, type SessionEntry } from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import { AppRouter } from "./router";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function router(): AppRouter {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return new AppRouter({
		database,
		publish: () => {},
		controller: {
			readState: () => ({ sessions: [] }),
			startSession: async () => ({}),
			startTurn: async () => ({}),
			interruptTurn: async () => {},
			disposeSession: async () => {},
		} as never,
	});
}

function userMessage(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: [{ type: "text", text }], timestamp: Date.parse("2026-04-26T00:00:01.000Z") },
	};
}

describe("session store routes", () => {
	test("imports and exports JSONL through the router", async () => {
		const appRouter = router();
		const content = serializeSessionJsonl({
			header: { type: "session", version: 3, id: "route-session", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
			entries: [userMessage("msg-1", "hello sqlite route")],
		});

		const imported = await appRouter.handle({ kind: "request", id: "1", method: "session/import-jsonl", params: { content } });
		expect(imported).toEqual({ sessionId: "route-session" });

		const listed = await appRouter.handle({ kind: "request", id: "2", method: "session/list", params: { cwd: "/repo" } });
		expect(listed).toMatchObject({ sessions: [{ id: "route-session", messageCount: 1 }] });

		const exported = await appRouter.handle({ kind: "request", id: "3", method: "session/export-jsonl", params: { sessionId: "route-session" } });
		expect(exported).toEqual({ content, filename: "route-session.jsonl" });
	});
});
