import type { AppEvent, protocolV1 } from "@daedalus-pi/app-server-protocol";
import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { type ApprovalReadModel, listActiveApprovals } from "../persistence/read-model";
import type { AccessPolicyService } from "./access-policy-service";

export interface ApprovalRequestInput {
	readonly id?: string;
	readonly sessionId?: string;
	readonly request: unknown;
	readonly hardBlock?: boolean;
}

export interface ApprovalRequestedNotification {
	readonly kind: "notification";
	readonly method: "approval.requested" | "user-input.requested";
	readonly params: {
		readonly requestId: string;
		readonly approvalId: string;
		readonly threadId: string;
		readonly turnId: string;
		readonly workspaceTargetId: string;
		readonly requestKind: string;
		readonly request: unknown;
		readonly title?: string;
		readonly summary?: string;
		readonly question?: string;
	};
}

export interface ApprovalDecision {
	readonly approvalId: string;
	readonly decision: "approved" | "denied";
	readonly reason?: string;
	readonly message?: string;
}

export class ApprovalService {
	private static readonly MAX_IDEMPOTENCY_CACHE_SIZE = 10_000;
	private readonly waiters = new Map<
		string,
		{
			resolve: (decision: ApprovalDecision) => void;
			reject: (error: Error) => void;
			timer?: Timer;
		}
	>();
	private readonly idempotentV1Results = new Map<
		string,
		protocolV1.ApprovalDecisionResult | protocolV1.ApprovalAnswerInputResult
	>();

	constructor(
		private readonly database: AppServerDatabase,
		private readonly accessPolicy: AccessPolicyService,
		private readonly publish?: (message: AppEvent | ApprovalRequestedNotification) => void,
	) {}

	list(sessionId?: string): unknown[] {
		return listActiveApprovals(this.database, sessionId);
	}

	listV1(params: protocolV1.ApprovalListParams): protocolV1.ApprovalListResult {
		return {
			threadId: params.threadId,
			requests: listActiveApprovals(this.database, params.threadId)
				.map((approval) => this.toV1Request(approval, params))
				.filter((request) => !params.status || request.status === params.status),
		};
	}

	decideV1(params: protocolV1.ApprovalDecisionParams): protocolV1.ApprovalDecisionResult {
		const idempotencyKey = this.v1IdempotencyKey("decide", params);
		const existing = idempotencyKey ? this.idempotentV1Results.get(idempotencyKey) : undefined;
		if (existing) return existing as protocolV1.ApprovalDecisionResult;
		const row = this.readApproval(params.approvalId);
		const failure = this.validateV1Decision(row, params);
		if (failure) return failure;
		const decidedAt = new Date().toISOString();
		this.resolve({
			approvalId: params.approvalId,
			decision: params.decision,
			message: params.message,
		});
		const request = row
			? this.toV1Request({ ...row, status: params.decision, updatedAt: decidedAt }, params)
			: undefined;
		const result = {
			ok: true,
			request: request!,
			decision: {
				approvalId: params.approvalId,
				threadId: params.threadId,
				turnId: params.turnId,
				workspaceTargetId: params.workspaceTargetId,
				decision: params.decision,
				message: params.message,
				decidedAt,
			},
		} satisfies protocolV1.ApprovalDecisionResult;
		if (idempotencyKey) this.cacheIdempotentV1Result(idempotencyKey, result);
		return result;
	}

	answerInputV1(params: protocolV1.ApprovalAnswerInputParams): protocolV1.ApprovalAnswerInputResult {
		const idempotencyKey = this.v1IdempotencyKey("answer", params);
		const existing = idempotencyKey ? this.idempotentV1Results.get(idempotencyKey) : undefined;
		if (existing) return existing as protocolV1.ApprovalAnswerInputResult;
		const row = this.readApproval(params.approvalId);
		const failure = this.validateV1Decision(row, {
			...params,
			decision: "approved",
		});
		if (failure) return failure;
		const answer = approvalAnswer(params);
		if (answer === undefined) {
			throw new Error("Approval answer requires answer or answers.");
		}
		const answeredAt = new Date().toISOString();
		this.resolve({
			approvalId: params.approvalId,
			decision: "approved",
			message: answer,
		});
		const request = row ? this.toV1Request({ ...row, status: "approved", updatedAt: answeredAt }, params) : undefined;
		const result = {
			ok: true,
			request: request!,
			answer: {
				approvalId: params.approvalId,
				threadId: params.threadId,
				turnId: params.turnId,
				workspaceTargetId: params.workspaceTargetId,
				answer,
				...(params.answers ? { answers: params.answers } : {}),
				answeredAt,
			},
		} satisfies protocolV1.ApprovalAnswerInputResult;
		if (idempotencyKey) this.cacheIdempotentV1Result(idempotencyKey, result);
		return result;
	}

