import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type ReactNode } from "react";

export interface ApprovalCardProps {
	readonly request: protocolV1.ApprovalRequest;
	readonly pendingDecision?: protocolV1.ApprovalDecisionValue | "answer";
	readonly failure?: protocolV1.ApprovalFailure;
	readonly onApprove?: (request: protocolV1.ApprovalRequest) => void | Promise<void>;
	readonly onDeny?: (request: protocolV1.ApprovalRequest) => void | Promise<void>;
}

export function ApprovalCard({ request, pendingDecision, failure, onApprove, onDeny }: ApprovalCardProps): ReactNode {
	const disabled = Boolean(pendingDecision) || request.status !== "pending";
	return React.createElement(
		"article",
		{
			className: `daedalus-approval-card daedalus-approval-card-${request.status}`,
			"data-testid": "approval-card",
			"data-approval-id": request.approvalId,
		},
		React.createElement(
			"header",
			{ className: "daedalus-approval-card-header" },
			React.createElement("strong", null, request.title),
			React.createElement("span", { "data-testid": "approval-status" }, request.status),
		),
		request.question ? React.createElement("p", { className: "daedalus-approval-question" }, request.question) : null,
		request.summary ? React.createElement("p", { className: "daedalus-approval-summary" }, request.summary) : null,
		failure
			? React.createElement(
					"p",
					{ className: "daedalus-approval-failure", role: "alert", "data-testid": "approval-failure" },
					`${failure.code}: ${failure.message}`,
				)
			: null,
		React.createElement(
			"footer",
			{ className: "daedalus-approval-actions" },
			React.createElement(
				"button",
				{ type: "button", disabled, onClick: () => void onApprove?.(request) },
				pendingDecision === "approved" ? "Approving…" : "Approve",
			),
			React.createElement(
				"button",
				{ type: "button", disabled, onClick: () => void onDeny?.(request) },
				pendingDecision === "denied" ? "Denying…" : "Deny",
			),
		),
	);
}
