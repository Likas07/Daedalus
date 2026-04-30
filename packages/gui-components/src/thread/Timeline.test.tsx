import { describe, expect, test } from "bun:test";
import type { TimelineEntryViewModel } from "@daedalus-pi/gui-core";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { Timeline } from "./Timeline";

const createdAt = "2026-04-30T00:00:00.000Z";

function timelineEntry(
	kind: TimelineEntryViewModel["kind"],
	overrides: Partial<Omit<TimelineEntryViewModel, "kind">> = {},
): TimelineEntryViewModel {
	return {
		id: `entry-${kind}`,
		kind,
		sequence: 1,
		title: kind,
		createdAt,
		...overrides,
	};
}

describe("Timeline", () => {
	test("renders centered T3-style rows for messages and compact timeline events", () => {
		const entries: TimelineEntryViewModel[] = [
			timelineEntry("user-message", {
				id: "entry-user",
				sequence: 1,
				title: "You",
				body: "Build a T3-style timeline",
			}),
			timelineEntry("assistant-message", {
				id: "entry-assistant",
				sequence: 2,
				title: "Daedalus",
				body: "Plain **markdown** <em>escaped</em>",
			}),
			timelineEntry("activity", {
				id: "entry-activity",
				sequence: 3,
				title: "Thinking",
				body: "Inspecting thread files",
			}),
			timelineEntry("approval", {
				id: "entry-approval",
				sequence: 4,
				title: "Allow command",
				body: "bun test requested",
				placeholder: "Audit detail placeholder (512 bytes)",
			}),
			timelineEntry("diff", {
				id: "entry-diff",
				sequence: 5,
				title: "Working tree diff",
				body: "3 files changed",
				placeholder: "Diff content available on demand",
			}),
			timelineEntry("terminal", {
				id: "entry-terminal",
				sequence: 6,
				title: "Terminal: running",
				body: "bun --cwd=packages/gui-components test src/thread/Timeline.test.tsx",
				placeholder: "Terminal context available on demand",
			}),
		];

		const markup = renderMarkup(React.createElement(Timeline, { entries }));

		expectMarkupContains(markup, [
			'data-testid="thread-timeline"',
			'data-state="ready"',
			'class="daedalus-thread-timeline-list"',
			'class="daedalus-thread-entry daedalus-thread-entry-user-message daedalus-thread-entry-message daedalus-thread-entry-user"',
			'class="daedalus-thread-entry-row daedalus-thread-entry-row-user"',
			'class="daedalus-thread-user-bubble daedalus-thread-message-text"',
			"Build a T3-style timeline",
			'class="daedalus-thread-entry daedalus-thread-entry-assistant-message daedalus-thread-entry-message daedalus-thread-entry-assistant"',
			'class="daedalus-thread-assistant-card"',
			'class="daedalus-thread-assistant-body daedalus-thread-message-text"',
			"Plain **markdown** &lt;em&gt;escaped&lt;/em&gt;",
			'data-entry-kind="activity"',
			'class="daedalus-thread-event-card daedalus-thread-event-card-compact daedalus-thread-event-card-activity daedalus-thread-entry-shell"',
			"Activity",
			"Thinking",
			'data-entry-kind="approval"',
			'class="daedalus-thread-event-card daedalus-thread-event-card-compact daedalus-thread-event-card-approval daedalus-thread-entry-shell"',
			"Approval",
			"Allow command",
			"Audit detail placeholder (512 bytes)",
			'data-entry-kind="diff"',
			'class="daedalus-thread-event-card daedalus-thread-event-card-compact daedalus-thread-event-card-diff daedalus-thread-entry-shell"',
			"Diff",
			"Working tree diff",
			'data-entry-kind="terminal"',
			'class="daedalus-thread-event-card daedalus-thread-event-card-compact daedalus-thread-event-card-terminal daedalus-thread-entry-shell"',
			"Terminal",
			"Terminal context available on demand",
			'aria-label="Timeline sequence 6"',
			"#6",
		]);
		expect(markup).not.toContain("<em>escaped</em>");
		expect(markup).not.toContain("<strong>");
	});

	test("renders a loading card inside the preserved timeline container", () => {
		const markup = renderMarkup(React.createElement(Timeline, { entries: [], isLoading: true }));

		expectMarkupContains(markup, [
			'data-testid="thread-timeline"',
			'data-state="loading"',
			'class="daedalus-thread-empty daedalus-thread-empty-loading"',
			'class="daedalus-thread-empty-card daedalus-thread-empty-card-loading daedalus-thread-entry-shell"',
			"Loading thread",
			"Replaying Daedalus timeline events…",
		]);
	});

	test("renders an empty card when the thread has no timeline entries", () => {
		const markup = renderMarkup(React.createElement(Timeline, { entries: [] }));

		expectMarkupContains(markup, [
			'data-testid="thread-timeline"',
			'data-state="empty"',
			'class="daedalus-thread-empty daedalus-thread-empty-ready"',
			'class="daedalus-thread-empty-card daedalus-thread-empty-card-empty daedalus-thread-entry-shell"',
			"No timeline entries yet",
			"Send a turn to start this Daedalus thread.",
		]);
	});

	test("renders an error card with reconnect affordance", () => {
		const markup = renderMarkup(
			React.createElement(Timeline, { entries: [], error: "Socket closed", onReconnect: () => undefined }),
		);

		expectMarkupContains(markup, [
			'data-testid="thread-timeline"',
			'data-state="error"',
			'class="daedalus-thread-empty daedalus-thread-empty-error"',
			'class="daedalus-thread-empty-card daedalus-thread-empty-card-error daedalus-thread-entry-shell"',
			"Thread connection needs attention",
			"Socket closed",
			'data-testid="thread-reconnect"',
			">Reconnect</button>",
		]);
	});
});
