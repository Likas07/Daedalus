import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../../persistence/database";
import { projectRuntimeEvents } from "../../persistence/projector";
import {
	buildThreadV1Snapshot,
	listThreadV1Turns,
	replayThreadV1,
} from "../../projections/thread-v1-projection";
import type {
	ThreadV1CancelTurnResult,
	ThreadV1GetResult,
	ThreadV1ReplayResult,
	ThreadV1StartTurnResult,
	V1Request,
	V1RouteContext,
	V1RouteHandler,
} from "./router";

const THREAD_METHODS = new Set([
	"thread.create",
	"thread.list",
	"thread.resume",
	"thread.get",
	"thread.replay",
	"turn.start",
	"turn.cancel",
]);

export function createThreadV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => THREAD_METHODS.has(method),
		handle: async (request, context) => {
			const v1Request = asV1Request(request);
			switch (v1Request.method) {
				case "thread.create":
					if (!context.threads) throw new Error("Thread v1 create route is not configured");
					return context.threads.create(asThreadCreateParams(v1Request.params));
				case "thread.list":
					if (!context.threads) throw new Error("Thread v1 list route is not configured");
					return context.threads.list(asThreadListParams(v1Request.params));
				case "thread.resume":
					if (!context.threads) throw new Error("Thread v1 resume route is not configured");
					return context.threads.resume(asThreadResumeParams(v1Request.params));
				case "thread.get":
					return getThreadV1(context.database, asThreadGetParams(v1Request.params));
				case "thread.replay":
					return replayThreadV1({ database: context.database, params: asThreadReplayParams(v1Request.params) });
				case "turn.start":
					return startTurnV1(context, asTurnStartParams(v1Request.params));
				case "turn.cancel":
					return cancelTurnV1(context, asTurnCancelParams(v1Request.params));
				default:
					throw new Error(`Unsupported thread v1 method: ${v1Request.method}`);
			}
		},
	};
}

export function getThreadV1(database: AppServerDatabase, params: protocolV1.ThreadGetParams): ThreadV1GetResult {
	return buildThreadV1Snapshot({ database, threadId: params.threadId });
}

export async function startTurnV1(
	context: V1RouteContext,
	params: protocolV1.TurnStartParams,
): Promise<ThreadV1StartTurnResult> {
	const turnId = `turn-${crypto.randomUUID()}`;
	const attachmentIds = [...(params.attachmentIds ?? [])];
	for (const attachment of params.attachments ?? []) {
		if (!context.saveInlineAttachment) throw new Error("Inline attachments are not configured");
		attachmentIds.push(await context.saveInlineAttachment(attachment));
	}
	await context.beforeStartTurn?.(params.threadId, turnId);
	const result = await context.authority.startTurn({ ...params, turnId, attachmentIds });
	projectRuntimeEvents(context.database);
	await context.afterStartTurn?.(params.threadId, result.turnId);
	const turn =
		findProjectedTurn(context.database, params.threadId, result.turnId) ??
		syntheticTurn(params.threadId, result.turnId ?? `turn:${Date.now()}`, "running", params.prompt);
	return { turn };
}

export async function cancelTurnV1(
	context: V1RouteContext,
	params: protocolV1.TurnCancelParams,
): Promise<ThreadV1CancelTurnResult> {
	await context.authority.cancelTurn(params);
	projectRuntimeEvents(context.database);
	const turn =
		findProjectedTurn(context.database, params.threadId, params.turnId) ??
		syntheticTurn(params.threadId, params.turnId, "cancelled");
	return { turn: { ...turn, status: "cancelled", completedAt: turn.completedAt ?? new Date(0).toISOString() } };
}

function asV1Request(value: unknown): V1Request {
	if (!value || typeof value !== "object") throw new Error("Invalid v1 request");
	return value as V1Request;
}

function asThreadGetParams(value: unknown): protocolV1.ThreadGetParams {
	const params = asRecord(value);
	return { threadId: requiredString(params, "threadId") };
}

function asThreadCreateParams(value: unknown): protocolV1.ThreadCreateParams {
	const params = asRecord(value);
	return {
		projectId: requiredString(params, "projectId"),
		workspaceTargetId: requiredString(params, "workspaceTargetId"),
		title: optionalString(params.title),
		prompt: optionalString(params.prompt),
		model: optionalString(params.model),
		effort: optionalString(params.effort),
		draftState: asOptionalRecord(params.draftState),
	};
}

function asThreadListParams(value: unknown): protocolV1.ThreadListParams {
	const params = asRecord(value);
	return {
		projectId: requiredString(params, "projectId"),
		workspaceTargetId: optionalString(params.workspaceTargetId),
	};
}

function asThreadResumeParams(value: unknown): protocolV1.ThreadResumeParams {
	const params = asRecord(value);
	return {
		threadId: requiredString(params, "threadId"),
		prompt: optionalString(params.prompt),
		model: optionalString(params.model),
		effort: optionalString(params.effort),
		draftState: asOptionalRecord(params.draftState),
	};
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
		attachments: inlineAttachments(params.attachments),
		filePaths: stringArray(params.filePaths),
		model: optionalString(params.model),
		effort: optionalString(params.effort),
		draftState: asOptionalRecord(params.draftState),
	};
}

function inlineAttachments(value: unknown): protocolV1.TurnStartParams["attachments"] {
	if (!Array.isArray(value)) return undefined;
	return value
		.map((item) => asRecord(item))
		.filter((item) => item.type === "image" && typeof item.url === "string" && item.url.length > 0)
		.map((item) => ({ type: "image" as const, url: item.url as string }));
}

function asTurnCancelParams(value: unknown): protocolV1.TurnCancelParams {
	const params = asRecord(value);
	return { threadId: requiredString(params, "threadId"), turnId: requiredString(params, "turnId") };
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
