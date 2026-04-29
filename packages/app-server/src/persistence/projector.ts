import type { AppServerDatabase } from "./database";
import { type EventPayload, readEventsAfter, type StoredEvent } from "./event-store";

const PROJECTION_NAME = "runtime_read_model";
const BATCH_SIZE = 500;

type PayloadRecord = { readonly [key: string]: EventPayload };

export interface ProjectionResult {
	readonly projected: number;
	readonly lastSeq: number;
}

export function projectRuntimeEvents(database: AppServerDatabase): ProjectionResult {
	return database.transaction(() => {
		let lastSeq = getLastProjectedSeq(database);
		let projected = 0;

		while (true) {
			const events = readEventsAfter(database, lastSeq, { limit: BATCH_SIZE });
			if (events.length === 0) {
				break;
			}

			for (const event of events) {
				projectEvent(database, event);
				lastSeq = event.seq;
				projected += 1;
			}
			setLastProjectedSeq(database, lastSeq);
		}

		return { projected, lastSeq };
	})();
}

function getLastProjectedSeq(database: AppServerDatabase): number {
	const row = database
		.query<{ last_seq: number }, [string]>("SELECT last_seq FROM projection_state WHERE name = ?")
		.get(PROJECTION_NAME);
	return row?.last_seq ?? 0;
}

