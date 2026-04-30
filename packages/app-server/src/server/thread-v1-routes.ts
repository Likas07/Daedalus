import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import type { StoredEvent } from "../persistence/event-store";
import { projectRuntimeEvents } from "../persistence/projector";
import {
	buildThreadV1Snapshot,
	listThreadV1Turns,
	projectStoredEventToTimelineEntry,
	replayThreadV1,
} from "../projections/thread-v1-projection";

export type ThreadV1Method = "thread.get" | "thread.replay" | "turn.start" | "turn.cancel" | "payload.window";

export interface ThreadV1Request {
	readonly kind?: "request";
	readonly id?: string | number;
	readonly method: ThreadV1Method;
	readonly params: unknown;
}

export interface ThreadV1GetResult {
	readonly thread: protocolV1.Thread;
	readonly turns: readonly protocolV1.Turn[];
	readonly timeline: protocolV1.TimelineWindowResult;
}

export type ThreadV1ReplayResult = protocolV1.TimelineWindowResult;
export type ThreadV1StartTurnResult = protocolV1.TurnStartResult;
export type ThreadV1CancelTurnResult = protocolV1.TurnCancelResult;
export type ThreadV1PayloadWindowResult = protocolV1.PayloadWindowResult;

export interface ThreadV1RouteResult {
	readonly handled: boolean;
	readonly result?: unknown;
}

export interface ThreadV1RuntimeAuthority {
	startTurn(input: {
		readonly threadId: string;
		readonly prompt: string;
		readonly attachmentIds?: readonly string[];
		readonly filePaths?: readonly string[];
		readonly model?: string;
		readonly effort?: string;
		readonly draftState?: Readonly<Record<string, unknown>>;
	}): Promise<{ readonly turnId?: string }>;
	cancelTurn(input: { readonly threadId: string; readonly turnId: string }): Promise<void>;
}

export interface ThreadV1RouteOptions {
	readonly database: AppServerDatabase;
	readonly authority: ThreadV1RuntimeAuthority;
	readonly beforeStartTurn?: (threadId: string) => Promise<void> | void;
	readonly afterStartTurn?: (threadId: string, turnId: string | undefined) => Promise<void> | void;
}

export async function handleThreadV1Request(
	options: ThreadV1RouteOptions,
	request: unknown,
): Promise<ThreadV1RouteResult> {
	if (!isThreadV1Request(request)) return { handled: false };
	switch (request.method) {
		case "thread.get":
			return { handled: true, result: getThreadV1(options.database, asThreadGetParams(request.params)) };
		case "thread.replay":
			return {
				handled: true,
				result: replayThreadV1({ database: options.database, params: asThreadReplayParams(request.params) }),
			};
		case "turn.start":
			return { handled: true, result: await startTurnV1(options, asTurnStartParams(request.params)) };
		case "turn.cancel":
			return { handled: true, result: await cancelTurnV1(options, asTurnCancelParams(request.params)) };
		case "payload.window":
			return { handled: true, result: getPayloadWindowV1(asPayloadWindowParams(request.params)) };
	}
}

export function getThreadV1(database: AppServerDatabase, params: protocolV1.ThreadGetParams): ThreadV1GetResult {
	return buildThreadV1Snapshot({ database, threadId: params.threadId });
}

export async function startTurnV1(
	options: ThreadV1RouteOptions,
	params: protocolV1.TurnStartParams,
): Promise<ThreadV1StartTurnResult> {
	await options.beforeStartTurn?.(params.threadId);
	const result = await options.authority.startTurn(params);
	projectRuntimeEvents(options.database);
	await options.afterStartTurn?.(params.threadId, result.turnId);
	const turn =
		findProjectedTurn(options.database, params.threadId, result.turnId) ??
		syntheticTurn(params.threadId, result.turnId ?? `turn:${Date.now()}`, "running", params.prompt);
	return { turn };
}

