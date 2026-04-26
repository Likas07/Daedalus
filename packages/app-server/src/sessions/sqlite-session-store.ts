import {
	type AppendSessionStoreEntriesOptions,
	type ArchiveSessionStoreSessionOptions,
	type CreateSessionStoreSessionOptions,
	type DeleteSessionStoreSessionOptions,
	type ExportSessionStoreSessionOptions,
	type ImportSessionStoreSessionOptions,
	type ListSessionStoreSessionsOptions,
	type OpenSessionStoreSessionOptions,
	parseSessionJsonl,
	type ReadSessionStoreSessionOptions,
	type RenameSessionStoreSessionOptions,
	type SessionEntry,
	type SessionHeader,
	type SessionStore,
	type SessionStoreSession,
	type SessionStoreSummary,
	serializeSessionJsonl,
} from "@daedalus-pi/coding-agent";
import { randomUUID } from "crypto";
import type { AppServerDatabase } from "../persistence/database";
import { projectGuiSessionReadModel, toGuiSessionReadModelRow } from "./session-read-model";
import {
	GUI_SESSION_TABLES,
	type GuiSessionEntryRow,
	type GuiSessionReadModelRow,
	type GuiSessionRow,
} from "./session-schema";

export interface SqliteSessionStoreOptions {
	database: AppServerDatabase;
}

export interface ImportSessionJsonlOptions {
	content: string;
	cwd?: string;
	overwrite?: boolean;
}

function nowIso(): string {
	return new Date().toISOString();
}

export class SqliteSessionStore implements SessionStore {
	readonly database: AppServerDatabase;

	constructor(options: SqliteSessionStoreOptions) {
		this.database = options.database;
	}