function setLastProjectedSeq(database: AppServerDatabase, seq: number): void {
	database
		.query(
			`INSERT INTO projection_state (name, last_seq, updated_at)
			 VALUES (?, ?, current_timestamp)
			 ON CONFLICT(name) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
		)
		.run(PROJECTION_NAME, seq);
}

function projectEvent(database: AppServerDatabase, event: StoredEvent): void {
	const payload = asRecord(event.payload);
	const occurredAt = text(payload, "createdAt", "created_at", "occurredAt", "occurred_at") ?? event.createdAt;

	switch (event.type) {
		case "project/registered":
			projectProject(database, payload, occurredAt);
			break;
		case "worktree/created":
		case "worktree/registered":
			projectWorktree(database, payload, occurredAt);
			break;
		case "session/started":
			projectSession(database, payload, occurredAt);
			break;
		case "session/resume-identity-mismatched":
			projectSessionResumeMismatch(database, payload, occurredAt);
			break;
		case "turn/started":
		case "turn/completed":
			projectTurn(database, payload, occurredAt);
			break;
		case "agent/message_end":
			projectAgentMessage(database, event, payload, occurredAt);
			break;
		case "approval/requested":
			projectApprovalRequested(database, payload, occurredAt);
			break;
		case "approval/resolved":
			projectApprovalResolved(database, payload, occurredAt);
			break;
		case "checkpoint/created":
			projectCheckpoint(database, payload, occurredAt);
			break;
		case "terminal/started":
		case "terminal/closed":
			projectTerminal(database, payload, occurredAt);
			break;
	}
}

function projectProject(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "projectId", "project_id", "id");
	const name = text(payload, "name") ?? id;
	const path = text(payload, "path", "rootPath", "root_path") ?? "";
	database
		.query(
			`INSERT INTO projects (id, name, path, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path, updated_at = excluded.updated_at`,
		)
		.run(id, name, path, createdAt, createdAt);
}

function projectWorktree(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "worktreeId", "worktree_id", "id");
	const projectId = requiredText(payload, "projectId", "project_id");
	database
		.query(
			`INSERT INTO worktrees (id, project_id, path, branch, base_branch, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, path = excluded.path, branch = excluded.branch,
			 base_branch = excluded.base_branch, status = excluded.status, updated_at = excluded.updated_at`,
		)
		.run(
			id,
			projectId,
			text(payload, "path") ?? "",
			text(payload, "branch") ?? null,
			text(payload, "baseBranch", "base_branch") ?? null,
			text(payload, "status") ?? "active",
			createdAt,
			createdAt,
		);
}

function projectSession(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "sessionId", "session_id", "id");
	database
		.query(
			`INSERT INTO sessions (id, project_id, worktree_id, parent_session_id, status, title, runs_in_json, isolation_mode, validation_status, needs_attention_reason, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, worktree_id = excluded.worktree_id,
			 parent_session_id = excluded.parent_session_id, status = excluded.status, title = excluded.title,
			 runs_in_json = excluded.runs_in_json, isolation_mode = excluded.isolation_mode,
			 validation_status = excluded.validation_status, needs_attention_reason = excluded.needs_attention_reason,
			 updated_at = excluded.updated_at`,
		)
		.run(
			id,
			text(payload, "projectId", "project_id") ?? text(asRecord(payload.runsIn), "projectId") ?? null,
			text(payload, "worktreeId", "worktree_id") ?? text(asRecord(payload.runsIn), "worktreeId") ?? null,
			text(payload, "parentSessionId", "parent_session_id", "sourceSessionId", "source_session_id") ?? null,
			text(payload, "status") ?? "active",
			text(payload, "title") ?? null,
			runsInJson(payload),
			text(payload, "isolationMode", "isolation_mode") ?? text(asRecord(payload.runsIn), "isolationMode") ?? null,
			text(payload, "validationStatus", "validation_status") ??
				text(asRecord(payload.runsIn), "validationStatus") ??
				null,
			text(payload, "needsAttentionReason", "needs_attention_reason", "reason") ??
				text(asRecord(payload.runsIn), "reason") ??
				null,
			createdAt,
			createdAt,
		);
}

function projectSessionResumeMismatch(database: AppServerDatabase, payload: PayloadRecord, updatedAt: string): void {
	const id = requiredText(payload, "sessionId", "session_id", "id");
	const identity = asRecord(payload.identity);
	database
		.query(
			`UPDATE sessions
			 SET status = ?, validation_status = ?, needs_attention_reason = ?, updated_at = ?
			 WHERE id = ?`,
		)
		.run(
			"needs-attention",
			"needs-attention",
			text(payload, "needsAttentionReason", "needs_attention_reason", "reason") ??
				text(identity, "message") ??
				"Session resume identity mismatch",
			updatedAt,
			id,
		);
}

function projectTurn(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "turnId", "turn_id", "id");
	const sessionId = requiredText(payload, "sessionId", "session_id");
	database
		.query(
			`INSERT INTO turns (id, session_id, role, content, created_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, role = excluded.role, content = excluded.content`,
		)
		.run(id, sessionId, text(payload, "role") ?? "assistant", content(payload), createdAt);
}

function projectAgentMessage(
	database: AppServerDatabase,
	event: StoredEvent,
	payload: PayloadRecord,
	createdAt: string,
): void {
	const message = asRecord(payload.message);
	const sessionId = text(payload, "sessionId", "session_id") ?? event.streamId;
	if (!sessionId || sessionId === "app") return;
	const id =
		text(payload, "messageId", "message_id", "id") ??
		text(message, "id", "messageId", "message_id") ??
		`${event.seq}`;
	database
		.query(
			`INSERT INTO turns (id, session_id, role, content, created_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, role = excluded.role, content = excluded.content`,
		)
		.run(
			id,
			sessionId,
			text(message, "role") ?? text(payload, "role") ?? "assistant",
			content(message) || content(payload),
			createdAt,
		);
}

function projectApprovalRequested(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "approvalId", "approval_id", "id");
	database
		.query(
			`INSERT INTO approvals (id, session_id, status, request, response, created_at, updated_at)
			 VALUES (?, ?, ?, ?, NULL, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, status = excluded.status,
			 request = excluded.request, updated_at = excluded.updated_at`,
		)
		.run(
			id,
			text(payload, "sessionId", "session_id") ?? null,
			text(payload, "status") ?? "pending",
			jsonText(payload, "request") ?? content(payload),
			createdAt,
			createdAt,
		);
}

function projectApprovalResolved(database: AppServerDatabase, payload: PayloadRecord, resolvedAt: string): void {
	const id = requiredText(payload, "approvalId", "approval_id", "id");
	database
		.query("UPDATE approvals SET status = ?, response = ?, updated_at = ? WHERE id = ?")
		.run(
			text(payload, "status") ?? "resolved",
			jsonText(payload, "response", "resolution") ?? content(payload),
			resolvedAt,
			id,
		);
}

function projectCheckpoint(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "checkpointId", "checkpoint_id", "id");
	database
		.query(
			`INSERT INTO checkpoints (id, session_id, worktree_id, label, metadata, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, worktree_id = excluded.worktree_id,
			 label = excluded.label, metadata = excluded.metadata`,
		)
		.run(
			id,
			text(payload, "sessionId", "session_id") ?? null,
			text(payload, "worktreeId", "worktree_id") ?? null,
			text(payload, "label") ?? null,
			jsonText(payload, "metadata") ?? "{}",
			createdAt,
		);
}

function projectTerminal(database: AppServerDatabase, payload: PayloadRecord, createdAt: string): void {
	const id = requiredText(payload, "terminalId", "terminal_id", "id");
	database
		.query(
			`INSERT INTO terminal_sessions (id, project_id, worktree_id, status, cwd, shell, cols, rows, history, pid, exit_code, exit_signal, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, worktree_id = excluded.worktree_id,
			 status = excluded.status, cwd = excluded.cwd, shell = excluded.shell, cols = excluded.cols, rows = excluded.rows,
			 history = excluded.history, pid = excluded.pid, exit_code = excluded.exit_code, exit_signal = excluded.exit_signal,
			 updated_at = excluded.updated_at`,
		)
		.run(
			id,
			text(payload, "projectId", "project_id") ?? null,
			text(payload, "worktreeId", "worktree_id") ?? null,
			text(payload, "status") ?? "active",
			text(payload, "cwd") ?? "",
			text(payload, "shell") ?? "",
			number(payload, "cols") ?? number(asRecord(payload.dimensions), "cols") ?? 80,
			number(payload, "rows") ?? number(asRecord(payload.dimensions), "rows") ?? 24,
			text(payload, "history") ?? "",
			number(payload, "pid") ?? null,
			number(payload, "exitCode", "exit_code") ?? null,
			text(payload, "exitSignal", "exit_signal") ?? null,
			createdAt,
			createdAt,
		);
}

function runsInJson(payload: PayloadRecord): string | null {
	const runsIn = asRecord(payload.runsIn);
	return Object.keys(runsIn).length > 0 ? JSON.stringify(runsIn) : null;
}

function asRecord(payload: EventPayload | undefined): PayloadRecord {
	return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function number(payload: PayloadRecord, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "number") return value;
		if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
	}
	return undefined;
}

function text(payload: PayloadRecord, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
	}
	return undefined;
}

function requiredText(payload: PayloadRecord, ...keys: string[]): string {
	const value = text(payload, ...keys);
	if (!value) throw new Error(`Projection event is missing required field: ${keys.join("/")}`);
	return value;
}

function jsonText(payload: PayloadRecord, ...keys: string[]): string | undefined {
	for (const key of keys) {
		if (payload[key] !== undefined) return JSON.stringify(payload[key]);
	}
	return undefined;
}

function content(payload: PayloadRecord): string {
	return text(payload, "content", "message", "summary") ?? jsonText(payload, "data", "payload") ?? "";
}