	request(input: ApprovalRequestInput): {
		approvalId: string;
		autoApproved: boolean;
	} {
		const approvalId = input.id ?? `approval-${crypto.randomUUID()}`;
		const request =
			input.request && typeof input.request === "object"
				? (input.request as Record<string, unknown>)
				: { value: input.request };
		const payload = {
			approvalId,
			sessionId: input.sessionId,
			...request,
			request,
			hardBlock: input.hardBlock === true,
		};
		appendEvent(this.database, {
			streamId: input.sessionId ?? "app",
			type: "approval/requested",
			payload: payload as EventPayload,
		});
		projectRuntimeEvents(this.database);
		const appEvent = {
			id: approvalId,
			type: "approval/requested",
			ts: new Date().toISOString(),
			sessionId: input.sessionId,
			payload,
		} as unknown as AppEvent;
		this.publish?.(appEvent);
		const liveNotification = approvalRequestedNotification(payload);
		if (liveNotification) this.publish?.(liveNotification);
		if (this.accessPolicy.getPolicy().mode === "unrestricted" && input.hardBlock !== true) {
			this.resolve({
				approvalId,
				decision: "approved",
				reason: "auto-approved by Unrestricted mode",
			});
			this.accessPolicy.auditAutoApproved(approvalId);
			return { approvalId, autoApproved: true };
		}
		return { approvalId, autoApproved: false };
	}

