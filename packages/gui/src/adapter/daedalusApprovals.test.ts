import { describe, expect, test, vi } from "vitest";
import { mapDaedalusApprovalToT3, respondToT3Approval } from "./daedalusApprovals";

describe("daedalusApprovals", () => {
	test("maps Daedalus approval requests to T3 pending approval records", () => {
		expect(
			mapDaedalusApprovalToT3({
				id: "approval-1",
				sessionId: "session-1",
				operation: "command",
				title: "Run command",
				detail: "bun test",
				createdAt: "2026-05-04T00:00:00.000Z",
			}),
		).toEqual({
			requestId: "approval-1",
			threadId: "session-1",
			title: "Run command",
			detail: "bun test",
			kind: "command",
			hardBlock: false,
			createdAt: "2026-05-04T00:00:00.000Z",
		});
	});

	test("preserves hardBlock as non-approvable and does not call approve", async () => {
		const client = { request: vi.fn() };
		const approval = mapDaedalusApprovalToT3({
			approvalId: "approval-hard",
			sessionId: "session-1",
			kind: "workspace-change",
			title: "Protected path change",
			hardBlock: true,
			createdAt: "2026-05-04T00:00:00.000Z",
		});

		expect(approval.hardBlock).toBe(true);
		await expect(
			respondToT3Approval(client as never, {
				requestId: approval.requestId,
				decision: "accept",
				hardBlock: approval.hardBlock,
			}),
		).resolves.toEqual({
			ok: false,
			disabledReason: "This approval is blocked by Daedalus safety policy and cannot be approved.",
		});
		expect(client.request).not.toHaveBeenCalled();
	});

	test("maps accept decline and cancel to approval/respond", async () => {
		const client = { request: vi.fn(async () => ({})) };
		await respondToT3Approval(client as never, { requestId: "approval-1", decision: "accept" });
		await respondToT3Approval(client as never, { requestId: "approval-2", decision: "decline" });
		await respondToT3Approval(client as never, { requestId: "approval-3", decision: "cancel" });

		expect(client.request).toHaveBeenNthCalledWith(1, "approval/respond", {
			approvalId: "approval-1",
			decision: "approved",
		});
		expect(client.request).toHaveBeenNthCalledWith(2, "approval/respond", {
			approvalId: "approval-2",
			decision: "denied",
		});
		expect(client.request).toHaveBeenNthCalledWith(3, "approval/respond", {
			approvalId: "approval-3",
			decision: "denied",
			message: "Cancelled from GUI",
		});
	});

	test("does not broaden acceptForSession when Daedalus lacks a matching supported scope", async () => {
		const client = { request: vi.fn() };
		await expect(
			respondToT3Approval(client as never, { requestId: "approval-session", decision: "acceptForSession" }),
		).resolves.toEqual({
			ok: false,
			disabledReason: "Daedalus does not support session-wide approval for this request.",
		});
		expect(client.request).not.toHaveBeenCalled();
	});
});
