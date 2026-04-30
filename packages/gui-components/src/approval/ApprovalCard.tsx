import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type ReactNode } from "react";
import { Badge, Button, StatusPill, type BadgeTone, type StatusPillTone } from "../ui";

export interface ApprovalCardProps {
	readonly request: protocolV1.ApprovalRequest;
	readonly pendingDecision?: protocolV1.ApprovalDecisionValue | "answer";
	readonly failure?: protocolV1.ApprovalFailure;
	readonly onApprove?: (request: protocolV1.ApprovalRequest) => void | Promise<void>;
	readonly onDeny?: (request: protocolV1.ApprovalRequest) => void | Promise<void>;
}

function formatProtocolLabel(value: string): string {
	return value
		.split("-")
		.map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
		.join(" ");
}

function trimOptional(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getStatusTone(status: protocolV1.ApprovalRequestStatus): StatusPillTone {
	switch (status) {
		case "approved":
			return "success";
		case "denied":
			return "danger";
		case "expired":
		case "cancelled":
			return "idle";
		case "pending":
			return "warning";
	}
}

function getKindTone(kind: protocolV1.ApprovalRequestKind): BadgeTone {
	switch (kind) {
		case "command":
			return "accent";
		case "tool":
		case "workspace-change":
			return "warning";
		case "checkpoint-restore":
			return "danger";
		case "answer-input":
			return "neutral";
	}
}

function pendingDecisionText(pendingDecision: ApprovalCardProps["pendingDecision"]): string | undefined {
	if (!pendingDecision) return undefined;
	if (pendingDecision === "approved") return "Approval decision pending";
	if (pendingDecision === "denied") return "Denial decision pending";
	return "Answer pending";
}

export function ApprovalCard({ request, pendingDecision, failure, onApprove, onDeny }: ApprovalCardProps): ReactNode {
	const title = request.title.trim() || "Approval needed";
	const summary = trimOptional(request.summary);
	const body = trimOptional(request.question);
	const disabled = Boolean(pendingDecision) || request.status !== "pending";
	const statusLabel = formatProtocolLabel(request.status);
	const kindLabel = formatProtocolLabel(request.kind);
	const pendingLabel = pendingDecisionText(pendingDecision);
	const approveLabel = pendingDecision === "approved" ? "Approving…" : "Approve";
	const denyLabel = pendingDecision === "denied" ? "Denying…" : "Deny";

	return React.createElement(
		"article",
		{
			className: `daedalus-approval-card daedalus-approval-card-${request.status} daedalus-pending-action-card`,
			"data-testid": "approval-card",
			"data-approval-id": request.approvalId,
		},
		React.createElement(
			"header",
			{ className: "daedalus-approval-card-header" },
			React.createElement(
				"div",
				{ className: "daedalus-approval-card-heading" },
				React.createElement("p", { className: "daedalus-approval-card-eyebrow" }, "Pending action"),
				React.createElement("h3", { className: "daedalus-approval-card-title" }, title),
			),
			React.createElement(
				StatusPill,
				{
					ariaLabel: `Approval status: ${request.status}`,
					testId: "approval-status",
					tone: getStatusTone(request.status),
				},
				statusLabel,
			),
		),
		React.createElement(
			"div",
			{ className: "daedalus-approval-card-meta" },
			React.createElement(Badge, { ariaLabel: `Approval kind: ${kindLabel}`, tone: getKindTone(request.kind) }, kindLabel),
			pendingLabel
				? React.createElement(Badge, { ariaLabel: pendingLabel, tone: "warning" }, "Decision pending")
				: null,
		),
		summary ? React.createElement("p", { className: "daedalus-approval-summary" }, summary) : null,
		body
			? React.createElement(
					"p",
					{ className: "daedalus-approval-body daedalus-approval-question" },
					body,
				)
			: null,
		failure
			? React.createElement(
					"div",
					{ className: "daedalus-approval-failure", role: "alert", "data-testid": "approval-failure" },
					React.createElement("strong", null, "Approval failed"),
					React.createElement("p", null, `${failure.code}: ${failure.message}`),
				)
			: null,
		React.createElement(
			"footer",
			{ className: "daedalus-approval-actions", "aria-label": `Actions for ${title}` },
			React.createElement(
				Button,
				{
					ariaLabel: `Approve ${title}`,
					disabled,
					onClick: () => void onApprove?.(request),
					tone: "primary",
				},
				approveLabel,
			),
			React.createElement(
				Button,
				{
					ariaLabel: `Deny ${title}`,
					disabled,
					onClick: () => void onDeny?.(request),
					tone: "danger",
				},
				denyLabel,
			),
		),
	);
}
