import type { ApprovalQueueState } from "@daedalus-pi/gui-core/approval/reducer";
import { selectApprovalRequests } from "@daedalus-pi/gui-core/approval/reducer";
import React, { type ReactNode } from "react";
import { ApprovalCard } from "./ApprovalCard";

export interface ApprovalQueueProps {
	readonly state: ApprovalQueueState;
	readonly onApprove?: (approvalId: string) => void | Promise<void>;
	readonly onDeny?: (approvalId: string) => void | Promise<void>;
}

export function ApprovalQueue({ state, onApprove, onDeny }: ApprovalQueueProps): ReactNode {
	const requests = selectApprovalRequests(state);
	return React.createElement(
		"section",
		{ className: "daedalus-approval-queue", "aria-label": "Approval queue", "data-testid": "approval-queue" },
		React.createElement("h2", null, "Approvals"),
		state.isLoading ? React.createElement("p", null, "Loading approvals…") : null,
		state.error ? React.createElement("p", { role: "alert" }, state.error) : null,
		requests.length === 0 && !state.isLoading ? React.createElement("p", null, "No pending approvals") : null,
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
