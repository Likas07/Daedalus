import { randomUUID } from "node:crypto";
import {
	buildSessionContext,
	serializeSessionJsonl,
	type ModelChangeEntry,
	type SessionContext,
	type SessionEntry,
	type SessionHeader,
	type SessionMessageEntry,
	type SessionStoreSession,
	type ThinkingLevelChangeEntry,
} from "@daedalus-pi/coding-agent";

type AgentMessage = SessionMessageEntry["message"];
type SessionTreeNode = { entry: SessionEntry; children: SessionTreeNode[]; label?: string; labelTimestamp?: string };
type FastModeChangeEntry = SessionEntry & { type: "fast_mode_change"; fastMode: boolean };
type LabelEntry = SessionEntry & { type: "label"; targetId: string; label?: string };
type CustomEntry = SessionEntry & { type: "custom"; customType: string; data?: unknown };
type CustomMessageEntry = SessionEntry & {
	type: "custom_message";
	customType: string;
	content: string;
	details?: unknown;
	display?: boolean;
};
type BranchSummaryEntry = SessionEntry & { type: "branch_summary"; fromId: string; summary: string; details?: unknown; fromHook?: boolean };
import type { SqliteSessionStore } from "../sessions/sqlite-session-store";

export interface SqliteSessionManagerOptions {
	store: SqliteSessionStore;
	cwd: string;
	sessionId?: string;
	sessionPath?: string;
	name?: string;
	parentSession?: string;
}

export class SqliteSessionManager {
	private session!: SessionStoreSession;
	private byId = new Map<string, SessionEntry>();
	private labelsById = new Map<string, string>();
	private labelTimestampsById = new Map<string, string>();
	private leafId: string | null = null;
	private ready: Promise<void>;

	constructor(private readonly options: SqliteSessionManagerOptions) {
		this.ready = this.load();
	}

	static create(options: SqliteSessionManagerOptions): SqliteSessionManager {
		return new SqliteSessionManager(options);
	}

	async initialized(): Promise<this> {
		await this.ready;
		return this;
	}

	private async load(): Promise<void> {
		this.session = this.options.sessionPath
			? await this.options.store.open({ id: this.options.sessionPath })
			: await this.options.store.create({ cwd: this.options.cwd, id: this.options.sessionId, parentSession: this.options.parentSession });
		if (this.options.name) this.appendSessionInfo(this.options.name);
		this.rebuildIndex();
	}

	private rebuildIndex(): void {
		this.byId = new Map();
		this.labelsById = new Map();
		this.labelTimestampsById = new Map();
		this.leafId = null;
		for (const entry of this.session.entries) {
			this.byId.set(entry.id, entry);
			this.leafId = entry.id;
			if (entry.type === "label") {
				if (entry.label) {
					this.labelsById.set(entry.targetId, entry.label);
					this.labelTimestampsById.set(entry.targetId, entry.timestamp);
				} else {
					this.labelsById.delete(entry.targetId);
					this.labelTimestampsById.delete(entry.targetId);
				}
			}
		}
	}

	private append(entry: SessionEntry): string {
		this.session.entries.push(entry);
		this.byId.set(entry.id, entry);
		this.leafId = entry.id;
		void this.options.store.append({ sessionId: this.getSessionId(), entries: [entry] });
		return entry.id;
	}

	private makeBase(): Pick<SessionEntry, "id" | "parentId" | "timestamp"> {
		return { id: randomUUID(), parentId: this.leafId, timestamp: new Date().toISOString() };
	}

	isPersisted(): boolean {
		return true;
	}

	getCwd(): string {
		return this.session.header.cwd;
	}

	getSessionDir(): string {
		return "sqlite://gui_sessions";
	}

	getSessionFile(): string | undefined {
		return `sqlite://${this.getSessionId()}`;
	}

	getSessionId(): string {
		return this.session.header.id;
	}

	getHeader(): SessionHeader {
		return this.session.header;
	}

	getEntries(): SessionEntry[] {
		return [...this.session.entries];
	}

