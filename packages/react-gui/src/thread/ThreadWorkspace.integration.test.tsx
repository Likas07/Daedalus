import { describe, expect, test } from "bun:test";
import {
	decideApproval,
	getDiffSummary,
	openTerminal,
	replayTerminalOutput,
	sendTerminalInput,
} from "@daedalus-pi/app-server-client";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { approvalQueueReducer, createInitialApprovalQueueState } from "@daedalus-pi/gui-core/approval/reducer";
import { createInitialDiffPanelState, diffPanelReducer } from "@daedalus-pi/gui-core/diff/reducer";
import {
	createInitialTerminalDrawerState,
	selectActiveTerminalOutput,
	terminalDrawerReducer,
} from "@daedalus-pi/gui-core/terminal/reducer";
import { createInitialThreadLoopState, threadLoopReducer } from "@daedalus-pi/gui-core/thread/reducer";

const ids = {
	threadId: "thread-1",
	turnId: "turn-1",
	workspaceTargetId: "base:project-1",
	checkpointId: "checkpoint-1",
};

class FakePhase3Client {
	readonly requests: Array<{ method: string; params: unknown }> = [];
	approvalResult: protocolV1.ApprovalDecisionResult = approvalFailure("stale", "Approval is stale");
	diffResult: protocolV1.DiffSummaryResult = diffFailure("target-mismatch", "Target mismatch");
	terminalOpenResult: protocolV1.TerminalCommandResult = terminalFailure(
		"workspace-target-blocked",
		"Guard blocked cwd",
	);
	terminalInputResult: protocolV1.TerminalCommandResult = terminalFailure("killed", "Terminal was killed");
	terminalReplayResult: protocolV1.TerminalReplayResult = terminalReplay(["first", "second"]);

	async request(method: string, params: unknown): Promise<unknown> {
		this.requests.push({ method, params });
		if (method === "v1.approval.decide") return this.approvalResult;
		if (method === "v1.diff.summary") return this.diffResult;
		if (method === "v1.terminal.open") return this.terminalOpenResult;
		if (method === "v1.terminal.input") return this.terminalInputResult;
		if (method === "v1.terminal.replay") return this.terminalReplayResult;
		throw new Error(`Unexpected method ${method}`);
	}
}

describe("Phase 3 thread surface integrations", () => {
	test("keeps interleaved approval, diff, and terminal timeline entries in protocol sequence order", () => {
		const entries: protocolV1.TimelineEntry[] = [
			{
				entryId: "terminal-3",
				threadId: ids.threadId,
				sequence: 3,
				createdAt: "2026-04-30T00:00:03.000Z",
				kind: "terminal",
				terminalId: "terminal-1",
				status: "running",
				title: "Terminal",
			},
			{
				entryId: "approval-1",
				threadId: ids.threadId,
				sequence: 1,
				createdAt: "2026-04-30T00:00:01.000Z",
				kind: "approval",
				approvalId: "approval-1",
				status: "pending",
				title: "Run command?",
			},
			{
				entryId: "diff-2",
				threadId: ids.threadId,
				sequence: 2,
				createdAt: "2026-04-30T00:00:02.000Z",
				kind: "diff",
				diffId: "diff-1",
				title: "2 changed files",
				filesChanged: 2,
				payloadRef: { kind: "diff-content", diffId: "diff-1", byteLength: 42 },
			},
		];
		const state = entries.reduce(
			(current, entry) => threadLoopReducer(current, { type: "thread.timelineEntryReceived", entry }),
			createInitialThreadLoopState(),
		);
		expect(state.timelineOrder).toEqual(["approval-1", "diff-2", "terminal-3"]);
	});

	test("routes stale and wrong-thread approval decisions through v1 client failures", async () => {
		const client = new FakePhase3Client();
		client.approvalResult = approvalFailure("wrong-thread", "Approval belongs to thread-2", "thread-2");
		const result = await decideApproval(client, {
			approvalId: "approval-1",
			threadId: ids.threadId,
			turnId: ids.turnId,
			workspaceTargetId: ids.workspaceTargetId,
			decision: "approved",
		});
		expect(client.requests.at(-1)?.method).toBe("v1.approval.decide");
		expect(result).toMatchObject({ ok: false, code: "wrong-thread", requestThreadId: "thread-2" });
		const state = approvalQueueReducer(createInitialApprovalQueueState(ids), {
			type: "approval.failed",
			failure: result as protocolV1.ApprovalFailure,
		});
		expect(state.failureById["approval-1"]?.code).toBe("wrong-thread");

		client.approvalResult = approvalFailure("stale", "Approval is stale");
		expect(await decideApproval(client, { approvalId: "approval-1", ...ids, decision: "denied" })).toMatchObject({
			ok: false,
			code: "stale",
		});
	});

	test("surfaces diff target mismatch and large diff window state", async () => {
		const client = new FakePhase3Client();
		const mismatch = await getDiffSummary(client, ids);
		expect(client.requests.at(-1)?.method).toBe("v1.diff.summary");
		expect(mismatch).toMatchObject({ ok: false, code: "target-mismatch" });

		const large = diffSummary("large", true, 200_000);
		let state = diffPanelReducer(createInitialDiffPanelState(ids), {
			type: "diff.summaryLoaded",
			result: { ok: true, summary: large },
		});
		expect(state.summary?.isLarge).toBe(true);
		state = diffPanelReducer(state, {
			type: "diff.fileWindowLoaded",
			result: {
				ok: true,
				window: {
					diffId: large.diffId,
					workspaceTargetId: ids.workspaceTargetId,
					threadId: ids.threadId,
					turnId: ids.turnId,
					checkpointId: ids.checkpointId,
					filePath: "big.ts",
					status: "modified",
					isBinary: false,
					isLarge: true,
					byteLength: 200_000,
					chunks: [
						{
							cursor: { seq: 1 },
							oldStart: 1,
							oldLines: 1,
							newStart: 1,
							newLines: 1,
							text: "@@ big",
							byteLength: 6,
						},
					],
					nextCursor: { seq: 1 },
					hasMoreAfter: true,
					hasMoreBefore: false,
				},
			},
		});
		expect(state.fileWindowsByPath["big.ts"]?.hasMoreAfter).toBe(true);
	});

	test("surfaces terminal guard errors, killed terminals, and reconnect output replay", async () => {
		const client = new FakePhase3Client();
		const blocked = await openTerminal(client, {
			threadId: ids.threadId,
			workspaceTargetId: ids.workspaceTargetId,
			turnId: ids.turnId,
			route: "workspace-shell",
			rows: 24,
			cols: 80,
		});
		expect(blocked).toMatchObject({ ok: false, code: "workspace-target-blocked" });

		const killed = await sendTerminalInput(client, {
			terminalId: "terminal-1",
			threadId: ids.threadId,
			workspaceTargetId: ids.workspaceTargetId,
			turnId: ids.turnId,
			input: "echo hi\n",
		});
		expect(killed).toMatchObject({ ok: false, code: "killed" });

		let state = terminalDrawerReducer(createInitialTerminalDrawerState(), {
			type: "terminal.contextChanged",
			context: terminalContext("terminal-1", "killed"),
		});
		state = terminalDrawerReducer(state, { type: "terminal.replayStarted", terminalId: "terminal-1" });
		const replayed = await replayTerminalOutput(client, {
			terminalId: "terminal-1",
			threadId: ids.threadId,
			workspaceTargetId: ids.workspaceTargetId,
			turnId: ids.turnId,
			limit: 100,
		});
		expect(replayed.ok).toBe(true);
		if (replayed.ok) state = terminalDrawerReducer(state, { type: "terminal.replayLoaded", result: replayed });
		state = terminalDrawerReducer(state, {
			type: "terminal.outputAppended",
			terminalId: "terminal-1",
			chunk: { cursor: { seq: 3 }, text: "third", byteLength: 5 },
		});
		expect(selectActiveTerminalOutput(state).map((chunk) => chunk.text)).toEqual(["first", "second", "third"]);
	});
});

