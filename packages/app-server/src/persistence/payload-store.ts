import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "./database";

export type PayloadKind = "terminal-output" | "diff-content" | "tool-output" | "audit-detail";

export interface StorePayloadChunkInput {
	readonly threadId: string;
	readonly kind: PayloadKind;
	readonly payloadId: string;
	readonly sequence: number;
	readonly text?: string;
	readonly data?: unknown;
	readonly filePath?: string;
	readonly contentType?: string;
}

interface PayloadChunkRow {
	readonly seq: number;
	readonly kind: PayloadKind;
	readonly payload_id: string;
	readonly text: string | null;
	readonly data: string | null;
	readonly file_path: string | null;
	readonly content_type: string | null;
	readonly byte_length: number;
}

export function storePayloadChunk(database: AppServerDatabase, input: StorePayloadChunkInput): void {
	const text = input.text ?? (input.data === undefined ? "" : JSON.stringify(input.data));
	database
		.query(
			`INSERT OR REPLACE INTO payload_chunks
				(thread_id, kind, payload_id, seq, text, data, file_path, content_type, byte_length)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			input.threadId,
			input.kind,
			input.payloadId,
			input.sequence,
			input.text ?? null,
			input.data === undefined ? null : JSON.stringify(input.data),
			input.filePath ?? null,
			input.contentType ?? null,
			byteLength(text),
		);
}

export function getPayloadByteLength(
	database: AppServerDatabase,
	input: { readonly threadId: string; readonly kind: PayloadKind; readonly payloadId: string },
): number {
	return (
		database
			.query<{ readonly total: number | null }, [string, PayloadKind, string]>(
				"SELECT COALESCE(SUM(byte_length), 0) AS total FROM payload_chunks WHERE thread_id = ? AND kind = ? AND payload_id = ?",
			)
			.get(input.threadId, input.kind, input.payloadId)?.total ?? 0
	);
}

export function readPayloadWindow(
	database: AppServerDatabase,
	params: protocolV1.PayloadWindowParams,
): protocolV1.PayloadWindowResult {
	const kind = payloadKind(params);
	const payloadId = payloadIdentifier(params);
	const direction = params.direction ?? "forward";
	let rows = database
		.query<PayloadChunkRow, [string, PayloadKind, string]>(
			"SELECT seq, kind, payload_id, text, data, file_path, content_type, byte_length FROM payload_chunks WHERE thread_id = ? AND kind = ? AND payload_id = ? ORDER BY seq ASC",
		)
		.all(params.threadId, kind, payloadId);
	if (params.after) rows = rows.filter((row) => row.seq > params.after!.seq);
	if (params.before) rows = rows.filter((row) => row.seq < params.before!.seq);
	const windowRows =
		direction === "backward" ? rows.slice(Math.max(0, rows.length - params.limit)) : rows.slice(0, params.limit);
	const first = windowRows.at(0);
	const last = windowRows.at(-1);
	const cursors = {
		nextCursor: last ? { seq: last.seq } : undefined,
		previousCursor: first ? { seq: first.seq } : undefined,
		hasMoreAfter: last ? rows.some((row) => row.seq > last.seq) : false,
		hasMoreBefore: first ? rows.some((row) => row.seq < first.seq) : false,
	};
	if ("terminalId" in params) {
		return {
			threadId: params.threadId,
			terminalId: params.terminalId,
			chunks: windowRows.map((row) => ({
				cursor: { seq: row.seq },
				text: row.text ?? "",
				byteLength: row.byte_length,
			})),
			...cursors,
		};
	}
	if ("diffId" in params) {
		return {
			threadId: params.threadId,
			diffId: params.diffId,
			chunks: windowRows
				.filter((row) => !params.filePath || row.file_path === params.filePath)
				.map((row) => ({
					cursor: { seq: row.seq },
					filePath: row.file_path ?? params.filePath ?? "diff",
					hunk: row.text ?? "",
					byteLength: row.byte_length,
				})),
			...cursors,
		};
	}
	if ("toolCallId" in params) {
		return {
			threadId: params.threadId,
			toolCallId: params.toolCallId,
			chunks: windowRows.map((row) => ({
				cursor: { seq: row.seq },
				text: row.text ?? "",
				byteLength: row.byte_length,
			})),
			...cursors,
		};
	}
	return {
		threadId: params.threadId,
		auditId: params.auditId,
		chunks: windowRows.map((row) => ({
			cursor: { seq: row.seq },
			data: row.data ? JSON.parse(row.data) : (row.text ?? null),
			byteLength: row.byte_length,
		})),
		...cursors,
	};
}

function payloadKind(params: protocolV1.PayloadWindowParams): PayloadKind {
	if ("terminalId" in params) return "terminal-output";
	if ("diffId" in params) return "diff-content";
	if ("toolCallId" in params) return "tool-output";
	return "audit-detail";
}

function payloadIdentifier(params: protocolV1.PayloadWindowParams): string {
	if ("terminalId" in params) return params.terminalId;
	if ("diffId" in params) return params.diffId;
	if ("toolCallId" in params) return params.toolCallId;
	return params.auditId;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
