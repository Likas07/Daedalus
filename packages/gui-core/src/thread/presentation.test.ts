import { describe, expect, test } from "bun:test";
import { summarizeThreadPresentation } from "./presentation";
import type { ThreadViewModel, TimelineEntryViewModel } from "./view-model";

const timestamp = "2026-04-30T00:00:00.000Z";

const baseThread: NonNullable<ThreadViewModel["thread"]> = {
	threadId: "thread-1",
	projectId: "project-1",
	workspaceTargetId: "target-1",
	title: "Thread",
	status: "idle",
	updatedAt: timestamp,
};

const baseTurn: ThreadViewModel["turns"][number] = {
	threadId: "thread-1",
	turnId: "turn-1",
	status: "running",
	createdAt: timestamp,
	updatedAt: timestamp,
};

function createViewModel(overrides: Partial<ThreadViewModel> = {}): ThreadViewModel {
	return {
		thread: baseThread,
		turns: [],
		timeline: [],
		isReplaying: false,
		isLive: false,
		...overrides,
	};
}

function timelineEntry(
	kind: TimelineEntryViewModel["kind"],
	overrides: Partial<Omit<TimelineEntryViewModel, "kind">> = {},
): TimelineEntryViewModel {
	return {
		id: `entry-${kind}`,
		kind,
		sequence: 1,
		title: kind,
		createdAt: timestamp,
		...overrides,
	};
}

describe("thread presentation", () => {
	test("derives header metadata and activity counts from a ThreadViewModel", () => {
		const viewModel = createViewModel({
			thread: { ...baseThread, title: "Build GUI", status: "running" },
			timeline: [
				timelineEntry("user-message", { id: "entry-user", sequence: 1, title: "You", body: "Hello" }),
				timelineEntry("approval", { id: "entry-approval", sequence: 2, title: "Approval", body: "Run command" }),
				timelineEntry("diff", { id: "entry-diff", sequence: 3, title: "Diff" }),
				timelineEntry("terminal-output", { id: "entry-terminal", sequence: 4, title: "Terminal output" }),
			],
			isLive: true,
		});

		expect(summarizeThreadPresentation(viewModel)).toMatchObject({
			title: "Build GUI",
			statusLabel: "Running",
			statusTone: "running",
			isLive: true,
			isReplaying: false,
			connectionLabel: "Live",
			totalTimelineEntries: 4,
			hasApprovals: true,
			hasDiffs: true,
			hasTerminalActivity: true,
			approvalCount: 1,
			diffCount: 1,
			terminalActivityCount: 1,
			approvalLabel: "1 approval",
			diffLabel: "1 diff",
			terminalActivityLabel: "1 terminal event",
			timelineCounts: { "user-message": 1, approval: 1, diff: 1, "terminal-output": 1 },
		});
	});

	test("falls back to Thread-only title text", () => {
		expect(summarizeThreadPresentation(createViewModel({ thread: undefined })).title).toBe("Untitled thread");
		expect(
			summarizeThreadPresentation(
				createViewModel({
					thread: undefined,
					timeline: [
						timelineEntry("user-message", {
							body: "  Draft a durable thread workspace that keeps the conversation visible  ",
						}),
					],
				}),
			).title,
		).toBe("Draft a durable thread workspace that keeps the conversation visible");
	});

	test("maps replay, waiting, completed, failed, and turn activity to status tones", () => {
		const cases: ReadonlyArray<{
			readonly viewModel: ThreadViewModel;
			readonly statusLabel: string;
			readonly statusTone: string;
		}> = [
			{
				viewModel: createViewModel({ isReplaying: true }),
				statusLabel: "Replaying",
				statusTone: "running",
			},
			{
				viewModel: createViewModel({ thread: { ...baseThread, status: "waiting" } }),
				statusLabel: "Waiting",
				statusTone: "warning",
			},
			{
				viewModel: createViewModel({ thread: { ...baseThread, status: "completed" } }),
				statusLabel: "Completed",
				statusTone: "success",
			},
			{
				viewModel: createViewModel({ thread: { ...baseThread, status: "failed" } }),
				statusLabel: "Failed",
				statusTone: "danger",
			},
			{
				viewModel: createViewModel({ thread: { ...baseThread, status: "idle" }, turns: [baseTurn] }),
				statusLabel: "Running",
				statusTone: "running",
			},
			{
				viewModel: createViewModel({ error: "Socket closed" }),
				statusLabel: "Error",
				statusTone: "danger",
			},
		];

		for (const { viewModel, statusLabel, statusTone } of cases) {
			expect(summarizeThreadPresentation(viewModel)).toMatchObject({ statusLabel, statusTone });
		}
	});

	test("reports inactive approval, diff, and terminal panel metadata", () => {
		expect(
			summarizeThreadPresentation(
				createViewModel({ timeline: [timelineEntry("assistant-message", { body: "Done" })] }),
			),
		).toMatchObject({
			hasApprovals: false,
			hasDiffs: false,
			hasTerminalActivity: false,
			approvalCount: 0,
			diffCount: 0,
			terminalActivityCount: 0,
			approvalLabel: "No approvals",
			diffLabel: "No diffs",
			terminalActivityLabel: "No terminal activity",
			timelineCounts: { "assistant-message": 1 },
		});
	});
});
