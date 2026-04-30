import type { ThreadViewModel, TimelineEntryViewModel } from "@daedalus-pi/gui-core";
import { describe, expect, test } from "bun:test";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadWorkspace } from "./ThreadWorkspace";

const timestamp = "2026-04-30T00:00:00.000Z";

const baseThread: NonNullable<ThreadViewModel["thread"]> = {
	projectId: "project-1",
	status: "running",
	threadId: "thread-1",
	title: "Build GUI workspace",
	updatedAt: timestamp,
	workspaceTargetId: "target-1",
};

const runningTurn: ThreadViewModel["turns"][number] = {
	createdAt: timestamp,
	status: "running",
	threadId: "thread-1",
	turnId: "turn-1",
	updatedAt: timestamp,
};

function createViewModel(overrides: Partial<ThreadViewModel> = {}): ThreadViewModel {
	return {
		error: undefined,
		isLive: true,
		isReplaying: false,
		thread: baseThread,
		timeline: [],
		turns: [],
		...overrides,
	};
}

function timelineEntry(
	kind: TimelineEntryViewModel["kind"],
	overrides: Partial<Omit<TimelineEntryViewModel, "kind">> = {},
): TimelineEntryViewModel {
	return {
		createdAt: timestamp,
		id: `entry-${kind}-${overrides.sequence ?? 1}`,
		kind,
		sequence: 1,
		title: kind,
		...overrides,
	};
}

describe("ThreadHeader", () => {
	test("renders title, status pill, timeline badges, and compact panel labels from presentation metadata", () => {
		const viewModel = createViewModel({
			timeline: [
				timelineEntry("user-message", { body: "Start work", id: "entry-user", sequence: 1, title: "You" }),
				timelineEntry("approval", { body: "Run tests", id: "entry-approval", sequence: 2, title: "Approval" }),
				timelineEntry("diff", { id: "entry-diff", sequence: 3, title: "Diff" }),
				timelineEntry("terminal-output", { id: "entry-terminal", sequence: 4, title: "Terminal output" }),
			],
		});

		const markup = renderMarkup(React.createElement(ThreadHeader, { viewModel }));

		expectMarkupContains(markup, [
			'data-testid="thread-header"',
			"Build GUI workspace",
			'data-testid="thread-status"',
			'aria-label="Thread status: Running"',
			'data-tone="running"',
			"Running",
			'data-testid="thread-connection"',
			"Live",
			'data-testid="thread-timeline-summary"',
			"4 events",
			"1 user message",
			"1 approval",
			"1 diff",
			"1 terminal output",
			'data-testid="thread-approvals-label"',
			'aria-label="Approvals: 1 approval"',
			'<dt>Approvals</dt><dd>1</dd>',
			'data-testid="thread-diff-label"',
			'aria-label="Diff: 1 diff"',
			'<dt>Diff</dt><dd>1</dd>',
			'data-testid="thread-terminal-label"',
			'aria-label="Terminal: 1 terminal event"',
			'<dt>Terminal</dt><dd>1</dd>',
		]);
	});

	test("renders inactive panel labels when no approval, diff, or terminal activity exists", () => {
		const markup = renderMarkup(
			React.createElement(ThreadHeader, {
				viewModel: createViewModel({ thread: { ...baseThread, status: "idle" }, timeline: [] }),
			}),
		);

		expectMarkupContains(markup, [
			"0 events",
			'aria-label="Approvals: No approvals"',
			'aria-label="Diff: No diffs"',
			'aria-label="Terminal: No terminal activity"',
			'data-active="false"',
		]);
	});
});

describe("ThreadWorkspace", () => {
	test("composes a T3-style header, timeline viewport, and composer dock without the placeholder sidecar", () => {
		const viewModel = createViewModel({
			timeline: [
				timelineEntry("user-message", { body: "Keep building", id: "entry-user", sequence: 1, title: "You" }),
				timelineEntry("assistant-message", {
					body: "Working on the thread workspace",
					id: "entry-assistant",
					sequence: 2,
					title: "Daedalus",
				}),
			],
			turns: [runningTurn],
		});

		const markup = renderMarkup(
			React.createElement(ThreadWorkspace, {
				viewModel,
				onCancelTurn: () => undefined,
				onReconnect: () => undefined,
				onSubmitTurn: () => undefined,
			}),
		);

		expectMarkupContains(markup, [
			'data-testid="thread-workspace"',
			'data-testid="thread-header"',
			'data-testid="thread-timeline-viewport"',
			'aria-label="Thread timeline viewport"',
			'data-testid="thread-timeline"',
			"Keep building",
			"Working on the thread workspace",
			'data-testid="thread-composer-dock"',
			'aria-label="Thread composer dock"',
			'data-testid="thread-composer"',
			"Send follow-up",
			'data-testid="thread-stop"',
		]);
		expect(markup).not.toContain('aria-label="Thread side panels"');
		expect(markup).not.toContain("No pending approvals. Approval details will appear here when the agent asks.");
		expect(markup).not.toContain("No diff selected. Large diffs are loaded from Daedalus payload windows on demand.");
		expect(markup).not.toContain("No terminal context is open. Terminal output will stream here when available.");
	});
});
