import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

export interface ApprovalQueueState {
	readonly threadId?: string;
	readonly workspaceTargetId?: string;
	readonly requestsById: Readonly<Record<string, protocolV1.ApprovalRequest>>;
	readonly requestOrder: readonly string[];
	readonly pendingDecisionById: Readonly<Record<string, protocolV1.ApprovalDecisionValue | "answer">>;
	readonly failureById: Readonly<Record<string, protocolV1.ApprovalFailure>>;
	readonly isLoading: boolean;
	readonly error?: string;
}

export type ApprovalQueueAction =
	| { readonly type: "approval.loading"; readonly threadId?: string; readonly workspaceTargetId?: string }
	| { readonly type: "approval.loaded"; readonly result: protocolV1.ApprovalListResult }
	| { readonly type: "approval.changed"; readonly request: protocolV1.ApprovalRequest }
	| {
			readonly type: "approval.decisionStarted";
			readonly approvalId: string;
			readonly decision: protocolV1.ApprovalDecisionValue | "answer";
	  }
	| {
			readonly type: "approval.decisionCompleted";
			readonly result: protocolV1.ApprovalDecisionSuccess | protocolV1.ApprovalAnswerSuccess;
	  }
	| { readonly type: "approval.failed"; readonly failure: protocolV1.ApprovalFailure }
	| { readonly type: "approval.error"; readonly error: string };

export function createInitialApprovalQueueState(
	input: { readonly threadId?: string; readonly workspaceTargetId?: string } = {},
): ApprovalQueueState {
	return {
		threadId: input.threadId,
		workspaceTargetId: input.workspaceTargetId,
		requestsById: {},
		requestOrder: [],
		pendingDecisionById: {},
		failureById: {},
		isLoading: false,
	};
}

export function approvalQueueReducer(
	state: ApprovalQueueState = createInitialApprovalQueueState(),
	action: ApprovalQueueAction,
): ApprovalQueueState {
	switch (action.type) {
		case "approval.loading":
			return {
				...state,
				threadId: action.threadId ?? state.threadId,
				workspaceTargetId: action.workspaceTargetId ?? state.workspaceTargetId,
				isLoading: true,
				error: undefined,
			};
		case "approval.loaded":
			return {
				...state,
				threadId: action.result.threadId,
				requestsById: requestsById(action.result.requests),
				requestOrder: sortedRequestOrder(action.result.requests),
				isLoading: false,
				error: undefined,
			};
		case "approval.changed":
			return upsertRequest(state, action.request);
		case "approval.decisionStarted":
			return {
				...state,
				pendingDecisionById: { ...state.pendingDecisionById, [action.approvalId]: action.decision },
				failureById: omitKey(state.failureById, action.approvalId),
			};
		case "approval.decisionCompleted":
			return {
				...upsertRequest(state, action.result.request),
				pendingDecisionById: omitKey(state.pendingDecisionById, action.result.request.approvalId),
				failureById: omitKey(state.failureById, action.result.request.approvalId),
			};
		case "approval.failed":
			return {
				...state,
				pendingDecisionById: omitKey(state.pendingDecisionById, action.failure.approvalId),
				failureById: { ...state.failureById, [action.failure.approvalId]: action.failure },
				error: action.failure.message,
				isLoading: false,
			};
		case "approval.error":
			return { ...state, error: action.error, isLoading: false };
	}
}

export function selectApprovalRequests(state: ApprovalQueueState): protocolV1.ApprovalRequest[] {
	return state.requestOrder.map((approvalId) => state.requestsById[approvalId]).filter(Boolean);
}

export function selectPendingApprovalRequests(state: ApprovalQueueState): protocolV1.ApprovalRequest[] {
	return selectApprovalRequests(state).filter((request) => request.status === "pending");
}

function upsertRequest(state: ApprovalQueueState, request: protocolV1.ApprovalRequest): ApprovalQueueState {
	if (state.threadId && request.threadId !== state.threadId) return state;
	if (state.workspaceTargetId && request.workspaceTargetId !== state.workspaceTargetId) return state;
	const requests = { ...state.requestsById, [request.approvalId]: request };
	const order = state.requestOrder.includes(request.approvalId)
		? state.requestOrder
		: [...state.requestOrder, request.approvalId];
	return {
		...state,
		requestsById: requests,
		requestOrder: [...order].sort(
			(left: string, right: string) =>
				requests[left]!.createdAt.localeCompare(requests[right]!.createdAt) || left.localeCompare(right),
		),
		error: undefined,
	};
}

function requestsById(
	requests: readonly protocolV1.ApprovalRequest[],
): Readonly<Record<string, protocolV1.ApprovalRequest>> {
	const next: Record<string, protocolV1.ApprovalRequest> = {};
	for (const request of requests) next[request.approvalId] = request;
	return next;
}

function sortedRequestOrder(requests: readonly protocolV1.ApprovalRequest[]): string[] {
	return [...requests]
		.sort(
			(left, right) =>
				left.createdAt.localeCompare(right.createdAt) || left.approvalId.localeCompare(right.approvalId),
		)
		.map((request) => request.approvalId);
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
	if (!(key in record)) return record;
	const next = { ...record };
	delete next[key];
	return next;
}