function approvalFailure(
	code: protocolV1.ApprovalFailureCode,
	message: string,
	requestThreadId?: string,
): protocolV1.ApprovalFailure {
	return {
		ok: false,
		code,
		approvalId: "approval-1",
		threadId: ids.threadId,
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		message,
		requestThreadId,
	};
}

function diffFailure(code: protocolV1.DiffFailureCode, message: string): protocolV1.DiffFailure {
	return {
		ok: false,
		code,
		threadId: ids.threadId,
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		message,
	};
}

function terminalFailure(code: protocolV1.TerminalErrorCode, message: string): protocolV1.TerminalFailure {
	return {
		ok: false,
		code,
		threadId: ids.threadId,
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		message,
	};
}

function diffSummary(status: protocolV1.DiffStatus, isLarge: boolean, totalBytes: number): protocolV1.DiffSummary {
	return {
		diffId: "diff-1",
		threadId: ids.threadId,
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		checkpointId: ids.checkpointId,
		status,
		title: "Large diff",
		createdAt: "2026-04-30T00:00:00.000Z",
		filesChanged: 1,
		insertions: 1000,
		deletions: 10,
		totalBytes,
		isLarge,
		omittedFileCount: 0,
		files: [
			{
				path: "big.ts",
				status: "modified",
				insertions: 1000,
				deletions: 10,
				hunks: 50,
				byteLength: totalBytes,
				isBinary: false,
				isLarge,
				payloadRef: { kind: "diff-content", diffId: "diff-1", filePath: "big.ts", byteLength: totalBytes },
			},
		],
	};
}

function terminalReplay(texts: readonly string[]): protocolV1.TerminalReplayResult {
	return {
		ok: true,
		context: terminalContext("terminal-1", "running"),
		chunks: texts.map((text, index) => ({ cursor: { seq: index + 1 }, text, byteLength: text.length })),
		watermark: { seq: texts.length },
		hasMoreAfter: false,
		hasMoreBefore: false,
	};
}

function terminalContext(terminalId: string, status: protocolV1.TerminalContextStatus): protocolV1.TerminalContext {
	return {
		terminalId,
		threadId: ids.threadId,
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		title: "Terminal",
		status,
		cwd: "/repo",
		rows: 24,
		cols: 80,
		createdAt: "2026-04-30T00:00:00.000Z",
		updatedAt: "2026-04-30T00:00:01.000Z",
	};
}
