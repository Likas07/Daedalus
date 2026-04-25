import type { AppServerDatabase } from "./database";

export type EventPayload = null | boolean | number | string | EventPayload[] | { readonly [key: string]: EventPayload };

export interface StoredEvent<TPayload extends EventPayload = EventPayload> {
	readonly seq: number;
	readonly streamId: string;
	readonly type: string;
	readonly payload: TPayload;
	readonly createdAt: string;
}

interface RuntimeEventRow {
	readonly seq: number;
	readonly stream_id: string;
	readonly type: string;
	readonly payload: string;
	readonly created_at: string;
}

export interface AppendEventInput<TPayload extends EventPayload = EventPayload> {
	readonly streamId: string;
	readonly type: string;
	readonly payload: TPayload;
}

export interface ReadEventsOptions {
	readonly streamId?: string;
	readonly limit?: number;
}

export function appendEvent<TPayload extends EventPayload>(
	database: AppServerDatabase,
	event: AppendEventInput<TPayload>,
): StoredEvent<TPayload> {
	const result = database
		.query("INSERT INTO runtime_events (stream_id, type, payload) VALUES (?, ?, ?)")
		.run(event.streamId, event.type, JSON.stringify(event.payload));
	const seq = Number(result.lastInsertRowid);
	const row = database
		.query<RuntimeEventRow, [number]>(
			"SELECT seq, stream_id, type, payload, created_at FROM runtime_events WHERE seq = ?",
		)
		.get(seq);
	if (!row) {
		throw new Error(`Failed to read appended event ${seq}`);
	}
	return mapEventRow<TPayload>(row);
}

export function readEvents(database: AppServerDatabase, options: ReadEventsOptions = {}): StoredEvent[] {
	const limit = options.limit ?? 1000;
	if (options.streamId) {
		return database
			.query<RuntimeEventRow, [string, number]>(
				"SELECT seq, stream_id, type, payload, created_at FROM runtime_events WHERE stream_id = ? ORDER BY seq ASC LIMIT ?",
			)
			.all(options.streamId, limit)
			.map(mapEventRow);
	}
	return database
		.query<RuntimeEventRow, [number]>(
			"SELECT seq, stream_id, type, payload, created_at FROM runtime_events ORDER BY seq ASC LIMIT ?",
		)
		.all(limit)
		.map(mapEventRow);
}

export function readEventsAfter(
	database: AppServerDatabase,
	seq: number,
	options: ReadEventsOptions = {},
): StoredEvent[] {
	const limit = options.limit ?? 1000;
	if (options.streamId) {
		return database
			.query<RuntimeEventRow, [number, string, number]>(
				"SELECT seq, stream_id, type, payload, created_at FROM runtime_events WHERE seq > ? AND stream_id = ? ORDER BY seq ASC LIMIT ?",
			)
			.all(seq, options.streamId, limit)
			.map(mapEventRow);
	}
	return database
		.query<RuntimeEventRow, [number, number]>(
			"SELECT seq, stream_id, type, payload, created_at FROM runtime_events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
		)
		.all(seq, limit)
		.map(mapEventRow);
}

export function readRecentEvents(database: AppServerDatabase, options: ReadEventsOptions = {}): StoredEvent[] {
	const limit = options.limit ?? 100;
	if (options.streamId) {
		return database
			.query<RuntimeEventRow, [string, number]>(
				"SELECT seq, stream_id, type, payload, created_at FROM runtime_events WHERE stream_id = ? ORDER BY seq DESC LIMIT ?",
			)
			.all(options.streamId, limit)
			.map(mapEventRow)
			.reverse();
	}
	return database
		.query<RuntimeEventRow, [number]>(
			"SELECT seq, stream_id, type, payload, created_at FROM runtime_events ORDER BY seq DESC LIMIT ?",
		)
		.all(limit)
		.map(mapEventRow)
		.reverse();
}

function mapEventRow<TPayload extends EventPayload = EventPayload>(row: RuntimeEventRow): StoredEvent<TPayload> {
	return {
		seq: row.seq,
		streamId: row.stream_id,
		type: row.type,
		payload: JSON.parse(row.payload) as TPayload,
		createdAt: row.created_at,
	};
}
