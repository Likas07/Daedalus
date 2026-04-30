import { describe, expect, test } from "bun:test";
import {
	decideApproval,
	getDiffFileWindow,
	getDiffSummary,
	openTerminal,
	replayTerminalOutput,
} from "@daedalus-pi/app-server-client";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

const scope = {
	threadId: "thread-smoke",
	turnId: "turn-smoke",
	workspaceTargetId: "base:project-smoke",
	checkpointId: "checkpoint-smoke",
};

class SmokeClient {
	readonly methods: string[] = [];
	async request(method: string, params: unknown): Promise<unknown> {
		this.methods.push(method);
		if (method === "v1.approval.decide") {
			const input = params as protocolV1.ApprovalDecisionParams;
			if (input.threadId !== scope.threadId)
				return failureApproval("wrong-thread", input, "Approval belongs to a different thread");
			return failureApproval("stale", input, "Approval is no longer pending");
		}
		if (method === "v1.diff.summary") {
			const input = params as protocolV1.DiffSummaryParams;
			if (input.workspaceTargetId !== scope.workspaceTargetId)
				return failureDiff(input, "target-mismatch", "Wrong target");
			return { ok: true, summary: largeDiffSummary(input) } satisfies protocolV1.DiffSummaryResult;
		}
		if (method === "v1.diff.fileWindow") {
			const input = params as protocolV1.DiffFileWindowParams;
			return {
				ok: true,
				window: {
					diffId: input.diffId,
					workspaceTargetId: input.workspaceTargetId,
					threadId: input.threadId,
					turnId: input.turnId,
					checkpointId: input.checkpointId,
					filePath: input.filePath,
					status: "modified",
					isBinary: false,
					isLarge: true,
					byteLength: 180_000,
					chunks: [
						{
							cursor: { seq: 1 },
							oldStart: 1,
							oldLines: 1,
							newStart: 1,
							newLines: 1,
							text: "@@ smoke",
							byteLength: 8,
						},
					],
					nextCursor: { seq: 1 },
					hasMoreAfter: true,
					hasMoreBefore: false,
				},
			} satisfies protocolV1.DiffFileWindowResult;
		}
		if (method === "v1.terminal.open")
			return failureTerminal(params as protocolV1.TerminalOpenParams, "command-blocked", "Guard blocked terminal");
		if (method === "v1.terminal.replay") return terminalReplay(params as protocolV1.TerminalReplayParams);
		throw new Error(`Unexpected smoke method ${method}`);
	}
}

describe("React Phase 3 thread surfaces smoke", () => {
	test("routes approvals, diffs, and terminal operations through Protocol v1 methods", async () => {
		const client = new SmokeClient();
		expect(await decideApproval(client, { approvalId: "approval-1", ...scope, decision: "approved" })).toMatchObject({
			ok: false,
			code: "stale",
		});
		expect(
			await decideApproval(client, {
				approvalId: "approval-2",
				...scope,
				threadId: "wrong-thread",
				decision: "denied",
			}),
		).toMatchObject({
			ok: false,
			code: "wrong-thread",
		});
		expect(await getDiffSummary(client, { ...scope, workspaceTargetId: "base:other" })).toMatchObject({
			ok: false,
			code: "target-mismatch",
		});
		const summary = await getDiffSummary(client, scope);
		expect(summary).toMatchObject({ ok: true, summary: { isLarge: true } });
		if (!summary.ok) throw new Error("expected summary");
		expect(
			await getDiffFileWindow(client, {
				...scope,
				diffId: summary.summary.diffId,
				filePath: "large.ts",
				limit: 25,
			}),
		).toMatchObject({ ok: true, window: { isLarge: true, hasMoreAfter: true } });
		expect(
			await openTerminal(client, {
				threadId: scope.threadId,
				turnId: scope.turnId,
				workspaceTargetId: scope.workspaceTargetId,
				route: "workspace-shell",
				rows: 24,
				cols: 80,
			}),
		).toMatchObject({ ok: false, code: "command-blocked" });
		expect(
			await replayTerminalOutput(client, {
				terminalId: "terminal-1",
				threadId: scope.threadId,
				turnId: scope.turnId,
				workspaceTargetId: scope.workspaceTargetId,
				limit: 100,
			}),
		).toMatchObject({ ok: true, chunks: [{ text: "reconnected output" }] });
		expect(client.methods).toEqual([
			"v1.approval.decide",
			"v1.approval.decide",
			"v1.diff.summary",
			"v1.diff.summary",
			"v1.diff.fileWindow",
			"v1.terminal.open",
			"v1.terminal.replay",
		]);
	});
});

function failureApproval(
	code: protocolV1.ApprovalFailureCode,
	params: protocolV1.ApprovalDecisionParams,
	message: string,
): protocolV1.ApprovalFailure {
	return {
		ok: false,
		code,
		approvalId: params.approvalId,
		threadId: params.threadId,
		turnId: params.turnId,
		workspaceTargetId: params.workspaceTargetId,
		message,
	};
}

function failureDiff(
	params: protocolV1.DiffSummaryParams,
	code: protocolV1.DiffFailureCode,
	message: string,
): protocolV1.DiffFailure {
	return {
		ok: false,
		code,
		threadId: params.threadId,
		turnId: params.turnId,
		workspaceTargetId: params.workspaceTargetId,
		checkpointId: params.checkpointId,
		message,
	};
}

function failureTerminal(
	params: protocolV1.TerminalOpenParams,
	code: protocolV1.TerminalErrorCode,
	message: string,
): protocolV1.TerminalFailure {
	return {
		ok: false,
		code,
		threadId: params.threadId,
		turnId: params.turnId,
		workspaceTargetId: params.workspaceTargetId,
		message,
	};
}

function largeDiffSummary(params: protocolV1.DiffSummaryParams): protocolV1.DiffSummary {
	return {
		diffId: "diff-smoke",
		workspaceTargetId: params.workspaceTargetId,
		threadId: params.threadId,
		turnId: params.turnId,
		checkpointId: params.checkpointId,
		status: "large",
		title: "Large smoke diff",
		createdAt: "2026-04-30T00:00:00.000Z",
		filesChanged: 1,
		insertions: 5000,
		deletions: 20,
		totalBytes: 180_000,
		isLarge: true,
		omittedFileCount: 0,
		files: [
			{
				path: "large.ts",
				status: "modified",
				insertions: 5000,
				deletions: 20,
				hunks: 100,
				byteLength: 180_000,
				isBinary: false,
				isLarge: true,
			},
		],
	};
}

function terminalReplay(params: protocolV1.TerminalReplayParams): protocolV1.TerminalReplayResult {
	return {
		ok: true,
		context: {
			terminalId: params.terminalId,
			threadId: params.threadId,
			turnId: params.turnId,
			workspaceTargetId: params.workspaceTargetId,
			title: "Terminal",
			status: "running",
			cwd: "/repo",
			rows: 24,
			cols: 80,
			createdAt: "2026-04-30T00:00:00.000Z",
			updatedAt: "2026-04-30T00:00:01.000Z",
		},
		chunks: [{ cursor: { seq: 1 }, text: "reconnected output", byteLength: 18 }],
		watermark: { seq: 1 },
		hasMoreAfter: false,
		hasMoreBefore: false,
	};
}
