import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../../persistence/database";
import { readEvents } from "../../persistence/event-store";
import type { ThreadV1PayloadWindowResult, V1Request, V1RouteContext, V1RouteHandler } from "./router";

type PayloadChunk =
	| protocolV1.TerminalOutputChunk
	| protocolV1.DiffContentChunk
	| protocolV1.ToolOutputChunk
	| protocolV1.AuditDetailChunk;

export function createPayloadV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => method === "payload.window",
		handle: async (request, context) =>
			getPayloadWindowV1(asPayloadWindowParams(asV1Request(request).params), context),
	};
}

export function getPayloadWindowV1(
	params: protocolV1.PayloadWindowParams,
	context?: Pick<V1RouteContext, "database">,
): ThreadV1PayloadWindowResult {
	const database = context?.database;
	if (!database) throw payloadError("payload_unavailable", "payload.window requires a database-backed route context");
	if ("terminalId" in params) {
		const page = pageChunks(terminalChunks(database, params.threadId, params.terminalId), params);
		return { threadId: params.threadId, terminalId: params.terminalId, chunks: page.chunks, ...page.cursors };
	}
	if ("diffId" in params) {
		const page = pageChunks(diffChunks(database, params.threadId, params.diffId, params.filePath), params);
		return { threadId: params.threadId, diffId: params.diffId, chunks: page.chunks, ...page.cursors };
	}
	if ("toolCallId" in params) {
		const page = pageChunks(toolChunks(database, params.threadId, params.toolCallId), params);
		return { threadId: params.threadId, toolCallId: params.toolCallId, chunks: page.chunks, ...page.cursors };
	}
	const page = pageChunks(auditChunks(database, params.threadId, params.auditId), params);
	return { threadId: params.threadId, auditId: params.auditId, chunks: page.chunks, ...page.cursors };
}

function asPayloadWindowParams(value: unknown): protocolV1.PayloadWindowParams {
	const params = asRecord(value);
	const base = {
		threadId: requiredString(params, "threadId"),
		after: asCursor(params.after),
		before: asCursor(params.before),
		direction: replayDirection(params.direction),
		limit: limit(params.limit),
	};
	if (typeof params.terminalId === "string") return { ...base, terminalId: params.terminalId };
	if (typeof params.diffId === "string")
		return { ...base, diffId: params.diffId, filePath: optionalString(params.filePath) };
	if (typeof params.toolCallId === "string") return { ...base, toolCallId: params.toolCallId };
	if (typeof params.auditId === "string") return { ...base, auditId: params.auditId };
	throw new Error("payload.window requires terminalId, diffId, toolCallId, or auditId");
}

