import { afterEach, describe, expect, test } from "bun:test";
import type { SessionEntry, SessionHeader } from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import { projectGuiSessionReadModel, toGuiSessionReadModelRow } from "./session-read-model";
import { GUI_SESSION_TABLES } from "./session-schema";

type MessageSessionEntry = Extract<SessionEntry, { type: "message" }>;

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

function sqliteNames(db: AppServerDatabase, type: "table" | "index"): string[] {
	return db
		.query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
		.all(type)
		.map((row) => row.name);
}

const header: SessionHeader = {
	type: "session",
	version: 3,
	id: "s-gui",
	timestamp: "2026-04-26T00:00:00.000Z",
	cwd: "/workspace/daedalus",
};

const entries: SessionEntry[] = [
	{
		type: "message",
		id: "e-user",
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: [{ type: "text", text: "Build the SQLite session read model" }], timestamp: 1777161601000 },
	},
	{
		type: "model_change",
		id: "e-model",
		parentId: "e-user",
		timestamp: "2026-04-26T00:00:02.000Z",
		provider: "anthropic",
		modelId: "claude-sonnet-4-5",
	},
	{
		type: "thinking_level_change",
		id: "e-thinking",
		parentId: "e-model",
		timestamp: "2026-04-26T00:00:03.000Z",
		thinkingLevel: "high",
	},
	{
		type: "message",
		id: "e-assistant",
		parentId: "e-thinking",
		timestamp: "2026-04-26T00:00:04.000Z",
		message: { role: "assistant", content: [{ type: "text", text: "Created the read model projection." }] } as MessageSessionEntry["message"],
	},
];

describe("GUI session SQLite schema", () => {
	test("migrations create GUI session tables and indexes", () => {
		const db = migratedInMemoryDatabase();
		const tables = sqliteNames(db, "table");
		const indexes = sqliteNames(db, "index");

		expect(tables).toContain(GUI_SESSION_TABLES.sessions);
		expect(tables).toContain(GUI_SESSION_TABLES.entries);
		expect(tables).toContain(GUI_SESSION_TABLES.readModel);
		expect(tables).toContain(GUI_SESSION_TABLES.exports);
		expect(tables).toContain(GUI_SESSION_TABLES.attachments);
		expect(tables).toContain(GUI_SESSION_TABLES.approvals);
		expect(indexes).toEqual(expect.arrayContaining([
			"gui_sessions_cwd_idx",
			"gui_sessions_updated_at_idx",
			"gui_session_entries_session_id_idx",
			"gui_session_entries_session_seq_idx",
			"gui_session_entries_entry_id_idx",
			"gui_session_entries_parent_id_idx",
			"gui_session_entries_type_idx",
			"gui_session_read_model_cwd_idx",
			"gui_session_read_model_updated_at_idx",
		]));
	});

	test("inserts sample session rows and projects a read model", () => {
		const db = migratedInMemoryDatabase();
		db.query(
			"INSERT INTO gui_sessions (id, cwd, parent_session_id, header_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run(header.id, header.cwd, null, JSON.stringify(header), header.timestamp, entries.at(-1)?.timestamp ?? header.timestamp);

		const insertEntry = db.query(
			"INSERT INTO gui_session_entries (session_id, seq, entry_id, parent_id, type, entry_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		);
		entries.forEach((entry, index) => {
			insertEntry.run(header.id, index + 1, entry.id, entry.parentId, entry.type, JSON.stringify(entry), entry.timestamp);
		});

		const readModel = projectGuiSessionReadModel({
			header,
			entries,
			events: [{ type: "approval.requested", payload: { status: "pending" } }],
		});
		const row = toGuiSessionReadModelRow(readModel);
		db.query(
			"INSERT INTO gui_session_read_model (session_id, cwd, title, last_message_preview, model, thinking_level, message_count, pending_approval_count, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).run(
			row.session_id,
			row.cwd,
			row.title,
			row.last_message_preview,
			row.model,
			row.thinking_level,
			row.message_count,
			row.pending_approval_count,
			row.status,
			row.updated_at,
		);

		const stored = db
			.query<{ title: string; model: string; thinking_level: string; message_count: number; pending_approval_count: number; status: string }, []>(
				"SELECT title, model, thinking_level, message_count, pending_approval_count, status FROM gui_session_read_model",
			)
			.get();

		expect(stored).toEqual({
			title: "Build the SQLite session read model",
			model: "claude-sonnet-4-5",
			thinking_level: "high",
			message_count: 2,
			pending_approval_count: 1,
			status: "waiting_for_approval",
		});
	});
});
