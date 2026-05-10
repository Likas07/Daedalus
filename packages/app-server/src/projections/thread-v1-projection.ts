import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import { readEvents, type StoredEvent } from "../persistence/event-store";
import { listActiveApprovals, listSessionTurns, listTerminalSessions } from "../persistence/read-model";

type JsonRecord = Record<string, unknown>;

interface SessionRow {
	readonly id: string;
	readonly project_id: string | null;
	readonly worktree_id: string | null;
	readonly status: string;
	readonly title: string | null;
	readonly created_at: string;
	readonly updated_at: string;
	readonly validation_status: string | null;
	readonly needs_attention_reason: string | null;
}

interface CheckpointRow {
	readonly id: string;
	readonly session_id: string | null;
	readonly worktree_id: string | null;
	readonly label: string | null;
	readonly created_at: string;
}

export interface ThreadV1Snapshot {
	readonly thread: protocolV1.Thread;
	readonly turns: readonly protocolV1.Turn[];
	readonly timeline: protocolV1.TimelineWindowResult;
}

export interface BuildThreadV1SnapshotOptions {
	readonly database: AppServerDatabase;
	readonly threadId: string;
	readonly limit?: number;
}

export interface ReplayThreadV1Options {
	readonly database: AppServerDatabase;
	readonly params: protocolV1.ThreadReplayParams;
}

export interface ListThreadV1TurnsOptions {
	readonly database: AppServerDatabase;
	readonly threadId: string;
}

export function buildThreadV1Snapshot(options: BuildThreadV1SnapshotOptions): ThreadV1Snapshot {
	const thread = buildThreadV1({ database: options.database, threadId: options.threadId });
	return {
		thread,
		turns: listThreadV1Turns({ database: options.database, threadId: options.threadId }),
		timeline: replayThreadV1({
			database: options.database,
			params: { threadId: options.threadId, limit: options.limit ?? 100 },
		}),
	};
}

export function buildThreadV1(options: {
	readonly database: AppServerDatabase;
	readonly threadId: string;
}): protocolV1.Thread {
	const session = readSession(options.database, options.threadId);
	if (!session) throw new Error(`Unknown thread: ${options.threadId}`);
	const turns = listThreadV1Turns({ database: options.database, threadId: options.threadId });
	const pendingApprovals = listActiveApprovals(options.database, options.threadId);
	const lastTurn = turns.at(-1);
	return {
		threadId: options.threadId,
		projectId: session.project_id ?? `project:${options.threadId}`,
		workspaceTargetId: session.worktree_id ?? `base:${session.project_id ?? options.threadId}`,
		title: session.title ?? titleFromTurns(options.database, options.threadId) ?? "Untitled Thread",
		status: mapThreadStatus(session.status, turns, pendingApprovals.length),
		createdAt: session.created_at,
		updatedAt: session.updated_at,
		lastTurnId: lastTurn?.turnId,
	};
}

export function listThreadV1Turns(options: ListThreadV1TurnsOptions): protocolV1.Turn[] {
	const rows = listSessionTurns(options.database, options.threadId);
	const eventIndex = buildThreadEventIndex(options.database, options.threadId);
	const turnRowsById = new Map(rows.map((row) => [row.id, row]));
	const fallbackTurnIds =
		eventIndex.turnOrder.length > 0
			? rows.filter((row) => row.role === "user").map((row) => row.id)
			: rows.map((row) => row.id);
	const turnIds = new Set<string>([...eventIndex.turnOrder, ...fallbackTurnIds]);
	return [...turnIds]
		.map((turnId) => {
			const row = turnRowsById.get(turnId);
			const event = eventIndex.turns.get(turnId);
			const createdAt = event?.createdAt ?? row?.createdAt;
			if (!createdAt) return undefined;
			const prompt = event?.prompt ?? (row?.role === "user" ? row.content : undefined);
			return {
				turnId,
				threadId: options.threadId,
				status: event?.status ?? "completed",
				...(prompt ? { prompt } : {}),
				createdAt,
				updatedAt: event?.updatedAt ?? row?.createdAt ?? createdAt,
				...(event?.completedAt ? { completedAt: event.completedAt } : {}),
			} satisfies protocolV1.Turn;
		})
		.filter((turn): turn is protocolV1.Turn => !!turn)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.turnId.localeCompare(b.turnId));
}

