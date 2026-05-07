import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type ThreadV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export interface ThreadV1GetResult {
	readonly thread: protocolV1.Thread;
	readonly turns: readonly protocolV1.Turn[];
	readonly timeline: protocolV1.TimelineWindowResult;
}

export type ThreadV1CreateResult = protocolV1.ThreadCreateResult;
export type ThreadV1ListResult = protocolV1.ThreadListResult;
export type ThreadV1ReplayResult = protocolV1.TimelineWindowResult;
export type ThreadV1StartTurnResult = protocolV1.TurnStartResult;
export type ThreadV1CancelTurnResult = protocolV1.TurnCancelResult;
export type ThreadV1PayloadWindowResult = protocolV1.PayloadWindowResult;

export async function createThread(
	client: ThreadV1RequestClient,
	params: protocolV1.ThreadCreateParams,
): Promise<ThreadV1CreateResult> {
	return (await sendThreadV1Request(client, "thread.create", params)) as ThreadV1CreateResult;
}

export async function listThreads(
	client: ThreadV1RequestClient,
	params: protocolV1.ThreadListParams,
): Promise<ThreadV1ListResult> {
	return (await sendThreadV1Request(client, "thread.list", params)) as ThreadV1ListResult;
}

export async function getThread(
	client: ThreadV1RequestClient,
	params: protocolV1.ThreadGetParams,
): Promise<ThreadV1GetResult> {
	return (await sendThreadV1Request(client, "thread.get", params)) as ThreadV1GetResult;
}

export async function replayThread(
	client: ThreadV1RequestClient,
	params: protocolV1.ThreadReplayParams,
): Promise<ThreadV1ReplayResult> {
	return (await sendThreadV1Request(client, "thread.replay", params)) as ThreadV1ReplayResult;
}

export async function startTurn(
	client: ThreadV1RequestClient,
	params: protocolV1.TurnStartParams,
): Promise<ThreadV1StartTurnResult> {
	return (await sendThreadV1Request(client, "turn.start", params)) as ThreadV1StartTurnResult;
}

export async function cancelTurn(
	client: ThreadV1RequestClient,
	params: protocolV1.TurnCancelParams,
): Promise<ThreadV1CancelTurnResult> {
	return (await sendThreadV1Request(client, "turn.cancel", params)) as ThreadV1CancelTurnResult;
}

export async function getPayloadWindow(
	client: ThreadV1RequestClient,
	params: protocolV1.PayloadWindowParams,
): Promise<ThreadV1PayloadWindowResult> {
	return (await sendThreadV1Request(client, "payload.window", params)) as ThreadV1PayloadWindowResult;
}

function sendThreadV1Request(client: ThreadV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