	getEntry(id: string): SessionEntry | undefined {
		return this.byId.get(id);
	}

	getLeafId(): string | null {
		return this.leafId;
	}

	getSessionName(): string | undefined {
		for (let i = this.session.entries.length - 1; i >= 0; i -= 1) {
			const entry = this.session.entries[i];
			if (entry?.type === "session_info") return entry.name?.trim() || undefined;
		}
		return undefined;
	}

	getBranch(fromId?: string): SessionEntry[] {
		const path: SessionEntry[] = [];
		let current = (fromId ?? this.leafId) ? this.byId.get((fromId ?? this.leafId) as string) : undefined;
		while (current) {
			path.unshift(current);
			current = current.parentId ? this.byId.get(current.parentId) : undefined;
		}
		return path;
	}

	buildSessionContext(): SessionContext {
		return buildSessionContext(this.getEntries(), this.leafId, this.byId);
	}

	getTree(): SessionTreeNode[] {
		const nodes = new Map<string, SessionTreeNode>();
		const roots: SessionTreeNode[] = [];
		for (const entry of this.session.entries) {
			nodes.set(entry.id, {
				entry,
				children: [],
				label: this.labelsById.get(entry.id),
				labelTimestamp: this.labelTimestampsById.get(entry.id),
			});
		}
		for (const entry of this.session.entries) {
			const node = nodes.get(entry.id)!;
			const parent = entry.parentId ? nodes.get(entry.parentId) : undefined;
			if (parent) parent.children.push(node);
			else roots.push(node);
		}
		return roots;
	}

	appendMessage(message: AgentMessage): string {
		return this.append({ type: "message", ...this.makeBase(), message } as SessionMessageEntry);
	}

	appendThinkingLevelChange(thinkingLevel: string): string {
		return this.append({ type: "thinking_level_change", ...this.makeBase(), thinkingLevel } as ThinkingLevelChangeEntry);
	}

	appendFastModeChange(fastMode: boolean): string {
		return this.append({ type: "fast_mode_change", ...this.makeBase(), fastMode } as FastModeChangeEntry);
	}

	appendModelChange(provider: string, modelId: string): string {
		return this.append({ type: "model_change", ...this.makeBase(), provider, modelId } as ModelChangeEntry);
	}

	appendCustomEntry(customType: string, data?: unknown): string {
		return this.append({ type: "custom", ...this.makeBase(), customType, data } as CustomEntry);
	}

	appendCustomMessageEntry(customType: string, content: string, details?: unknown, display?: boolean): string {
		return this.append({ type: "custom_message", ...this.makeBase(), customType, content, details, display } as CustomMessageEntry);
	}

	appendSessionInfo(name: string): string {
		return this.append({ type: "session_info", ...this.makeBase(), name: name.trim() });
	}

	appendLabelChange(targetId: string, label?: string): string {
		const entry = { type: "label", ...this.makeBase(), targetId, label } as LabelEntry;
		const id = this.append(entry);
		if (label) this.labelsById.set(targetId, label);
		else this.labelsById.delete(targetId);
		return id;
	}

	appendCompaction(summary: string, firstKeptEntryId: string, tokensBefore: number, details?: unknown, fromHook?: boolean): string {
		return this.append({ type: "compaction", ...this.makeBase(), summary, firstKeptEntryId, tokensBefore, details, fromHook });
	}

	branch(branchFromId: string): void {
		if (!this.byId.has(branchFromId)) throw new Error(`Entry ${branchFromId} not found`);
		this.leafId = branchFromId;
	}

	resetLeaf(): void {
		this.leafId = null;
	}

	branchWithSummary(branchFromId: string | null, summary: string, details?: unknown, fromHook?: boolean): string {
		this.leafId = branchFromId;
		return this.append({ type: "branch_summary", ...this.makeBase(), fromId: branchFromId ?? "root", summary, details, fromHook } as BranchSummaryEntry);
	}

	async exportJsonl(): Promise<string> {
		return serializeSessionJsonl(await this.options.store.export({ sessionId: this.getSessionId() }));
	}
}