export function replayThreadV1(options: ReplayThreadV1Options): protocolV1.TimelineWindowResult {
	const entries = collectThreadTimelineEntries(options.database, options.params.threadId);
	const direction = options.params.direction ?? "forward";
	const limit = options.params.limit;
	let filtered = entries;
	if (options.params.after) filtered = filtered.filter((entry) => entry.sequence > options.params.after!.seq);
	if (options.params.before) filtered = filtered.filter((entry) => entry.sequence < options.params.before!.seq);
	if (direction === "backward") filtered = filtered.slice(Math.max(0, filtered.length - limit));
	else filtered = filtered.slice(0, limit);
	const first = filtered.at(0);
	const last = filtered.at(-1);
	return {
		threadId: options.params.threadId,
		entries: filtered,
		previousCursor: first ? { seq: first.sequence } : undefined,
		nextCursor: last ? { seq: last.sequence } : undefined,
		hasMoreBefore: first ? entries.some((entry) => entry.sequence < first.sequence) : false,
		hasMoreAfter: last ? entries.some((entry) => entry.sequence > last.sequence) : false,
	};
}

export function collectThreadTimelineEntries(
	database: AppServerDatabase,
	threadId: string,
): protocolV1.TimelineEntry[] {
	const session = readSession(database, threadId);
	if (!session) throw new Error(`Unknown thread: ${threadId}`);
	const events = readEvents(database, { limit: 10000 });
	const eventEntries = events
		.map((event) => projectStoredEventToTimelineEntry(event, threadId))
		.filter((entry): entry is protocolV1.TimelineEntry => !!entry);
	const eventEntryIds = new Set(eventEntries.map((entry) => entry.entryId));
	const fallbackEntries = collectReadModelFallbackEntries(database, session, eventEntryIds, maxSequence(eventEntries));
	return dedupeTimelineEntries([...eventEntries, ...fallbackEntries]).sort(
		(a, b) => a.sequence - b.sequence || a.entryId.localeCompare(b.entryId),
	);
}

