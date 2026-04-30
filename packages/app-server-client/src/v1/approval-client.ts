import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type ApprovalV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type ApprovalV1ListResult = protocolV1.ApprovalListResult;
export type ApprovalV1DecisionResult = protocolV1.ApprovalDecisionResult;
export type ApprovalV1AnswerInputResult = protocolV1.ApprovalAnswerInputResult;

export async function listApprovals(
	client: ApprovalV1RequestClient,
	params: protocolV1.ApprovalListParams,
): Promise<ApprovalV1ListResult> {
	return (await sendApprovalV1Request(client, "v1.approval.list", params)) as ApprovalV1ListResult;
}

export async function decideApproval(
	client: ApprovalV1RequestClient,
	params: protocolV1.ApprovalDecisionParams,
): Promise<ApprovalV1DecisionResult> {
	return (await sendApprovalV1Request(client, "v1.approval.decide", params)) as ApprovalV1DecisionResult;
}

export async function answerApprovalInput(
	client: ApprovalV1RequestClient,
	params: protocolV1.ApprovalAnswerInputParams,
): Promise<ApprovalV1AnswerInputResult> {
	return (await sendApprovalV1Request(client, "v1.approval.answer", params)) as ApprovalV1AnswerInputResult;
}

function sendApprovalV1Request(client: ApprovalV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