	waitForDecision(
		approvalId: string,
		options: { timeoutMs?: number; signal?: AbortSignal } = {},
	): Promise<ApprovalDecision> {
		if (options.signal?.aborted) return Promise.reject(new Error("Approval wait was cancelled."));
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, timer: undefined as Timer | undefined };
			const cleanup = () => {
				if (waiter.timer) clearTimeout(waiter.timer);
				options.signal?.removeEventListener("abort", onAbort);
				this.waiters.delete(approvalId);
			};
			const onAbort = () => {
				cleanup();
				reject(new Error("Approval wait was cancelled."));
			};
			waiter.resolve = (decision) => {
				cleanup();
				resolve(decision);
			};
			waiter.reject = (error) => {
				cleanup();
				reject(error);
			};
			if (options.timeoutMs && options.timeoutMs > 0)
				waiter.timer = setTimeout(() => waiter.reject(new Error("Approval timed out.")), options.timeoutMs);
			options.signal?.addEventListener("abort", onAbort, { once: true });
			this.waiters.set(approvalId, waiter);
		});
	}

	resolve(input: ApprovalDecision): void {
		const event = {
			type: "approval/resolved",
			approvalId: input.approvalId,
			status: input.decision,
			decision: input.decision,
			response: {
				decision: input.decision,
				message: input.message,
				reason: input.reason,
			},
			reason: input.reason ?? input.message,
			ts: new Date().toISOString(),
		} as unknown as AppEvent;
		appendEvent(this.database, {
			streamId: "app",
			type: "approval/resolved",
			payload: event as unknown as EventPayload,
		});
		projectRuntimeEvents(this.database);
		this.waiters.get(input.approvalId)?.resolve(input);
		this.publish?.(event);
	}

	cancel(approvalId: string, reason = "Approval was cancelled."): void {
		this.resolve({ approvalId, decision: "denied", reason });
	}

	private validateV1Decision(
		row: ApprovalReadModel | undefined,
		params: protocolV1.ApprovalDecisionParams,
	): protocolV1.ApprovalFailure | undefined {
		if (!row) return this.failure(params, "not-found", `Approval ${params.approvalId} was not found.`);
		const request = parseRecord(row.request);
		const requestThreadId = row.sessionId ?? stringValue(request.threadId) ?? stringValue(request.sessionId);
		if (requestThreadId && requestThreadId !== params.threadId)
			return this.failure(params, "wrong-thread", `Approval ${params.approvalId} belongs to another thread.`, row, {
				requestThreadId,
			});
		const requestTurnId = stringValue(request.turnId);
		if (requestTurnId && requestTurnId !== params.turnId)
			return this.failure(params, "wrong-turn", `Approval ${params.approvalId} belongs to another turn.`, row);
		const requestWorkspaceTargetId = stringValue(request.workspaceTargetId);
		if (requestWorkspaceTargetId && requestWorkspaceTargetId !== params.workspaceTargetId)
			return this.failure(
				params,
				"wrong-workspace-target",
				`Approval ${params.approvalId} belongs to another workspace target.`,
				row,
			);
		const status = mapApprovalStatus(row.status);
		if (status === "expired")
			return this.failure(params, "expired", `Approval ${params.approvalId} has expired.`, row);
		if (status !== "pending")
			return this.failure(params, "duplicate", `Approval ${params.approvalId} was already ${status}.`, row);
		const expiresAt = stringValue(request.expiresAt);
		if (expiresAt && Date.parse(expiresAt) < Date.now())
			return this.failure(params, "expired", `Approval ${params.approvalId} has expired.`, row);
		return undefined;
	}

	private failure(
		params: protocolV1.ApprovalDecisionParams,
		code: protocolV1.ApprovalFailureCode,
		message: string,
		row?: ApprovalReadModel,
		extra: Partial<protocolV1.ApprovalFailure> = {},
	): protocolV1.ApprovalFailure {
		return {
			ok: false,
			code,
			approvalId: params.approvalId,
			threadId: params.threadId,
			turnId: params.turnId,
			workspaceTargetId: params.workspaceTargetId,
			message,
			currentStatus: row ? mapApprovalStatus(row.status) : undefined,
			...extra,
		};
	}

	private readApproval(approvalId: string): ApprovalReadModel | undefined {
		const row = this.database
			.query<
				{
					id: string;
					session_id: string | null;
					status: string;
					request: string;
					response: string | null;
					created_at: string;
					updated_at: string;
				},
				[string]
			>("SELECT * FROM approvals WHERE id = ? LIMIT 1")
			.get(approvalId);
		if (!row) return undefined;
		return {
			id: row.id,
			sessionId: row.session_id,
			status: row.status,
			request: row.request,
			response: row.response,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private v1IdempotencyKey(
		operation: "decide" | "answer",
		params: {
			readonly approvalId: string;
			readonly threadId: string;
			readonly idempotencyKey?: string;
		},
	): string | undefined {
		return params.idempotencyKey
			? `${operation}:${params.threadId}:${params.approvalId}:${params.idempotencyKey}`
			: undefined;
	}

	private cacheIdempotentV1Result(
		key: string,
		result: protocolV1.ApprovalDecisionResult | protocolV1.ApprovalAnswerInputResult,
	): void {
		if (!this.idempotentV1Results.has(key)) {
			while (this.idempotentV1Results.size >= ApprovalService.MAX_IDEMPOTENCY_CACHE_SIZE) {
				const oldest = this.idempotentV1Results.keys().next().value;
				if (oldest === undefined) break;
				this.idempotentV1Results.delete(oldest);
			}
		}
		this.idempotentV1Results.set(key, result);
	}

	private toV1Request(
		approval: ApprovalReadModel,
		params: Pick<protocolV1.ApprovalListParams, "threadId" | "workspaceTargetId"> & { readonly turnId?: string },
	): protocolV1.ApprovalRequest {
		const request = parseRecord(approval.request);
		return {
			approvalId: approval.id,
			threadId: approval.sessionId ?? params.threadId,
			turnId: stringValue(request.turnId) ?? params.turnId ?? `turn:${approval.id}`,
			workspaceTargetId: stringValue(request.workspaceTargetId) ?? params.workspaceTargetId,
			kind: approvalKind(request.kind),
			status: mapApprovalStatus(approval.status),
			title: stringValue(request.title) ?? approvalTitle(request),
			summary: stringValue(request.summary) ?? approval.request,
			question: stringValue(request.question),
			createdAt: approval.createdAt,
			expiresAt: stringValue(request.expiresAt),
			updatedAt: approval.updatedAt,
		};
	}
}

function approvalRequestedNotification(payload: Record<string, unknown>): ApprovalRequestedNotification | undefined {
	const approvalId = stringValue(payload.approvalId);
	const threadId = stringValue(payload.sessionId) ?? stringValue(payload.threadId);
	const turnId = stringValue(payload.turnId);
	const workspaceTargetId = stringValue(payload.workspaceTargetId);
	if (!approvalId || !threadId || !turnId || !workspaceTargetId) return undefined;
	const request =
		payload.request && typeof payload.request === "object" ? (payload.request as Record<string, unknown>) : {};
	const requestKind =
		stringValue(payload.requestKind) ??
		stringValue(payload.kind) ??
		stringValue(payload.type) ??
		stringValue(request.kind) ??
		stringValue(request.type) ??
		"approval";
	const method = requestKind === "answer-input" ? "user-input.requested" : "approval.requested";
	return {
		kind: "notification",
		method,
		params: {
			requestId: approvalId,
			approvalId,
			threadId,
			turnId,
			workspaceTargetId,
			requestKind,
			request,
			...(stringValue(payload.title) ? { title: stringValue(payload.title) } : {}),
			...(stringValue(payload.summary) ? { summary: stringValue(payload.summary) } : {}),
			...(stringValue(payload.question) ? { question: stringValue(payload.question) } : {}),
		},
	};
}

function parseRecord(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return { summary: value };
	}
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function approvalAnswer(params: protocolV1.ApprovalAnswerInputParams): string | undefined {
	if (params.answers && typeof params.answers === "object") return JSON.stringify(params.answers);
	if (typeof params.answer === "string" && params.answer.length > 0) return params.answer;
	return undefined;
}

function approvalKind(value: unknown): protocolV1.ApprovalRequestKind {
	if (value === "tool" || value === "workspace-change" || value === "checkpoint-restore" || value === "answer-input")
		return value;
	return "command";
}

function mapApprovalStatus(value: string): protocolV1.ApprovalRequestStatus {
	if (value === "approved" || value === "denied" || value === "expired" || value === "cancelled") return value;
	return "pending";
}

function approvalTitle(request: Record<string, unknown>): string {
	return (
		stringValue(request.command) ??
		stringValue(request.toolName) ??
		stringValue(request.summary) ??
		"Approval required"
	);
}
