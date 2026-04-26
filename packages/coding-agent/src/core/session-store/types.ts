import type { SessionEntry, SessionHeader, SessionInfo } from "../session-manager.js";

export interface SessionStoreSession {
	/** Store-neutral session header using the existing SessionManager session semantics. */
	header: SessionHeader;
	/** Ordered session entries, excluding the header. */
	entries: SessionEntry[];
}

export interface SessionStoreSummary extends Omit<SessionInfo, "path"> {
	/** Store-specific path or URI when one exists. */
	path?: string;
	/** Store-specific archival marker. */
	archived?: boolean;
}

export interface CreateSessionStoreSessionOptions {
	id?: string;
	cwd: string;
	parentSession?: string;
	timestamp?: string;
}

export interface OpenSessionStoreSessionOptions {
	id: string;
}

export interface ListSessionStoreSessionsOptions {
	cwd?: string;
	includeArchived?: boolean;
	limit?: number;
}

export interface AppendSessionStoreEntriesOptions {
	sessionId: string;
	entries: SessionEntry[];
}

export interface ReadSessionStoreSessionOptions {
	sessionId: string;
}

export interface RenameSessionStoreSessionOptions {
	sessionId: string;
	name: string | undefined;
}

export interface DeleteSessionStoreSessionOptions {
	sessionId: string;
}

export interface ArchiveSessionStoreSessionOptions {
	sessionId: string;
	archived?: boolean;
}

export interface ImportSessionStoreSessionOptions {
	session: SessionStoreSession;
	/** Replace an existing session with the same id when supported by the store. */
	overwrite?: boolean;
}

export interface ExportSessionStoreSessionOptions {
	sessionId: string;
}

export interface SessionStore {
	create(options: CreateSessionStoreSessionOptions): Promise<SessionStoreSession>;
	open(options: OpenSessionStoreSessionOptions): Promise<SessionStoreSession>;
	list(options?: ListSessionStoreSessionsOptions): Promise<SessionStoreSummary[]>;
	append(options: AppendSessionStoreEntriesOptions): Promise<void>;
	read(options: ReadSessionStoreSessionOptions): Promise<SessionStoreSession>;
	rename(options: RenameSessionStoreSessionOptions): Promise<void>;
	delete(options: DeleteSessionStoreSessionOptions): Promise<void>;
	archive(options: ArchiveSessionStoreSessionOptions): Promise<void>;
	import(options: ImportSessionStoreSessionOptions): Promise<SessionStoreSession>;
	export(options: ExportSessionStoreSessionOptions): Promise<SessionStoreSession>;
}
