import type {
	ThreadPresentationSummary,
	ThreadTimelineEntryKind,
	ThreadTimelineKindCounts,
	ThreadViewModel,
} from "@daedalus-pi/gui-core";
import { summarizeThreadPresentation } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { Badge, type BadgeTone, StatusPill } from "../ui";

export interface ThreadHeaderProps {
	readonly viewModel: ThreadViewModel;
}

interface TimelineBadgeDescriptor {
	readonly kind: ThreadTimelineEntryKind;
	readonly singular: string;
	readonly plural: string;
	readonly tone: BadgeTone;
}

interface TimelineBadgeViewModel {
	readonly key: string;
	readonly label: string;
	readonly ariaLabel: string;
	readonly tone: BadgeTone;
}

const timelineBadgeDescriptors: readonly TimelineBadgeDescriptor[] = [
	{ kind: "user-message", singular: "user message", plural: "user messages", tone: "neutral" },
	{ kind: "assistant-message", singular: "assistant message", plural: "assistant messages", tone: "accent" },
	{ kind: "activity", singular: "activity", plural: "activities", tone: "accent" },
	{ kind: "tool", singular: "tool call", plural: "tool calls", tone: "accent" },
	{ kind: "terminal", singular: "terminal", plural: "terminals", tone: "accent" },
	{ kind: "terminal-output", singular: "terminal output", plural: "terminal outputs", tone: "accent" },
	{ kind: "approval", singular: "approval", plural: "approvals", tone: "warning" },
	{ kind: "diff", singular: "diff", plural: "diffs", tone: "success" },
	{ kind: "plan", singular: "plan", plural: "plans", tone: "accent" },
	{ kind: "safety", singular: "safety event", plural: "safety events", tone: "danger" },
	{ kind: "system-event", singular: "system event", plural: "system events", tone: "neutral" },
	{ kind: "recovery-event", singular: "recovery event", plural: "recovery events", tone: "neutral" },
];

export function ThreadHeader({ viewModel }: ThreadHeaderProps): ReactNode {
	const summary = summarizeThreadPresentation(viewModel);
	const timelineBadges = createTimelineBadges(summary);

	return React.createElement(
		"header",
		{ className: "daedalus-thread-header", "data-testid": "thread-header" },
		React.createElement(
			"div",
			{ className: "daedalus-thread-header-primary" },
			React.createElement("p", { className: "daedalus-thread-header-eyebrow" }, "Thread"),
			React.createElement(
				"div",
				{ className: "daedalus-thread-header-title-row" },
				React.createElement("h1", null, summary.title),
				React.createElement(
					StatusPill,
					{
						ariaLabel: `Thread status: ${summary.statusLabel}`,
						testId: "thread-status",
						tone: summary.statusTone,
					},
					summary.statusLabel,
				),
				React.createElement(
					Badge,
					{
						ariaLabel: `Thread connection: ${summary.connectionLabel}`,
						testId: "thread-connection",
						tone: connectionTone(summary),
					},
					summary.connectionLabel,
				),
			),
		),
		React.createElement(
			"div",
			{
				"aria-label": "Timeline summary",
				className: "daedalus-thread-header-badges",
				"data-testid": "thread-timeline-summary",
			},
			timelineBadges.map((badge) =>
				React.createElement(
					Badge,
					{
						ariaLabel: badge.ariaLabel,
						key: badge.key,
						testId: `thread-summary-${badge.key}`,
						tone: badge.tone,
					},
					badge.label,
				),
			),
		),
		React.createElement(
			"dl",
			{
				"aria-label": "Workspace panel activity",
				className: "daedalus-thread-header-panel-labels",
				"data-testid": "thread-panel-labels",
			},
			React.createElement(ThreadPanelActivityLabel, {
				ariaLabel: `Approvals: ${summary.approvalLabel}`,
				count: summary.approvalCount,
				isActive: summary.hasApprovals,
				label: "Approvals",
				testId: "thread-approvals-label",
			}),
			React.createElement(ThreadPanelActivityLabel, {
				ariaLabel: `Diff: ${summary.diffLabel}`,
				count: summary.diffCount,
				isActive: summary.hasDiffs,
				label: "Diff",
				testId: "thread-diff-label",
			}),
			React.createElement(ThreadPanelActivityLabel, {
				ariaLabel: `Terminal: ${summary.terminalActivityLabel}`,
				count: summary.terminalActivityCount,
				isActive: summary.hasTerminalActivity,
				label: "Terminal",
				testId: "thread-terminal-label",
			}),
		),
	);
}

interface ThreadPanelActivityLabelProps {
	readonly label: string;
	readonly count: number;
	readonly isActive: boolean;
	readonly ariaLabel: string;
	readonly testId: string;
}

function ThreadPanelActivityLabel({
	label,
	count,
	isActive,
	ariaLabel,
	testId,
}: ThreadPanelActivityLabelProps): ReactNode {
	return React.createElement(
		"div",
		{
			"aria-label": ariaLabel,
			className: `daedalus-thread-header-panel-label daedalus-thread-header-panel-label-${isActive ? "active" : "idle"}`,
			"data-active": isActive ? "true" : "false",
			"data-testid": testId,
		},
		React.createElement("dt", null, label),
		React.createElement("dd", null, compactCount(count)),
	);
}

function createTimelineBadges(summary: ThreadPresentationSummary): readonly TimelineBadgeViewModel[] {
	const badges: TimelineBadgeViewModel[] = [
		{
			ariaLabel: `${countLabel(summary.totalTimelineEntries, "timeline event", "timeline events")} in this thread`,
			key: "events",
			label: countLabel(summary.totalTimelineEntries, "event", "events"),
			tone: summary.totalTimelineEntries > 0 ? "accent" : "neutral",
		},
	];

	for (const descriptor of timelineBadgeDescriptors) {
		const count = timelineKindCount(summary.timelineCounts, descriptor.kind);
		if (count === 0) continue;
		badges.push({
			ariaLabel: countLabel(count, descriptor.singular, descriptor.plural),
			key: descriptor.kind,
			label: countLabel(count, descriptor.singular, descriptor.plural),
			tone: descriptor.tone,
		});
	}

	return badges;
}

function timelineKindCount(counts: ThreadTimelineKindCounts, kind: ThreadTimelineEntryKind): number {
	return counts[kind] ?? 0;
}

function connectionTone(summary: ThreadPresentationSummary): BadgeTone {
	if (summary.statusTone === "danger") return "danger";
	if (summary.isLive) return "success";
	if (summary.isReplaying) return "accent";
	return "neutral";
}

function compactCount(count: number): string {
	if (count < 1000) return String(count);
	return `${Math.floor(count / 100) / 10}k`;
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
