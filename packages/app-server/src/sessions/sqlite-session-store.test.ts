import { afterEach, describe, expect, test } from "bun:test";
import {
	parseSessionJsonl,
	type SessionEntry,
	type SessionHeader,
	serializeSessionJsonl,
} from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import { GUI_SESSION_TABLES } from "./session-schema";
import { SqliteSessionStore } from "./sqlite-session-store";

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

function userMessage(id: string, content: string, timestamp = "2026-04-26T00:00:01.000Z"): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp,
		message: { role: "user", content: [{ type: "text", text: content }], timestamp: Date.parse(timestamp) },
	};
}

const modelEntry: SessionEntry = {
	type: "model_change",
	id: "model-1",
	parentId: "msg-1",
	timestamp: "2026-04-26T00:00:02.000Z",
	provider: "anthropic",
	modelId: "claude-sonnet-4-5",
};

describe("SqliteSessionStore", () => {
	test("creates, opens, lists, appends, reads, renames, archives, and deletes sessions", async () => {
		const sessionStore = store();
		const created = await sessionStore.create({
			id: "sqlite-session-1",
			cwd: "/workspace/daedalus",
			parentSession: "parent-1",
			timestamp: "2026-04-26T00:00:00.000Z",
		});

		expect(created.header.id).toBe("sqlite-session-1");
		expect((await sessionStore.open({ id: "sqlite-session-1" })).header.cwd).toBe("/workspace/daedalus");

		await sessionStore.append({
			sessionId: "sqlite-session-1",
			entries: [userMessage("msg-1", "Build SQLite sessions"), modelEntry],
		});
		await sessionStore.rename({ sessionId: "sqlite-session-1", name: "SQLite Sessions" });

		const read = await sessionStore.read({ sessionId: "sqlite-session-1" });
		expect(read.entries.map((entry) => entry.id)).toEqual(["msg-1", "model-1", expect.any(String)]);
		expect(read.entries.at(-1)).toMatchObject({ type: "session_info", name: "SQLite Sessions" });

		const listed = await sessionStore.list({ cwd: "/workspace/daedalus" });
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			id: "sqlite-session-1",
			name: "SQLite Sessions",
			messageCount: 1,
			archived: false,
		});

		await sessionStore.archive({ sessionId: "sqlite-session-1" });
		expect(await sessionStore.list()).toHaveLength(0);
		expect((await sessionStore.list({ includeArchived: true }))[0]?.archived).toBe(true);

		await sessionStore.archive({ sessionId: "sqlite-session-1", archived: false });
		expect((await sessionStore.list())[0]?.archived).toBe(false);

		await sessionStore.delete({ sessionId: "sqlite-session-1" });
		expect(await sessionStore.list({ includeArchived: true })).toHaveLength(0);
	});

	test("allocates monotonic sequences and preserves original entry JSON", async () => {
		const sessionStore = store();
		await sessionStore.create({ id: "seq-session", cwd: "/repo", timestamp: "2026-04-26T00:00:00.000Z" });
		const first = userMessage("first", "first", "2026-04-26T00:00:01.000Z");
		const second = {
			...userMessage("second", "second", "2026-04-26T00:00:02.000Z"),
			extraPreservedField: { nested: true },
		} as unknown as SessionEntry;
		await sessionStore.append({ sessionId: "seq-session", entries: [first] });
		await sessionStore.append({ sessionId: "seq-session", entries: [second] });

		const rows = database
			?.query<{ seq: number; entry_json: string }, []>(
				`SELECT seq, entry_json FROM ${GUI_SESSION_TABLES.entries} ORDER BY seq`,
			)
			.all();
		expect(rows?.map((row) => row.seq)).toEqual([1, 2]);
		expect(rows?.[1]?.entry_json).toBe(JSON.stringify(second));
	});

	test("updates gui_session_read_model in append and archive transactions", async () => {
		const sessionStore = store();
		await sessionStore.create({ id: "rm-session", cwd: "/repo", timestamp: "2026-04-26T00:00:00.000Z" });
		await sessionStore.append({
			sessionId: "rm-session",
			entries: [userMessage("msg-1", "Read model preview"), modelEntry],
		});

		let row = database
			?.query<
				{
					title: string | null;
					last_message_preview: string | null;
					model: string | null;
					message_count: number;
					status: string;
				},
				[]
			>(
				`SELECT title, last_message_preview, model, message_count, status FROM ${GUI_SESSION_TABLES.readModel} WHERE session_id = 'rm-session'`,
			)
			.get();
		expect(row).toEqual({
			title: "Read model preview",
			last_message_preview: "Read model preview",
			model: "claude-sonnet-4-5",
			message_count: 1,
			status: "idle",
		});

		await sessionStore.archive({ sessionId: "rm-session" });
		row = database
			?.query<{ status: string }, []>(
				`SELECT status FROM ${GUI_SESSION_TABLES.readModel} WHERE session_id = 'rm-session'`,
			)
			.get() as typeof row;
		expect(row?.status).toBe("archived");
	});

	test("imports and exports JSONL through the shared codec", async () => {
		const sessionStore = store();
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: "jsonl-session",
			timestamp: "2026-04-26T00:00:00.000Z",
			cwd: "/jsonl/original",
		};
		const entry = userMessage("jsonl-entry", "Imported from JSONL");
		const content = serializeSessionJsonl({ header, entries: [entry] });

		const imported = await sessionStore.importJsonl({ content });
		expect(imported.header.cwd).toBe("/jsonl/original");
		expect(imported.entries[0]).toEqual(entry);

		const exported = await sessionStore.exportJsonl({ sessionId: "jsonl-session" });
		expect(parseSessionJsonl(exported)).toEqual({ header, entries: [entry] });

		const overridden = await sessionStore.importJsonl({
			content: serializeSessionJsonl({ ...imported, header: { ...header, id: "jsonl-session-override" } }),
			cwd: "/jsonl/override",
		});
		expect(overridden.header.cwd).toBe("/jsonl/override");
		expect(overridden.entries[0]).toMatchObject({
			id: "jsonl-entry",
			parentId: null,
			timestamp: entry.timestamp,
			type: "message",
		});
	});
});