	async create(options: CreateSessionStoreSessionOptions): Promise<SessionStoreSession> {
		const timestamp = options.timestamp ?? nowIso();
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: options.id ?? randomUUID(),
			timestamp,
			cwd: options.cwd,
			...(options.parentSession ? { parentSession: options.parentSession } : {}),
		};
		const session = { header, entries: [] };
		this.insertSession(session, false);
		return session;
	}

	async open(options: OpenSessionStoreSessionOptions): Promise<SessionStoreSession> {
		return this.read({ sessionId: options.id });
	}

	async list(options: ListSessionStoreSessionsOptions = {}): Promise<SessionStoreSummary[]> {
		const clauses: string[] = [];
		const params: (string | number)[] = [];
		if (options.cwd) {
			clauses.push("s.cwd = ?");
			params.push(options.cwd);
		}
		if (!options.includeArchived) clauses.push("s.archived = 0");
		const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
		const limit = typeof options.limit === "number" ? "LIMIT ?" : "";
		if (typeof options.limit === "number") params.push(options.limit);
		const rows = this.database
			.query<GuiSessionRow & Partial<GuiSessionReadModelRow> & { rm_updated_at?: string }, (string | number)[]>(
				`SELECT s.*, rm.title, rm.last_message_preview, rm.message_count, rm.pending_approval_count, rm.status, rm.updated_at AS rm_updated_at
				 FROM ${GUI_SESSION_TABLES.sessions} s
				 LEFT JOIN ${GUI_SESSION_TABLES.readModel} rm ON rm.session_id = s.id
				 ${where}
				 ORDER BY s.updated_at DESC ${limit}`,
			)
			.all(...params);
		return rows.map((row) => ({
			id: row.id,
			cwd: row.cwd,
			name: row.title ?? undefined,
			title: row.title ?? undefined,
			parentSessionPath: row.parent_session_id ?? undefined,
			created: new Date(row.created_at),
			modified: new Date(row.updated_at),
			updatedAt: row.rm_updated_at ?? row.updated_at,
			messageCount: row.message_count ?? 0,
			firstMessage: row.last_message_preview ?? "",
			latestMessage: row.last_message_preview ?? undefined,
			allMessagesText: row.last_message_preview ?? "",
			status: row.status ?? (row.archived === 1 ? "archived" : "idle"),
			pendingApprovalCount: row.pending_approval_count ?? 0,
			pendingUserInput: (row.pending_approval_count ?? 0) > 0,
			archived: row.archived === 1,
		}));
	}

	async append(options: AppendSessionStoreEntriesOptions): Promise<void> {
		const appendTransaction = this.database.transaction((sessionId: string, entries: SessionEntry[]) => {
			const session = this.readSync(sessionId);
			let nextSeq = this.nextSequence(sessionId);
			const insert = this.database.query(
				`INSERT INTO ${GUI_SESSION_TABLES.entries}
				 (session_id, seq, entry_id, parent_id, type, entry_json, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const entry of entries) {
				insert.run(
					sessionId,
					nextSeq,
					entry.id,
					entry.parentId,
					entry.type,
					JSON.stringify(entry),
					entry.timestamp,
				);
				nextSeq += 1;
			}
			const updatedAt = entries.at(-1)?.timestamp ?? nowIso();
			this.database
				.query(`UPDATE ${GUI_SESSION_TABLES.sessions} SET updated_at = ? WHERE id = ?`)
				.run(updatedAt, sessionId);
			this.projectReadModel(session.header, [...session.entries, ...entries], this.isArchived(sessionId), updatedAt);
		});
		appendTransaction(options.sessionId, options.entries);
	}

	async read(options: ReadSessionStoreSessionOptions): Promise<SessionStoreSession> {
		return this.readSync(options.sessionId);
	}

	async rename(options: RenameSessionStoreSessionOptions): Promise<void> {
		const entry: SessionEntry = {
			type: "session_info",
			id: randomUUID(),
			parentId: null,
			timestamp: nowIso(),
			...(options.name ? { name: options.name } : {}),
		};
		await this.append({ sessionId: options.sessionId, entries: [entry] });
	}

	async delete(options: DeleteSessionStoreSessionOptions): Promise<void> {
		this.database.query(`DELETE FROM ${GUI_SESSION_TABLES.sessions} WHERE id = ?`).run(options.sessionId);
	}

	async archive(options: ArchiveSessionStoreSessionOptions): Promise<void> {
		const transaction = this.database.transaction((sessionId: string, archived: boolean) => {
			const session = this.readSync(sessionId);
			const updatedAt = nowIso();
			this.database
				.query(`UPDATE ${GUI_SESSION_TABLES.sessions} SET archived = ?, updated_at = ? WHERE id = ?`)
				.run(archived ? 1 : 0, updatedAt, sessionId);
			this.projectReadModel(session.header, session.entries, archived, updatedAt);
		});
		transaction(options.sessionId, options.archived ?? true);
	}

	async import(options: ImportSessionStoreSessionOptions): Promise<SessionStoreSession> {
		this.insertSession(options.session, options.overwrite ?? false);
		return this.readSync(options.session.header.id);
	}

	async export(options: ExportSessionStoreSessionOptions): Promise<SessionStoreSession> {
		return this.readSync(options.sessionId);
	}

	async importJsonl(options: ImportSessionJsonlOptions): Promise<SessionStoreSession> {
		const parsed = parseSessionJsonl(options.content);
		const session = options.cwd ? { ...parsed, header: { ...parsed.header, cwd: options.cwd } } : parsed;
		return this.import({ session, overwrite: options.overwrite });
	}

	async exportJsonl(options: ExportSessionStoreSessionOptions): Promise<string> {
		return serializeSessionJsonl(await this.export(options));
	}

	private insertSession(session: SessionStoreSession, overwrite: boolean): void {
		const transaction = this.database.transaction((value: SessionStoreSession) => {
			const existing = this.database
				.query(`SELECT id FROM ${GUI_SESSION_TABLES.sessions} WHERE id = ?`)
				.get(value.header.id);
			if (existing && !overwrite) throw new Error(`Session ${value.header.id} already exists`);
			if (existing)
				this.database.query(`DELETE FROM ${GUI_SESSION_TABLES.sessions} WHERE id = ?`).run(value.header.id);
			this.database
				.query(
					`INSERT INTO ${GUI_SESSION_TABLES.sessions}
					 (id, cwd, parent_session_id, header_json, archived, created_at, updated_at)
					 VALUES (?, ?, ?, ?, 0, ?, ?)`,
				)
				.run(
					value.header.id,
					value.header.cwd,
					value.header.parentSession ?? null,
					JSON.stringify(value.header),
					value.header.timestamp,
					value.header.timestamp,
				);
			let seq = 1;
			const insertEntry = this.database.query(
				`INSERT INTO ${GUI_SESSION_TABLES.entries}
				 (session_id, seq, entry_id, parent_id, type, entry_json, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const entry of value.entries) {
				insertEntry.run(
					value.header.id,
					seq,
					entry.id,
					entry.parentId,
					entry.type,
					JSON.stringify(entry),
					entry.timestamp,
				);
				seq += 1;
			}
			this.projectReadModel(
				value.header,
				value.entries,
				false,
				value.entries.at(-1)?.timestamp ?? value.header.timestamp,
			);
		});
		transaction(session);
	}

	private readSync(sessionId: string): SessionStoreSession {
		const row = this.database
			.query<GuiSessionRow, [string]>(`SELECT * FROM ${GUI_SESSION_TABLES.sessions} WHERE id = ?`)
			.get(sessionId);
		if (!row) throw new Error(`Session ${sessionId} not found`);
		const entries = this.database
			.query<GuiSessionEntryRow, [string]>(
				`SELECT * FROM ${GUI_SESSION_TABLES.entries} WHERE session_id = ? ORDER BY seq ASC`,
			)
			.all(sessionId)
			.map((entryRow) => JSON.parse(entryRow.entry_json) as SessionEntry);
		return { header: JSON.parse(row.header_json) as SessionHeader, entries };
	}

	private nextSequence(sessionId: string): number {
		const row = this.database
			.query<{ next_seq: number | null }, [string]>(
				`SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM ${GUI_SESSION_TABLES.entries} WHERE session_id = ?`,
			)
			.get(sessionId);
		return row?.next_seq ?? 1;
	}

	private isArchived(sessionId: string): boolean {
		const row = this.database
			.query<{ archived: 0 | 1 }, [string]>(`SELECT archived FROM ${GUI_SESSION_TABLES.sessions} WHERE id = ?`)
			.get(sessionId);
		return row?.archived === 1;
	}

	private projectReadModel(
		header: SessionHeader,
		entries: readonly SessionEntry[],
		archived: boolean,
		updatedAt: string,
	): void {
		const row = toGuiSessionReadModelRow(projectGuiSessionReadModel({ header, entries, archived, updatedAt }));
		this.database
			.query(
				`INSERT INTO ${GUI_SESSION_TABLES.readModel}
				 (session_id, cwd, title, last_message_preview, model, thinking_level, message_count, pending_approval_count, status, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(session_id) DO UPDATE SET
				 cwd = excluded.cwd,
				 title = excluded.title,
				 last_message_preview = excluded.last_message_preview,
				 model = excluded.model,
				 thinking_level = excluded.thinking_level,
				 message_count = excluded.message_count,
				 pending_approval_count = excluded.pending_approval_count,
				 status = excluded.status,
				 updated_at = excluded.updated_at`,
			)
			.run(
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
	}
}

export function createSqliteSessionStore(options: SqliteSessionStoreOptions): SqliteSessionStore {
	return new SqliteSessionStore(options);
}
