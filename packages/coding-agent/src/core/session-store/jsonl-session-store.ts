import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { SessionManager } from "../session-manager.js";
import { parseSessionJsonl, serializeSessionJsonl } from "./jsonl-codec.js";
import type {
	AppendSessionStoreEntriesOptions,
	ArchiveSessionStoreSessionOptions,
	CreateSessionStoreSessionOptions,
	DeleteSessionStoreSessionOptions,
	ExportSessionStoreSessionOptions,
	ImportSessionStoreSessionOptions,
	ListSessionStoreSessionsOptions,
	OpenSessionStoreSessionOptions,
	ReadSessionStoreSessionOptions,
	RenameSessionStoreSessionOptions,
	SessionStore,
	SessionStoreSession,
	SessionStoreSummary,
} from "./types.js";

export const JSONL_SESSION_STORE_ARCHIVE_ERROR = "JSONL SessionStore does not support archiving sessions";

export interface JsonlSessionStoreOptions {
	cwd: string;
	/** Existing SessionManager session directory. Defaults to SessionManager's TUI-compatible location for cwd. */
	sessionDir?: string;
}

export class JsonlSessionStore implements SessionStore {
	readonly cwd: string;
	readonly sessionDir?: string;

	constructor(options: JsonlSessionStoreOptions) {
		this.cwd = options.cwd;
		this.sessionDir = options.sessionDir;
	}

	async create(options: CreateSessionStoreSessionOptions): Promise<SessionStoreSession> {
		const manager = SessionManager.create(options.cwd, this.sessionDir);
		manager.newSession({ id: options.id, parentSession: options.parentSession });
		const header = manager.getHeader();
		if (!header) throw new Error("SessionManager created a session without a header");
		if (options.timestamp) header.timestamp = options.timestamp;
		const session = { header, entries: manager.getEntries() };
		await this.writeSession(manager, session);
		return session;
	}

	async open(options: OpenSessionStoreSessionOptions): Promise<SessionStoreSession> {
		return this.read({ sessionId: options.id });
	}

	async list(options: ListSessionStoreSessionsOptions = {}): Promise<SessionStoreSummary[]> {
		if (options.includeArchived) {
			throw new Error(JSONL_SESSION_STORE_ARCHIVE_ERROR);
		}
		const sessions = await SessionManager.list(options.cwd ?? this.cwd, this.sessionDir);
		const limited = typeof options.limit === "number" ? sessions.slice(0, options.limit) : sessions;
		return limited.map(({ path, ...summary }) => ({ ...summary, path }));
	}

	async append(options: AppendSessionStoreEntriesOptions): Promise<void> {
		const manager = await this.openManager(options.sessionId);
		const session = this.managerSession(manager);
		await this.writeSession(manager, { header: session.header, entries: [...session.entries, ...options.entries] });
	}

	async read(options: ReadSessionStoreSessionOptions): Promise<SessionStoreSession> {
		return this.managerSession(await this.openManager(options.sessionId));
	}

	async rename(options: RenameSessionStoreSessionOptions): Promise<void> {
		const manager = await this.openManager(options.sessionId);
		manager.appendSessionInfo(options.name ?? "");
		await this.writeSession(manager, this.managerSession(manager));
	}

	async delete(options: DeleteSessionStoreSessionOptions): Promise<void> {
		const manager = await this.openManager(options.sessionId);
		const sessionFile = manager.getSessionFile();
		if (!sessionFile) throw new Error(`Session ${options.sessionId} has no JSONL file to delete`);
		unlinkSync(sessionFile);
	}

	async archive(_options: ArchiveSessionStoreSessionOptions): Promise<void> {
		throw new Error(JSONL_SESSION_STORE_ARCHIVE_ERROR);
	}

	async import(options: ImportSessionStoreSessionOptions): Promise<SessionStoreSession> {
		const existing = await this.findSessionPath(options.session.header.id);
		if (existing && !options.overwrite) {
			throw new Error(`Session ${options.session.header.id} already exists`);
		}

		const dir = this.getSessionDir(options.session.header.cwd);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		const sessionFile =
			existing ??
			join(dir, `${this.fileTimestamp(options.session.header.timestamp)}_${options.session.header.id}.jsonl`);
		writeFileSync(sessionFile, serializeSessionJsonl(options.session));
		return this.managerSession(SessionManager.open(sessionFile, dir));
	}

	async export(options: ExportSessionStoreSessionOptions): Promise<SessionStoreSession> {
		const manager = await this.openManager(options.sessionId);
		const sessionFile = manager.getSessionFile();
		if (!sessionFile) return this.managerSession(manager);
		return parseSessionJsonl(await readFile(sessionFile, "utf8"));
	}

	private managerSession(manager: SessionManager): SessionStoreSession {
		const header = manager.getHeader();
		if (!header) throw new Error(`Session ${manager.getSessionId()} is missing a header`);
		return { header, entries: manager.getEntries() };
	}

	private async openManager(sessionId: string): Promise<SessionManager> {
		const sessionPath = await this.findSessionPath(sessionId);
		if (!sessionPath) throw new Error(`Session ${sessionId} not found`);
		return SessionManager.open(sessionPath, this.getSessionDir(this.cwd));
	}

	private async findSessionPath(sessionId: string): Promise<string | undefined> {
		const sessions = await SessionManager.list(this.cwd, this.sessionDir);
		return sessions.find((session) => session.id === sessionId)?.path;
	}

	private async writeSession(manager: SessionManager, session: SessionStoreSession): Promise<void> {
		const sessionFile = manager.getSessionFile();
		if (!sessionFile) throw new Error(`Session ${session.header.id} has no JSONL file`);
		writeFileSync(sessionFile, serializeSessionJsonl(session));
	}

	private getSessionDir(cwd: string): string {
		return this.sessionDir ?? SessionManager.create(cwd).getSessionDir();
	}

	private fileTimestamp(timestamp: string): string {
		return (timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
	}
}

export function createJsonlSessionStore(options: JsonlSessionStoreOptions): JsonlSessionStore {
	return new JsonlSessionStore(options);
}