export async function cancelTurnV1(
	options: ThreadV1RouteOptions,
	params: protocolV1.TurnCancelParams,
): Promise<ThreadV1CancelTurnResult> {
	await options.authority.cancelTurn(params);
	projectRuntimeEvents(options.database);
	const turn =
		findProjectedTurn(options.database, params.threadId, params.turnId) ??
		syntheticTurn(params.threadId, params.turnId, "cancelled");
	return { turn: { ...turn, status: "cancelled", completedAt: turn.completedAt ?? new Date(0).toISOString() } };
}

export function getPayloadWindowV1(params: protocolV1.PayloadWindowParams): ThreadV1PayloadWindowResult {
	const cursors = {
		nextCursor: undefined,
		previousCursor: undefined,
		hasMoreAfter: false,
		hasMoreBefore: false,
	};
	if ("terminalId" in params)
		return { threadId: params.threadId, terminalId: params.terminalId, chunks: [], ...cursors };
	if ("diffId" in params) return { threadId: params.threadId, diffId: params.diffId, chunks: [], ...cursors };
	if ("toolCallId" in params)
		return { threadId: params.threadId, toolCallId: params.toolCallId, chunks: [], ...cursors };
	return { threadId: params.threadId, auditId: params.auditId, chunks: [], ...cursors };
}

export function notificationForThreadV1StoredEvent(event: StoredEvent):
	| {
			readonly kind: "notification";
			readonly method: "thread.timeline";
			readonly params: protocolV1.TimelineEntryNotification;
	  }
	| undefined {
	const entry = projectStoredEventToTimelineEntry(event);
	if (!entry) return undefined;
	return {
		kind: "notification",
		method: "thread.timeline",
		params: { threadId: entry.threadId, entry, nextCursor: { seq: entry.sequence } },
	};
}

function findProjectedTurn(
	database: AppServerDatabase,
	threadId: string,
	turnId: string | undefined,
): protocolV1.Turn | undefined {
	if (!turnId) return listThreadV1Turns({ database, threadId }).at(-1);
	return listThreadV1Turns({ database, threadId }).find((turn) => turn.turnId === turnId);
}

function syntheticTurn(
	threadId: string,
	turnId: string,
	status: protocolV1.TurnStatus,
	prompt?: string,
): protocolV1.Turn {
	const now = new Date(0).toISOString();
	return { threadId, turnId, status, prompt, createdAt: now, updatedAt: now };
}

function isThreadV1Request(value: unknown): value is ThreadV1Request {
	if (!value || typeof value !== "object") return false;
	const method = (value as { readonly method?: unknown }).method;
	return (
		method === "thread.get" ||
		method === "thread.replay" ||
		method === "turn.start" ||
		method === "turn.cancel" ||
		method === "payload.window"
	);
}

function asThreadGetParams(value: unknown): protocolV1.ThreadGetParams {
	const params = asRecord(value);
	return { threadId: requiredString(params, "threadId") };
}

function asThreadReplayParams(value: unknown): protocolV1.ThreadReplayParams {
	const params = asRecord(value);
	return {
		threadId: requiredString(params, "threadId"),
		after: asCursor(params.after),
		before: asCursor(params.before),
		direction: replayDirection(params.direction),
		limit: limit(params.limit),
	};
}

function asTurnStartParams(value: unknown): protocolV1.TurnStartParams {
	const params = asRecord(value);
	return {
		threadId: requiredString(params, "threadId"),
		prompt: requiredString(params, "prompt"),
		attachmentIds: stringArray(params.attachmentIds),
		filePaths: stringArray(params.filePaths),
		model: optionalString(params.model),
		effort: optionalString(params.effort),
		draftState: asOptionalRecord(params.draftState),
	};
}

function asTurnCancelParams(value: unknown): protocolV1.TurnCancelParams {
	const params = asRecord(value);
	return { threadId: requiredString(params, "threadId"), turnId: requiredString(params, "turnId") };
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

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requiredString(params: Readonly<Record<string, unknown>>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required v1 parameter: ${key}`);
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
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