export function projectStoredEventToTimelineEntry(
	event: StoredEvent,
	threadId?: string,
): protocolV1.TimelineEntry | undefined {
	const payload = storedEventPayload(event);
	const legacySessionId = text(payload, "sessionId", "session_id") ?? event.streamId;
	if (!legacySessionId || legacySessionId === "app") return undefined;
	if (threadId && legacySessionId !== threadId) return undefined;
	const base = {
		threadId: legacySessionId,
		sequence: event.seq,
		createdAt: text(payload, "createdAt", "created_at", "occurredAt", "occurred_at", "ts") ?? event.createdAt,
		sourceEventId: String(event.seq),
	};
	switch (event.type) {
		case "turn/started": {
			const turnId = text(payload, "turnId", "turn_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `turn:${turnId}:user`,
				kind: "user-message",
				role: "user",
				turnId,
				messageId: turnId,
				content: text(payload, "prompt", "content", "message") ?? "",
			};
		}
		case "agent/message_start": {
			const message = asRecord(payload.message);
			const turnId = text(payload, "turnId", "turn_id");
			const messageId =
				text(payload, "messageId", "message_id") ?? text(message, "id", "messageId", "message_id") ?? String(event.seq);
			return {
				...base,
				entryId: `message:${messageId}`,
				kind: "activity",
				turnId,
				status: "running",
				title: "Assistant message started",
			};
		}
		case "agent/message_delta":
		case "agent/message_update": {
			return undefined;
		}
		case "agent/message_end": {
			const message = asRecord(payload.message);
			const role = text(message, "role") ?? text(payload, "role") ?? "assistant";
			const turnId = text(payload, "turnId", "turn_id") ?? String(event.seq);
			const messageId = messageIdFromPayload(payload, message, turnId) ?? String(event.seq);
			if (role === "user") {
				return {
					...base,
					entryId: `message:${messageId}`,
					kind: "user-message",
					role: "user",
					turnId,
					messageId,
					content: content(message) || content(payload),
				};
			}
			return {
				...base,
				entryId: `message:${messageId}`,
				kind: "assistant-message",
				role: "assistant",
				turnId,
				messageId,
				content: content(message) || content(payload),
			};
		}
		case "agent/tool_start":
		case "agent/tool_execution_start": {
			const turnId = text(payload, "turnId", "turn_id");
			if (!turnId) return undefined;
			const toolCallId = text(payload, "toolCallId", "tool_call_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `tool:${toolCallId}`,
				kind: "tool",
				turnId,
				toolCallId,
				toolName: text(payload, "toolName", "tool_name", "name") ?? "tool",
				status: "running",
				summary: text(payload, "summary", "input", "command"),
			};
		}
		case "agent/tool_delta":
		case "agent/tool_execution_update": {
			return undefined;
		}
		case "agent/tool_end":
		case "agent/tool_execution_end": {
			const turnId = text(payload, "turnId", "turn_id");
			if (!turnId) return undefined;
			const toolCallId = text(payload, "toolCallId", "tool_call_id", "id") ?? String(event.seq);
			const output = text(payload, "output", "content", "text", "summary") ?? "";
			return {
				...base,
				entryId: `tool:${toolCallId}`,
				kind: "tool",
				turnId,
				toolCallId,
				toolName: text(payload, "toolName", "tool_name", "name") ?? "tool",
				status: mapToolStatus(text(payload, "status")),
				summary: output.slice(0, 120) || text(payload, "summary"),
				...(output
					? {
							payloadRef: {
								kind: "tool-output" as const,
								toolCallId,
								cursor: { seq: event.seq },
								byteLength: byteLength(output),
							},
						}
					: {}),
			};
		}
		case "agent/command_output": {
			const turnId = text(payload, "turnId", "turn_id");
			const terminalId = text(payload, "terminalId", "terminal_id", "commandId", "command_id", "id") ?? String(event.seq);
			const data = text(payload, "data", "text", "output", "chunk") ?? "";
			return {
				...base,
				entryId: `command:${terminalId}:output:${event.seq}`,
				kind: "terminal-output",
				turnId,
				summary: data.slice(0, 120),
				payloadRef: {
					kind: "terminal-output",
					terminalId,
					cursor: { seq: event.seq },
					byteLength: byteLength(data),
				},
			};
		}
		case "agent/file_change": {
			return {
				...base,
				entryId: `file-change:${event.seq}`,
				kind: "activity",
				turnId: text(payload, "turnId", "turn_id"),
				status: "completed",
				title: text(payload, "path", "filePath", "file_path") ?? "File changed",
				description: text(payload, "summary", "operation"),
			};
		}
		case "turn/completed":
			return {
				...base,
				entryId: `turn:${text(payload, "turnId", "turn_id", "id") ?? event.seq}:completed`,
				kind: "activity",
				turnId: text(payload, "turnId", "turn_id", "id"),
				status: "completed",
				title: "Turn completed",
				description: text(payload, "summary", "content"),
			};
		case "turn/interrupted":
			return {
				...base,
				entryId: `turn:${text(payload, "turnId", "turn_id", "id") ?? event.seq}:cancelled`,
				kind: "activity",
				turnId: text(payload, "turnId", "turn_id", "id"),
				status: "failed",
				title: "Turn cancelled",
			};
		case "approval/requested": {
			const approvalId = text(payload, "approvalId", "approval_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `approval:${approvalId}`,
				kind: "approval",
				approvalId,
				status: "pending",
				title: approvalTitle(payload),
				summary: approvalSummary(payload),
			};
		}
		case "approval/resolved": {
			const approvalId = text(payload, "approvalId", "approval_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `approval:${approvalId}:resolved`,
				kind: "approval",
				approvalId,
				status: mapApprovalStatus(text(payload, "status")),
				title: "Approval resolved",
				summary: approvalSummary(payload),
			};
		}
		case "checkpoint/created": {
			const checkpointId = text(payload, "checkpointId", "checkpoint_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `checkpoint:${checkpointId}`,
				kind: "activity",
				status: "completed",
				title: text(payload, "label") ?? "Checkpoint created",
			};
		}
		case "terminal/started": {
			const terminalId = text(payload, "terminalId", "terminal_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `terminal:${terminalId}:started`,
				kind: "activity",
				status: "running",
				title: `Terminal: ${text(payload, "shell") ?? text(payload, "cwd") ?? terminalId}`,
				description: text(payload, "cwd"),
			};
		}
		case "terminal/closed": {
			const terminalId = text(payload, "terminalId", "terminal_id", "id") ?? String(event.seq);
			return {
				...base,
				entryId: `terminal:${terminalId}:closed`,
				kind: "activity",
				status: "completed",
				title: `Terminal closed: ${terminalId}`,
			};
		}
		case "terminal/output": {
			const terminalId = text(payload, "terminalId", "terminal_id", "id") ?? String(event.seq);
			const data = text(payload, "data", "text", "chunk") ?? "";
			return {
				...base,
				entryId: `terminal:${terminalId}:output:${event.seq}`,
				kind: "terminal-output",
				summary: data.slice(0, 120),
				payloadRef: {
					kind: "terminal-output",
					terminalId,
					cursor: { seq: event.seq },
					byteLength: byteLength(data),
				},
			};
		}
		case "session/resume-identity-mismatched":
			return {
				...base,
				entryId: `safety:${event.seq}`,
				kind: "safety",
				level: "warning",
				message:
					text(payload, "needsAttentionReason", "needs_attention_reason", "reason") ??
					"Thread target identity needs attention",
				code: "resume-identity-mismatched",
			};
		default:
			return undefined;
	}
}

