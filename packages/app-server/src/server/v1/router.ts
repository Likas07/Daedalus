import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../../persistence/database";
import { createApprovalV1RouteHandler } from "./approval-routes";
import { createPayloadV1RouteHandler } from "./payload-routes";
import { createThreadV1RouteHandler } from "./thread-routes";
import { createTimelineV1RouteHandler } from "./timeline-routes";
import { createWorkspaceV1RouteHandler } from "./workspace-routes";

export interface V1RuntimeAuthority {
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

export interface V1RouteContext {
	readonly database: AppServerDatabase;
	readonly authority: V1RuntimeAuthority;
	readonly workspaceTargets?: {
		list(params: protocolV1.WorkspaceTargetListParams): Promise<protocolV1.WorkspaceTargetListResult>;
		validate(params: protocolV1.WorkspaceTargetValidateParams): Promise<protocolV1.WorkspaceTargetValidateResult>;
	};
	readonly threads?: {
		create(params: protocolV1.ThreadCreateParams): Promise<protocolV1.ThreadCreateResult>;
		list(params: protocolV1.ThreadListParams): Promise<protocolV1.ThreadListResult>;
		resume(params: protocolV1.ThreadResumeParams): Promise<protocolV1.ThreadResumeResult>;
	};
	readonly beforeStartTurn?: (threadId: string) => Promise<void> | void;
	readonly afterStartTurn?: (threadId: string, turnId: string | undefined) => Promise<void> | void;
}

export interface V1RouteHandler {
	canHandle(method: string): boolean;
	handle(request: unknown, context: V1RouteContext): Promise<unknown>;
}

export type V1Method =
	| "workspaceTarget.list"
	| "workspaceTarget.validate"
	| "thread.create"
	| "thread.list"
	| "thread.resume"
	| "thread.get"
	| "thread.replay"
	| "turn.start"
	| "turn.cancel"
	| "payload.window";

export interface V1Request {
	readonly kind?: "request";
	readonly id?: string | number;
	readonly method: V1Method;
	readonly params: unknown;
}

export interface V1RouteResult {
	readonly handled: boolean;
	readonly result?: unknown;
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

export class V1Router {
	constructor(private readonly handlers: readonly V1RouteHandler[]) {}

	canHandle(method: string): boolean {
		return this.handlers.some((handler) => handler.canHandle(method));
	}

	async handle(request: { readonly method: string }, context: V1RouteContext): Promise<unknown> {
		const handler = this.handlers.find((candidate) => candidate.canHandle(request.method));
		if (!handler) throw new Error(`Unsupported v1 method: ${request.method}`);
		return handler.handle(request, context);
	}
}

export function createDefaultV1Router(): V1Router {
	return new V1Router([
		createThreadV1RouteHandler(),
		createPayloadV1RouteHandler(),
		createTimelineV1RouteHandler(),
		createApprovalV1RouteHandler(),
		createWorkspaceV1RouteHandler(),
	]);
}

export async function handleV1Request(
	context: V1RouteContext,
	request: unknown,
	router = createDefaultV1Router(),
): Promise<V1RouteResult> {
	if (!isV1Request(request) || !router.canHandle(request.method)) return { handled: false };
	return { handled: true, result: await router.handle(request, context) };
}

function isV1Request(value: unknown): value is V1Request {
	if (!value || typeof value !== "object") return false;
	const method = (value as { readonly method?: unknown }).method;
	return typeof method === "string";
}