function asV1Request(value: unknown): V1Request {
	if (!value || typeof value !== "object") throw new Error("Invalid v1 request");
	return value as V1Request;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(params: Readonly<Record<string, unknown>>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required v1 parameter: ${key}`);
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asCursor(value: unknown): protocolV1.ReplayCursor | undefined {
	const cursor = asRecord(value);
	return typeof cursor.seq === "number" && Number.isFinite(cursor.seq) ? { seq: cursor.seq } : undefined;
}

function replayDirection(value: unknown): protocolV1.ReplayDirection | undefined {
	if (value === "backward") return "backward";
	if (value === "forward") return "forward";
	return undefined;
}

function limit(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(500, Math.floor(value))) : 100;
}

function terminalChunks(
	database: AppServerDatabase,
	threadId: string,
	terminalId: string,
): protocolV1.TerminalOutputChunk[] {
	const chunks = readEvents(database, { limit: 10000 }).flatMap((event) => {
		const payload = storedPayload(event.payload);
		const eventThreadId = stringValue(payload.sessionId) ?? stringValue(payload.threadId) ?? event.streamId;
		const eventTerminalId = stringValue(payload.terminalId) ?? stringValue(payload.terminal_id) ?? event.streamId;
		if (eventThreadId !== threadId && event.streamId !== terminalId) return [];
		if (eventTerminalId !== terminalId) return [];
		if (event.type !== "terminal/output" && event.type !== "agent/command_output") return [];
		const text = stringValue(payload.data) ?? stringValue(payload.text) ?? stringValue(payload.output) ?? "";
		return [{ cursor: { seq: event.seq }, text, byteLength: byteLength(text) }];
	});
	if (chunks.length > 0) return chunks;
	const row = database
		.query<{ history: string; session_id: string | null }, [string]>(
			"SELECT history, session_id FROM terminal_sessions WHERE id = ? LIMIT 1",
		)
		.get(terminalId);
	if (!row) throw payloadError("payload_not_found", `Terminal payload ${terminalId} was not found.`);
	if (row.session_id && row.session_id !== threadId)
		throw payloadError("payload_wrong_thread", `Terminal payload ${terminalId} belongs to another thread.`);
	return row.history ? [{ cursor: { seq: 1 }, text: row.history, byteLength: byteLength(row.history) }] : [];
}

function diffChunks(
	database: AppServerDatabase,
	threadId: string,
	diffId: string,
	filePath?: string,
): protocolV1.DiffContentChunk[] {
	const chunks = readEvents(database, { streamId: threadId, limit: 10000 }).flatMap((event) => {
		const payload = storedPayload(event.payload);
		const eventDiffId = stringValue(payload.diffId) ?? stringValue(payload.diff_id);
		if (eventDiffId && eventDiffId !== diffId) return [];
		if (!eventDiffId && event.type !== "diff/updated" && event.type !== "agent/file_change") return [];
		const path =
			stringValue(payload.filePath) ?? stringValue(payload.file_path) ?? stringValue(payload.path) ?? filePath;
		if (!path || (filePath && path !== filePath)) return [];
		const hunk = stringValue(payload.hunk) ?? stringValue(payload.patch) ?? stringValue(payload.diff) ?? "";
		if (!hunk && eventDiffId !== diffId) return [];
		return [{ cursor: { seq: event.seq }, filePath: path, hunk, byteLength: byteLength(hunk) }];
	});
	if (chunks.length > 0) return chunks;
	const reconstructed = reconstructDiffChunks(database, threadId, diffId, filePath);
	if (reconstructed.length > 0) return reconstructed;
	throw payloadError("payload_not_found", `Diff payload ${diffId} was not found.`);
}

function toolChunks(database: AppServerDatabase, threadId: string, toolCallId: string): protocolV1.ToolOutputChunk[] {
	const chunks = readEvents(database, { streamId: threadId, limit: 10000 }).flatMap((event) => {
		const payload = storedPayload(event.payload);
		const eventToolCallId =
			stringValue(payload.toolCallId) ?? stringValue(payload.tool_call_id) ?? stringValue(payload.id);
		if (eventToolCallId !== toolCallId) return [];
		if (
			event.type !== "agent/tool_delta" &&
			event.type !== "agent/tool_end" &&
			event.type !== "agent/tool_execution_update" &&
			event.type !== "agent/tool_execution_end"
		)
			return [];
		const text =
			stringValue(payload.delta) ??
			stringValue(payload.output) ??
			stringValue(payload.content) ??
			stringValue(payload.text) ??
			stringValue(payload.summary) ??
			"";
		return [{ cursor: { seq: event.seq }, text, byteLength: byteLength(text) }];
	});
	if (chunks.length > 0) return chunks;
	throw payloadError("payload_not_found", `Tool payload ${toolCallId} was not found.`);
}

function auditChunks(database: AppServerDatabase, threadId: string, auditId: string): protocolV1.AuditDetailChunk[] {
	const chunks = readEvents(database, { streamId: threadId, limit: 10000 }).flatMap((event) => {
		const payload = storedPayload(event.payload);
		const eventAuditId = stringValue(payload.auditId) ?? stringValue(payload.audit_id) ?? String(event.seq);
		if (eventAuditId !== auditId) return [];
		if (!event.type.startsWith("audit/") && eventAuditId !== String(event.seq)) return [];
		return [{ cursor: { seq: event.seq }, data: payload, byteLength: byteLength(JSON.stringify(payload)) }];
	});
	if (chunks.length > 0) return chunks;
	throw payloadError("payload_not_found", `Audit payload ${auditId} was not found.`);
}

function pageChunks<Chunk extends PayloadChunk>(
	chunks: readonly Chunk[],
	params: Pick<protocolV1.PayloadWindowParams, "after" | "before" | "direction" | "limit">,
): {
	readonly chunks: Chunk[];
	readonly cursors: {
		readonly nextCursor?: protocolV1.ReplayCursor;
		readonly previousCursor?: protocolV1.ReplayCursor;
		readonly hasMoreAfter: boolean;
		readonly hasMoreBefore: boolean;
	};
} {
	let filtered = [...chunks].sort((a, b) => a.cursor.seq - b.cursor.seq);
	if (params.after) filtered = filtered.filter((chunk) => chunk.cursor.seq > params.after!.seq);
	if (params.before) filtered = filtered.filter((chunk) => chunk.cursor.seq < params.before!.seq);
	if ((params.direction ?? "forward") === "backward")
		filtered = filtered.slice(Math.max(0, filtered.length - params.limit));
	else filtered = filtered.slice(0, params.limit);
	const first = filtered.at(0);
	const last = filtered.at(-1);
	return {
		chunks: filtered,
		cursors: {
			previousCursor: first?.cursor,
			nextCursor: last?.cursor,
			hasMoreBefore: first ? chunks.some((chunk) => chunk.cursor.seq < first.cursor.seq) : false,
			hasMoreAfter: last ? chunks.some((chunk) => chunk.cursor.seq > last.cursor.seq) : false,
		},
	};
}

function storedPayload(payload: unknown): Record<string, unknown> {
	const record = asRecord(payload);
	const nested = asRecord(record.payload);
	return Object.keys(nested).length === 0 ? record : { ...record, ...nested };
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function payloadError(code: string, message: string): Error {
	return Object.assign(new Error(message), { code });
}

function reconstructDiffChunks(
	database: AppServerDatabase,
	threadId: string,
	diffId: string,
	filePath?: string,
): protocolV1.DiffContentChunk[] {
	if (!diffId.includes(`:${threadId}:`)) return [];
	const row = database
		.query<{ runs_in_json: string | null }, [string]>("SELECT runs_in_json FROM sessions WHERE id = ? LIMIT 1")
		.get(threadId);
	if (!row?.runs_in_json) return [];
	const runsIn = asRecord(JSON.parse(row.runs_in_json));
	const cwd = stringValue(runsIn.canonicalPath) ?? stringValue(runsIn.path);
	if (!cwd || !filePath) return [];
	const proc = Bun.spawnSync(["git", "diff", "--patch", "HEAD", "--", filePath], { cwd });
	if (proc.exitCode !== 0) return [];
	const patch = new TextDecoder().decode(proc.stdout);
	return splitPatchHunks(patch).map((hunk, index) => ({
		cursor: { seq: index + 1 },
		filePath,
		hunk,
		byteLength: byteLength(hunk),
	}));
}

function splitPatchHunks(patch: string): string[] {
	if (!patch.trim()) return [];
	const parts = patch.split(/(?=^@@\s)/m).filter(Boolean);
	return parts.length > 0 ? parts : [patch];
}