function readSession(database: AppServerDatabase, threadId: string): SessionRow | undefined {
	return (
		database
			.query<SessionRow, [string]>(
				"SELECT id, project_id, worktree_id, status, title, created_at, updated_at, validation_status, needs_attention_reason FROM sessions WHERE id = ?",
			)
			.get(threadId) ?? undefined
	);
}

function collectReadModelFallbackEntries(
	database: AppServerDatabase,
	session: SessionRow,
	existingEntryIds: ReadonlySet<string>,
	startSequence: number,
): protocolV1.TimelineEntry[] {
	let sequence = startSequence;
	const entries: protocolV1.TimelineEntry[] = [];
	for (const turn of listSessionTurns(database, session.id)) {
		const kind = turn.role === "user" ? "user-message" : "assistant-message";
		const entryId = `turn:${turn.id}:${turn.role}`;
		if (
			existingEntryIds.has(entryId) ||
			existingEntryIds.has(`turn:${turn.id}:user`) ||
			existingEntryIds.has(`message:${turn.id}`)
		)
			continue;
		sequence += 1;
		entries.push({
			entryId,
			threadId: session.id,
			turnId: turn.id,
			sequence,
			createdAt: turn.createdAt,
			kind,
			role: kind === "user-message" ? "user" : "assistant",
			messageId: turn.id,
			content: turn.content,
		} as protocolV1.TimelineEntry);
	}
	for (const approval of listActiveApprovals(database, session.id)) {
		const entryId = `approval:${approval.id}`;
		if (existingEntryIds.has(entryId)) continue;
		sequence += 1;
		entries.push({
			entryId,
			threadId: session.id,
			sequence,
			createdAt: approval.createdAt,
			kind: "approval",
			approvalId: approval.id,
			status: "pending",
			title: approvalTitle(parseMaybeJson(approval.request)),
			summary: approval.request,
		});
	}
	for (const terminal of listTerminalSessions(database, session.project_id ?? undefined).filter(
		(terminal) => !session.worktree_id || terminal.worktreeId === session.worktree_id,
	)) {
		const entryId = `terminal:${terminal.id}:started`;
		if (existingEntryIds.has(entryId)) continue;
		sequence += 1;
		entries.push({
			entryId,
			threadId: session.id,
			sequence,
			createdAt: terminal.createdAt,
			kind: "activity",
			status: terminal.status === "running" ? "running" : "completed",
			title: `Terminal: ${terminal.shell || terminal.cwd}`,
			description: terminal.cwd,
		});
	}
	for (const checkpoint of listCheckpoints(database, session.id)) {
		const entryId = `checkpoint:${checkpoint.id}`;
		if (existingEntryIds.has(entryId)) continue;
		sequence += 1;
		entries.push({
			entryId,
			threadId: session.id,
			sequence,
			createdAt: checkpoint.created_at,
			kind: "activity",
			status: "completed",
			title: checkpoint.label ?? "Checkpoint created",
		});
	}
	return entries;
}

