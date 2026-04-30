import { describe, expect, test } from "bun:test";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { type ApprovalQueueState, createInitialApprovalQueueState } from "@daedalus-pi/gui-core/approval/reducer";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { ApprovalCard } from "./ApprovalCard";
import { ApprovalQueue } from "./ApprovalQueue";

type TestElement = {
	readonly type: unknown;
	readonly props: Record<string, unknown>;
};

function createRequest(input: Partial<protocolV1.ApprovalRequest> = {}): protocolV1.ApprovalRequest {
	return {
		approvalId: "approval-1",
		createdAt: "2026-04-30T12:00:00Z",
		kind: "command",
		question: "Approve running bun test?",
		status: "pending",
		summary: "Daedalus wants to run bun test for gui-components.",
		threadId: "thread-1",
		title: "Run package tests",
		turnId: "turn-1",
		workspaceTargetId: "workspace-1",
		...input,
	};
}

function stateWithRequest(
	request: protocolV1.ApprovalRequest,
	overrides: Partial<ApprovalQueueState> = {},
): ApprovalQueueState {
	return {
		...createInitialApprovalQueueState({ threadId: request.threadId, workspaceTargetId: request.workspaceTargetId }),
		requestOrder: [request.approvalId],
		requestsById: { [request.approvalId]: request },
		...overrides,
	};
}

function createFailure(request: protocolV1.ApprovalRequest): protocolV1.ApprovalFailure {
	return {
		approvalId: request.approvalId,
		code: "stale",
		currentStatus: "approved",
		message: "Approval was already handled.",
		ok: false,
		threadId: request.threadId,
		turnId: request.turnId,
		workspaceTargetId: request.workspaceTargetId,
	};
}

function isElement(value: unknown): value is TestElement {
	return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function collectElements(value: unknown): TestElement[] {
	if (Array.isArray(value)) return value.flatMap(collectElements);
	if (!isElement(value)) return [];
	return [value, ...collectElements(value.props.children)];
}

function findApprovalCardElement(value: unknown): TestElement {
	const card = collectElements(value).find((element) => element.type === ApprovalCard);
	if (!card) throw new Error("Expected an ApprovalCard element");
	return card;
}

describe("ApprovalQueue", () => {
	test("renders an empty T3-style queue", () => {
		const markup = renderMarkup(React.createElement(ApprovalQueue, { state: createInitialApprovalQueueState() }));

		expectMarkupContains(markup, [
			'aria-label="Approval queue"',
			'data-testid="approval-queue"',
			"Pending actions",
			"Approvals",
			"Queue clear",
			"0 pending",
			"No pending approvals",
		]);
		expect(markup).not.toContain('data-testid="approval-card"');
	});

	test("renders a pending approval card with status badge, summary, body, and actions", () => {
		const request = createRequest();
		const markup = renderMarkup(React.createElement(ApprovalQueue, { state: stateWithRequest(request) }));

		expectMarkupContains(markup, [
			'data-testid="approval-card"',
			'data-testid="approval-status"',
			'role="status"',
			"Pending",
			"Command",
			"Run package tests",
			"Daedalus wants to run bun test for gui-components.",
			"Approve running bun test?",
			"Approve",
			"Deny",
			"1 pending",
		]);
	});

	test("forwards approve and deny callbacks with the Protocol v1 approval id", () => {
		const request = createRequest();
		const approved: string[] = [];
		const denied: string[] = [];
		const rendered = ApprovalQueue({
			state: stateWithRequest(request),
			onApprove: (approvalId) => {
				approved.push(approvalId);
			},
			onDeny: (approvalId) => {
				denied.push(approvalId);
			},
		});
		const card = findApprovalCardElement(rendered);

		(card.props.onApprove as () => void)();
		(card.props.onDeny as () => void)();

		expect(approved).toEqual([request.approvalId]);
		expect(denied).toEqual([request.approvalId]);
	});

	test("renders a failure banner for a failed approval decision", () => {
		const request = createRequest();
		const failure = createFailure(request);
		const markup = renderMarkup(
			React.createElement(ApprovalQueue, {
				state: stateWithRequest(request, { failureById: { [request.approvalId]: failure } }),
			}),
		);

		expectMarkupContains(markup, [
			'data-testid="approval-failure"',
			'role="alert"',
			"Approval failed",
			"stale: Approval was already handled.",
		]);
	});

	test("disables approve and deny actions while a decision is pending", () => {
		const request = createRequest();
		const markup = renderMarkup(
			React.createElement(ApprovalQueue, {
				state: stateWithRequest(request, { pendingDecisionById: { [request.approvalId]: "approved" } }),
			}),
		);

		expectMarkupContains(markup, ["Decision pending", "Approving…", "Deny"]);
		expect(markup.match(/ disabled/g)?.length).toBe(2);
	});
});
