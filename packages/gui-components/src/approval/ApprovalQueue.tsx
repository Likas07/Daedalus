import type { ApprovalQueueState } from "@daedalus-pi/gui-core/approval/reducer";
import { selectApprovalRequests } from "@daedalus-pi/gui-core/approval/reducer";
import React, { type ReactNode } from "react";
import { Badge } from "../ui";
import { ApprovalCard } from "./ApprovalCard";

export interface ApprovalQueueProps {
	readonly state: ApprovalQueueState;
	readonly onApprove?: (approvalId: string) => void | Promise<void>;
	readonly onDeny?: (approvalId: string) => void | Promise<void>;
}

function formatPendingCount(count: number): string {
	return `${count} pending`;
}

function formatQueueSummary(isLoading: boolean, pendingCount: number): string {
	if (isLoading) return "Syncing pending actions…";
	if (pendingCount === 0) return "Queue clear";
	return `${pendingCount} pending action${pendingCount === 1 ? "" : "s"}`;
}

export function ApprovalQueue({ state, onApprove, onDeny }: ApprovalQueueProps): ReactNode {
	const requests = selectApprovalRequests(state);
	const pendingCount = requests.filter((request) => request.status === "pending").length;
	return React.createElement(
		"section",
		{ className: "daedalus-approval-queue", "aria-label": "Approval queue", "data-testid": "approval-queue" },
		React.createElement(
			"header",
			{ className: "daedalus-approval-queue-header" },
			React.createElement(
				"div",
				{ className: "daedalus-approval-queue-heading" },
				React.createElement("p", { className: "daedalus-approval-queue-kicker" }, "Pending actions"),
				React.createElement("h2", null, "Approvals"),
				React.createElement(
					"p",
					{ className: "daedalus-approval-queue-summary" },
					formatQueueSummary(state.isLoading, pendingCount),
				),
			),
			React.createElement(
				Badge,
				{
					ariaLabel: `Pending approvals: ${pendingCount}`,
					tone: pendingCount > 0 ? "warning" : "neutral",
				},
				formatPendingCount(pendingCount),
			),
		),
		state.isLoading ? React.createElement("p", null, "Loading approvals…") : null,
		state.error ? React.createElement("p", { className: "daedalus-approval-failure", role: "alert" }, state.error) : null,
		requests.length === 0 && !state.isLoading
			? React.createElement("p", { className: "daedalus-approval-empty" }, "No pending approvals")
			: null,
		requests.map((request) =>
			React.createElement(ApprovalCard, {
				key: request.approvalId,
				request,
				pendingDecision: state.pendingDecisionById[request.approvalId],
				failure: state.failureById[request.approvalId],
				onApprove: () => void onApprove?.(request.approvalId),
				onDeny: () => void onDeny?.(request.approvalId),
			}),
		),
	);
}