function buildThreadEventIndex(
	database: AppServerDatabase,
	threadId: string,
): {
	readonly turnOrder: readonly string[];
	readonly turns: ReadonlyMap<
		string,
		{
			readonly status: protocolV1.TurnStatus;
			readonly prompt?: string;
			readonly createdAt: string;
			readonly updatedAt: string;
			readonly completedAt?: string;
		}
	>;
} {
	const mutable = new Map<
		string,
		{ status: protocolV1.TurnStatus; prompt?: string; createdAt: string; updatedAt: string; completedAt?: string }
	>();
	const turnOrder: string[] = [];
	for (const event of readEvents(database, { streamId: threadId, limit: 10000 })) {
		const payload = storedEventPayload(event);
		const turnId = text(payload, "turnId", "turn_id", "id");
		if (!turnId) continue;
		const timestamp = text(payload, "createdAt", "created_at", "occurredAt", "occurred_at", "ts") ?? event.createdAt;
		const previous = mutable.get(turnId);
		if (!previous) turnOrder.push(turnId);
		if (event.type === "turn/started") {
			mutable.set(turnId, {
				status: "running",
				prompt: text(payload, "prompt", "content", "message"),
				createdAt: previous?.createdAt ?? timestamp,
				updatedAt: timestamp,
			});
		} else if (event.type === "turn/completed") {
			mutable.set(turnId, {
				status: "completed",
				prompt: previous?.prompt,
				createdAt: previous?.createdAt ?? timestamp,
				updatedAt: timestamp,
				completedAt: timestamp,
			});
		} else if (event.type === "turn/interrupted") {
			mutable.set(turnId, {
				status: "cancelled",
				prompt: previous?.prompt,
				createdAt: previous?.createdAt ?? timestamp,
				updatedAt: timestamp,
				completedAt: timestamp,
			});
		}
	}
	return { turnOrder, turns: mutable };
}

function listCheckpoints(database: AppServerDatabase, threadId: string): CheckpointRow[] {
	return database
		.query<CheckpointRow, [string]>(
			"SELECT id, session_id, worktree_id, label, created_at FROM checkpoints WHERE session_id = ? ORDER BY created_at ASC, id ASC",
		)
		.all(threadId);
}

function mapThreadStatus(
	status: string,
	turns: readonly protocolV1.Turn[],
	pendingApprovalCount: number,
): protocolV1.ThreadStatus {
	if (pendingApprovalCount > 0 || status === "waiting_for_approval") return "waiting";
	if (turns.some((turn) => turn.status === "running" || turn.status === "queued")) return "running";
	if (["active", "running"].includes(status)) return "running";
	if (["failed", "needs-attention"].includes(status)) return "failed";
	if (["completed", "done"].includes(status)) return "completed";
	return "idle";
}

function mapApprovalStatus(status: string | undefined): protocolV1.ApprovalStatus {
	if (status === "approved" || status === "allow" || status === "resolved") return "approved";
	if (status === "denied" || status === "rejected") return "denied";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	return "pending";
}

function mapToolStatus(status: string | undefined): protocolV1.ToolStatus {
	if (status === "failed" || status === "error") return "failed";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	return "completed";
}

