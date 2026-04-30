import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { ProtocolV1Phase3AppEventPayloadSchema } from "../events";
import { ProtocolV1Phase3ClientRequestSchema, ProtocolV1Phase3ServerNotificationSchema } from "../messages";
import {
	ApprovalAnswerInputParamsSchema,
	ApprovalDecisionParamsSchema,
	ApprovalDecisionResultSchema,
	ApprovalRequestSchema,
	DiffFileWindowParamsSchema,
	DiffFileWindowResultSchema,
	DiffSummaryResultSchema,
	DiffSummarySchema,
	TerminalCloseParamsSchema,
	TerminalCommandResultSchema,
	TerminalContextSchema,
	TerminalInputParamsSchema,
	TerminalOpenParamsSchema,
	TerminalReplayParamsSchema,
	TerminalReplayResultSchema,
	TerminalResizeParamsSchema,
	TimelineEntrySchema,
} from "./index";

describe("Protocol v1 Phase 3 approval, diff, and terminal contracts", () => {
	const createdAt = new Date(0).toISOString();
	const threadId = "thread-1";
	const turnId = "turn-1";
	const workspaceTargetId = "target-1";
	const checkpointId = "checkpoint-1";

	const approvalRequest = {
		approvalId: "approval-1",
		threadId,
		turnId,
		workspaceTargetId,
		kind: "command",
		status: "pending",
		title: "Allow command",
		summary: "Run tests",
		createdAt,
	};

	test("approval requests, decisions, and answer input are thread scoped", () => {
		expect(Value.Check(ApprovalRequestSchema, approvalRequest)).toBe(true);
		expect(Value.Check(ApprovalRequestSchema, { ...approvalRequest, sessionId: "session-1" })).toBe(false);

		expect(
			Value.Check(ApprovalDecisionParamsSchema, {
				approvalId: "approval-1",
				threadId,
				turnId,
				workspaceTargetId,
				decision: "approved",
				idempotencyKey: "decision-once",
			}),
		).toBe(true);
		expect(
			Value.Check(ApprovalDecisionParamsSchema, {
				approvalId: "approval-1",
				threadId,
				turnId,
				workspaceTargetId,
				decision: "approved",
				sessionId: "session-1",
			}),
		).toBe(false);

		expect(
			Value.Check(ApprovalAnswerInputParamsSchema, {
				approvalId: "approval-answer-1",
				threadId,
				turnId,
				workspaceTargetId,
				answer: "Use port 3000",
			}),
		).toBe(true);
	});

	test("approval decisions expose stale duplicate and wrong-thread failures", () => {
		const failures = [
			{
				ok: false,
				code: "stale",
				approvalId: "approval-old",
				threadId,
				turnId,
				workspaceTargetId,
				message: "A newer approval replaced this request.",
				currentStatus: "cancelled",
				latestApprovalId: "approval-new",
			},
			{
				ok: false,
				code: "duplicate",
				approvalId: "approval-1",
				threadId,
				turnId,
				workspaceTargetId,
				message: "This approval was already decided.",
				currentStatus: "approved",
			},
			{
				ok: false,
				code: "wrong-thread",
				approvalId: "approval-1",
				threadId: "thread-2",
				turnId,
				workspaceTargetId,
				message: "Approval belongs to a different thread.",
				requestThreadId: threadId,
			},
			{
				ok: false,
				code: "expired",
				approvalId: "approval-1",
				threadId,
				turnId,
				workspaceTargetId,
				message: "Approval expired.",
				currentStatus: "expired",
			},
		];

		for (const failure of failures) {
			expect(Value.Check(ApprovalDecisionResultSchema, failure)).toBe(true);
			expect(Value.Check(ApprovalDecisionResultSchema, { ...failure, sessionId: "session-1" })).toBe(false);
		}
	});

	test("diff summaries are workspace target thread turn checkpoint scoped", () => {
		const summary = {
			diffId: "diff-1",
			workspaceTargetId,
			threadId,
			turnId,
			checkpointId,
			status: "large",
			title: "Large working tree diff",
			createdAt,
			filesChanged: 2500,
			insertions: 10000,
			deletions: 100,
			totalBytes: 20_000_000,
			isLarge: true,
			files: [
				{
					path: "src/index.ts",
					status: "modified",
					insertions: 10,
					deletions: 1,
					hunks: 2,
					byteLength: 4096,
					isBinary: false,
					isLarge: false,
					payloadRef: { kind: "diff-content", diffId: "diff-1", filePath: "src/index.ts", byteLength: 4096 },
				},
			],
			omittedFileCount: 2499,
		};

		expect(Value.Check(DiffSummarySchema, summary)).toBe(true);
		expect(Value.Check(DiffSummarySchema, { ...summary, sessionId: "session-1" })).toBe(false);
		expect(Value.Check(DiffSummarySchema, { ...summary, patch: "diff --git ..." })).toBe(false);
		expect(Value.Check(DiffSummaryResultSchema, { ok: true, summary })).toBe(true);
	});

	test("diff target mismatch and large diff windows have explicit contracts", () => {
		expect(
			Value.Check(DiffSummaryResultSchema, {
				ok: false,
				code: "target-mismatch",
				workspaceTargetId,
				threadId,
				turnId,
				checkpointId,
				diffId: "diff-1",
				message: "Diff was produced for a different workspace target.",
				actualWorkspaceTargetId: "target-2",
			}),
		).toBe(true);

		const windowParams = {
			diffId: "diff-1",
			workspaceTargetId,
			threadId,
			turnId,
			checkpointId,
			filePath: "src/index.ts",
			after: { seq: 0 },
			direction: "forward",
			limit: 1000,
		};
		expect(Value.Check(DiffFileWindowParamsSchema, windowParams)).toBe(true);
		expect(Value.Check(DiffFileWindowParamsSchema, { ...windowParams, limit: 1001 })).toBe(false);

		expect(
			Value.Check(DiffFileWindowResultSchema, {
				ok: true,
				window: {
					diffId: "diff-1",
					workspaceTargetId,
					threadId,
					turnId,
					checkpointId,
					filePath: "src/index.ts",
					status: "modified",
					isBinary: false,
					isLarge: true,
					byteLength: 20_000_000,
					chunks: [],
					nextCursor: { seq: 1000 },
					previousCursor: { seq: 0 },
					hasMoreAfter: true,
					hasMoreBefore: false,
				},
			}),
		).toBe(true);
	});

	test("terminal open input resize close and replay are routed through context contracts", () => {
		expect(
			Value.Check(TerminalOpenParamsSchema, {
				workspaceTargetId,
				threadId,
				turnId,
				rows: 24,
				cols: 80,
				route: "workspace-shell",
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalOpenParamsSchema, {
				workspaceTargetId,
				threadId,
				turnId,
				rows: 24,
				cols: 80,
				route: "workspace-shell",
				shellPath: "/bin/zsh",
			}),
		).toBe(false);

		expect(
			Value.Check(TerminalInputParamsSchema, {
				terminalId: "terminal-1",
				workspaceTargetId,
				threadId,
				turnId,
				input: "bun test\n",
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalResizeParamsSchema, {
				terminalId: "terminal-1",
				workspaceTargetId,
				threadId,
				turnId,
				rows: 40,
				cols: 120,
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalCloseParamsSchema, {
				terminalId: "terminal-1",
				workspaceTargetId,
				threadId,
				turnId,
				reason: "user",
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalReplayParamsSchema, {
				terminalId: "terminal-1",
				workspaceTargetId,
				threadId,
				turnId,
				after: { seq: 10 },
				direction: "forward",
				limit: 100,
			}),
		).toBe(true);
	});

	test("terminal guard errors and killed contexts are explicit states", () => {
		expect(
			Value.Check(TerminalCommandResultSchema, {
				ok: false,
				code: "cwd-outside-workspace",
				workspaceTargetId,
				threadId,
				turnId,

				message: "Terminal cwd is outside the workspace target.",
				guard: {
					code: "cwd-outside-workspace",
					message: "Terminal cwd is outside the workspace target.",
					workspaceTargetId,
					threadId,
					turnId,
				},
			}),
		).toBe(true);

		const killedContext = {
			terminalId: "terminal-1",
			workspaceTargetId,
			threadId,
			turnId,
			title: "Tests",
			status: "killed",
			cwd: "/repo",
			rows: 24,
			cols: 80,
			createdAt,
			updatedAt: createdAt,
			killedAt: createdAt,
			exitCode: null,
			error: { code: "killed", message: "Terminal was killed." },
			lastOutputCursor: { seq: 20 },
		};
		expect(Value.Check(TerminalContextSchema, killedContext)).toBe(true);
		expect(Value.Check(TerminalCommandResultSchema, { ok: true, context: killedContext })).toBe(true);
	});

	test("terminal replay supports reconnect while output arrives", () => {
		expect(
			Value.Check(TerminalReplayResultSchema, {
				ok: true,
				context: {
					terminalId: "terminal-1",
					workspaceTargetId,
					threadId,
					turnId,
					title: "Tests",
					status: "running",
					cwd: "/repo",
					rows: 24,
					cols: 80,
					createdAt,
					updatedAt: createdAt,
					lastOutputCursor: { seq: 15 },
				},
				chunks: [{ cursor: { seq: 11 }, text: "still running\n", byteLength: 14 }],
				watermark: { seq: 15 },
				nextCursor: { seq: 16 },
				previousCursor: { seq: 10 },
				hasMoreAfter: true,
				hasMoreBefore: true,
			}),
		).toBe(true);
	});

	test("timeline references approval diff and terminal updates without heavy payloads", () => {
		const baseEntry = { entryId: "entry-1", threadId, turnId, sequence: 1, createdAt };
		const approvalEntry = {
			...baseEntry,
			kind: "approval",
			approvalId: "approval-1",
			status: "pending",
			title: "Allow command",
			requestRef: { kind: "approval-request", approvalId: "approval-1", threadId, turnId, workspaceTargetId },
		};
		const diffEntry = {
			...baseEntry,
			entryId: "entry-2",
			sequence: 2,
			kind: "diff",
			diffId: "diff-1",
			workspaceTargetId,
			checkpointId,
			title: "Working tree diff",
			filesChanged: 1,
			payloadRef: { kind: "diff-content", diffId: "diff-1", byteLength: 4096 },
			diffRef: { kind: "diff-summary", diffId: "diff-1", workspaceTargetId, threadId, turnId, checkpointId },
		};
		const terminalEntry = {
			...baseEntry,
			entryId: "entry-3",
			sequence: 3,
			kind: "terminal",
			terminalId: "terminal-1",
			status: "running",
			contextRef: { kind: "terminal-context", terminalId: "terminal-1", workspaceTargetId, threadId, turnId },
		};

		expect(Value.Check(TimelineEntrySchema, approvalEntry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...approvalEntry, request: approvalRequest })).toBe(false);
		expect(Value.Check(TimelineEntrySchema, diffEntry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...diffEntry, files: [{ path: "src/index.ts" }] })).toBe(false);
		expect(Value.Check(TimelineEntrySchema, terminalEntry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...terminalEntry, output: "raw terminal output" })).toBe(false);
	});

	test("top-level transport and event helpers expose Phase 3 v1 contracts", () => {
		expect(
			Value.Check(ProtocolV1Phase3ClientRequestSchema, {
				kind: "request",
				id: "req-approval",
				method: "v1.approval.decide",
				params: { approvalId: "approval-1", threadId, turnId, workspaceTargetId, decision: "denied" },
			}),
		).toBe(true);
		expect(
			Value.Check(ProtocolV1Phase3ClientRequestSchema, {
				kind: "request",
				id: "req-approval",
				method: "v1.approval.decide",
				params: {
					approvalId: "approval-1",
					threadId,
					turnId,
					workspaceTargetId,
					decision: "denied",
					sessionId: "session-1",
				},
			}),
		).toBe(false);

		expect(
			Value.Check(ProtocolV1Phase3ServerNotificationSchema, {
				kind: "notification",
				method: "v1.terminal.output",
				params: {
					terminalId: "terminal-1",
					workspaceTargetId,
					threadId,
					turnId,
					cursor: { seq: 4 },
					byteLength: 128,
				},
			}),
		).toBe(true);

		expect(
			Value.Check(ProtocolV1Phase3AppEventPayloadSchema, {
				kind: "timeline.entry",
				data: {
					threadId,
					entry: {
						entryId: "entry-event",
						threadId,
						turnId,
						sequence: 5,
						createdAt,
						kind: "terminal",
						terminalId: "terminal-1",
						status: "running",
					},
					nextCursor: { seq: 6 },
				},
			}),
		).toBe(true);
	});
});
