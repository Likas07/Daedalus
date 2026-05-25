import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { V1RouteHandler } from "./router";

const APPROVAL_METHODS = new Set(["v1.approval.list", "v1.approval.decide", "v1.approval.answer"]);

export function createApprovalV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => APPROVAL_METHODS.has(method),
		handle: async (request, context) => {
			if (!context.approvals) throw new Error("Approval v1 routes are not configured");
			const v1Request = request as { readonly method?: unknown; readonly params?: unknown };
			switch (v1Request.method) {
				case "v1.approval.list":
					return context.approvals.list(v1Request.params as protocolV1.ApprovalListParams);
				case "v1.approval.decide":
					return context.approvals.decide(v1Request.params as protocolV1.ApprovalDecisionParams);
				case "v1.approval.answer":
					return context.approvals.answer(normalizeApprovalAnswerParams(v1Request.params));
				default:
					throw new Error(`Unsupported approval v1 request: ${String(v1Request.method)}`);
			}
		},
	};
}

function normalizeApprovalAnswerParams(value: unknown): protocolV1.ApprovalAnswerInputParams {
	const params = value as protocolV1.ApprovalAnswerInputParams & { readonly answer?: unknown };
	if (typeof params.answer === "string" || params.answers) return params;
	const message = (params as unknown as { readonly message?: unknown }).message;
	return {
		...params,
		answer: typeof message === "string" ? message : "",
	};
}
