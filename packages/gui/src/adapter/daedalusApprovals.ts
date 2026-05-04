import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { ApprovalRequestId, ProviderApprovalDecision } from "@t3tools/contracts";

export interface DaedalusApprovalRequest {
	readonly id?: string;
	readonly approvalId?: string;
	readonly sessionId?: string;
	readonly threadId?: string;
	readonly operation?: string;
	readonly kind?: string;
	readonly title?: string;
	readonly detail?: string;
	readonly summary?: string;
	readonly reason?: string;
	readonly request?: unknown;
	readonly hardBlock?: boolean;
	readonly createdAt: string;
}

export interface T3PendingApproval {
	readonly requestId: ApprovalRequestId;
	readonly threadId: string | null;
	readonly title: string;
	readonly detail?: string;
	readonly kind: string;
	readonly hardBlock: boolean;
	readonly createdAt: string;
}

export interface T3ApprovalDecisionInput {
	readonly requestId: ApprovalRequestId | string;
	readonly decision: ProviderApprovalDecision;
	readonly hardBlock?: boolean;
}

export type T3ApprovalDecisionResult = { readonly ok: true } | { readonly ok: false; readonly disabledReason: string };

function requestId(request: DaedalusApprovalRequest): string {
	return request.id ?? request.approvalId ?? "unknown";
}

function requestKind(request: DaedalusApprovalRequest): string {
	return request.operation ?? request.kind ?? "approval";
}

function requestDetail(request: DaedalusApprovalRequest): string | undefined {
	if (request.detail) return request.detail;
	if (request.summary) return request.summary;
	if (request.reason) return request.reason;
	if (typeof request.request === "string") return request.request;
	return undefined;
}

export function mapDaedalusApprovalToT3(request: DaedalusApprovalRequest): T3PendingApproval {
	const kind = requestKind(request);
	return {
		requestId: requestId(request) as ApprovalRequestId,
		threadId: request.sessionId ?? request.threadId ?? null,
		title: request.title ?? kind,
		...(requestDetail(request) ? { detail: requestDetail(request) } : {}),
		kind,
		hardBlock: request.hardBlock === true,
		createdAt: request.createdAt,
	};
}

export async function respondToT3Approval(
	client: AppServerClient,
	input: T3ApprovalDecisionInput,
): Promise<T3ApprovalDecisionResult> {
	if (input.hardBlock === true && (input.decision === "accept" || input.decision === "acceptForSession")) {
		return {
			ok: false,
			disabledReason: "This approval is blocked by Daedalus safety policy and cannot be approved.",
		};
	}
	if (input.decision === "acceptForSession") {
		return { ok: false, disabledReason: "Daedalus does not support session-wide approval for this request." };
	}

	await client.request("approval/respond", {
		approvalId: input.requestId,
		decision: input.decision === "accept" ? "approved" : "denied",
		...(input.decision === "cancel" ? { message: "Cancelled from GUI" } : {}),
	} as never);
	return { ok: true };
}
