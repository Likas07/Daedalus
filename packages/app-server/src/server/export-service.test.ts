import { afterEach, describe, expect, test } from "bun:test";
import { type SessionEntry, serializeSessionJsonl } from "@daedalus-pi/coding-agent";
import { type AppServerDatabase, openAppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";
import { ExportService, redactSecrets } from "./export-service";

let database: AppServerDatabase | undefined;
afterEach(() => {
	database?.close();
	database = undefined;
});

function db(): AppServerDatabase {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return database;
}
function entry(text: string): SessionEntry {
	return {
		type: "message",
		id: crypto.randomUUID(),
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: [{ type: "text", text }], timestamp: 0 },
	};
}

describe("ExportService", () => {
	test("redacts API keys, bearer tokens, OAuth tokens, and auth headers", () => {
		expect(
			redactSecrets({ Authorization: "Bearer abc123", text: "api_key=sk-secret oauth_token=tok Bearer live" }),
		).toEqual({ Authorization: "[REDACTED]", text: "api_key=[REDACTED] oauth_token=[REDACTED] Bearer [REDACTED]" });
	});

	test("exports JSONL from SQLite and redacts session content", async () => {
		const database = db();
		const store = new SqliteSessionStore({ database });
		const content = serializeSessionJsonl({
			header: { type: "session", version: 3, id: "s1", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
			entries: [entry("Bearer secret-token")],
		});
		await store.importJsonl({ content });
		const result = await new ExportService({ database }).export({ kind: "jsonl-session", sessionId: "s1" });
		expect(result.filename).toBe("s1.jsonl");
		expect(result.content).toContain("Bearer [REDACTED]");
		expect(result.content).not.toContain("secret-token");
	});

	test("exports HTML session", async () => {
		const database = db();
		await new SqliteSessionStore({ database }).import({
			session: {
				header: { type: "session", version: 3, id: "s-html", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
				entries: [entry("<hello>")],
			},
		});
		const result = await new ExportService({ database }).export({ kind: "html-session", sessionId: "s-html" });
		expect(result.filename).toBe("s-html.html");
		expect(result.content).toContain("<!doctype html>");
		expect(result.content).toContain("&lt;hello&gt;");
	});

	test("limits recent events and builds support bundle", async () => {
		const database = db();
		appendEvent(database, { streamId: "s", type: "tool/call", payload: { Authorization: "Bearer abc" } });
		appendEvent(database, { streamId: "s", type: "runtime/state", payload: { ok: true } });
		const result = await new ExportService({ database, runtimeDiagnostics: () => ({ active: true }) }).export({
			kind: "support-bundle",
			recentEventLimit: 1,
			includeToolLogs: true,
		});
		expect(result.export.recentProtocolEvents).toHaveLength(1);
		expect(result.export.runtimeDiagnostics).toEqual({ active: true });
		expect(result.content).not.toContain("Bearer abc");
	});
});