function dedupeTimelineEntries(entries: readonly protocolV1.TimelineEntry[]): protocolV1.TimelineEntry[] {
	const byId = new Map<string, protocolV1.TimelineEntry>();
	for (const entry of entries) byId.set(entry.entryId, entry);
	return [...byId.values()];
}

function maxSequence(entries: readonly protocolV1.TimelineEntry[]): number {
	return entries.reduce((max, entry) => Math.max(max, entry.sequence), 0);
}

function titleFromTurns(database: AppServerDatabase, threadId: string): string | undefined {
	return listSessionTurns(database, threadId)
		.find((turn) => turn.role === "user" && turn.content.trim())
		?.content.slice(0, 80);
}

function storedEventPayload(event: StoredEvent): JsonRecord {
	const envelope = asRecord(event.payload);
	const nestedPayload = asRecord(envelope.payload);
	if (!isAppEventEnvelope(envelope) || Object.keys(nestedPayload).length === 0) return envelope;
	return { ...appEventEnvelopeFields(envelope), ...nestedPayload };
}

function isAppEventEnvelope(payload: JsonRecord): boolean {
	return typeof payload.type === "string" && payload.payload !== undefined && typeof payload.ts === "string";
}

function appEventEnvelopeFields(envelope: JsonRecord): JsonRecord {
	const fields: JsonRecord = {};
	for (const key of [
		"sessionId",
		"session_id",
		"projectId",
		"project_id",
		"worktreeId",
		"worktree_id",
		"terminalId",
		"terminal_id",
		"approvalId",
		"approval_id",
		"checkpointId",
		"checkpoint_id",
		"ts",
		"createdAt",
		"created_at",
		"occurredAt",
		"occurred_at",
	] as const) {
		if (envelope[key] !== undefined) fields[key] = envelope[key];
	}
	return fields;
}

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function parseMaybeJson(value: string): JsonRecord {
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return { summary: value };
	}
}

function text(payload: JsonRecord, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = textValue(payload[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function content(payload: JsonRecord): string {
	const visible = text(payload, "content", "message", "summary", "text");
	if (visible !== undefined) return visible;
	const fallback = payload.data ?? payload.payload;
	return fallback === undefined ? "" : JSON.stringify(fallback);
}

function messageIdFromPayload(payload: JsonRecord, message: JsonRecord, turnId?: string): string | undefined {
	const assistantMessageEvent = asRecord(payload.assistantMessageEvent);
	const partial = asRecord(assistantMessageEvent.partial);
	return (
		text(payload, "messageId", "message_id") ??
		text(message, "id", "messageId", "message_id", "responseId") ??
		text(partial, "id", "messageId", "message_id", "responseId") ??
		text(payload, "responseId", "response_id") ??
		text(payload, "id") ??
		turnId
	);
}

function textValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		const parts = value.map(textPart).filter((part): part is string => part !== undefined);
		if (parts.length > 0) return parts.join("");
		return undefined;
	}
	if (value && typeof value === "object") {
		const record = value as JsonRecord;
		return textValue(record.text) ?? textValue(record.content) ?? textValue(record.message) ?? textValue(record.summary);
	}
	return undefined;
}

function textPart(value: unknown): string | undefined {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
	if (!value || typeof value !== "object") return undefined;
	const record = value as JsonRecord;
	const type = typeof record.type === "string" ? record.type : undefined;
	if (type && type !== "text" && type !== "output_text" && type !== "summary_text") return undefined;
	return textValue(record.text) ?? textValue(record.content) ?? textValue(record.message) ?? textValue(record.summary);
}

function approvalTitle(payload: JsonRecord): string {
	const request = asRecord(payload.request);
	return (
		text(payload, "summary", "action", "title") ?? text(request, "summary", "action", "title") ?? "Approval required"
	);
}

function approvalSummary(payload: JsonRecord): string | undefined {
	const request = payload.request;
	if (typeof request === "string") return request;
	if (request !== undefined) return JSON.stringify(request);
	return text(payload, "summary", "content", "message");
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
