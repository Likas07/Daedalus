import type { ThreadViewModel, TimelineEntryViewModel } from "./view-model";

export type ThreadPresentationStatusTone = "idle" | "running" | "success" | "warning" | "danger";
export type ThreadTimelineEntryKind = TimelineEntryViewModel["kind"];
export type ThreadTimelineKindCounts = Readonly<Partial<Record<ThreadTimelineEntryKind, number>>>;

export interface ThreadPresentationSummary {
	readonly title: string;
	readonly statusLabel: string;
	readonly statusTone: ThreadPresentationStatusTone;
	readonly isLive: boolean;
	readonly isReplaying: boolean;
	readonly connectionLabel: string;
	readonly totalTimelineEntries: number;
	readonly timelineCounts: ThreadTimelineKindCounts;
	readonly hasApprovals: boolean;
	readonly hasDiffs: boolean;
	readonly hasTerminalActivity: boolean;
	readonly approvalCount: number;
	readonly diffCount: number;
	readonly terminalActivityCount: number;
	readonly approvalLabel: string;
	readonly diffLabel: string;
	readonly terminalActivityLabel: string;
}

type DerivedThreadStatus = "idle" | "queued" | "running" | "waiting" | "failed" | "completed" | "replaying" | "error";

const UNTITLED_THREAD_TITLE = "Untitled thread";
const FALLBACK_TITLE_MAX_LENGTH = 72;

export function summarizeThreadPresentation(viewModel: ThreadViewModel): ThreadPresentationSummary {
	const timelineCounts = countTimelineKinds(viewModel.timeline);
	const status = deriveStatus(viewModel);
	const approvalCount = countTimelineKind(timelineCounts, "approval");
	const diffCount = countTimelineKind(timelineCounts, "diff");
	const terminalActivityCount =
		countTimelineKind(timelineCounts, "terminal") + countTimelineKind(timelineCounts, "terminal-output");

	return {
		title: deriveTitle(viewModel),
		statusLabel: statusLabel(status),
		statusTone: statusTone(status),
		isLive: viewModel.isLive,
		isReplaying: viewModel.isReplaying,
		connectionLabel: connectionLabel(viewModel),
		totalTimelineEntries: viewModel.timeline.length,
		timelineCounts,
		hasApprovals: approvalCount > 0,
		hasDiffs: diffCount > 0,
		hasTerminalActivity: terminalActivityCount > 0,
		approvalCount,
		diffCount,
		terminalActivityCount,
		approvalLabel: countLabel(approvalCount, "approval", "approvals"),
		diffLabel: countLabel(diffCount, "diff", "diffs"),
		terminalActivityLabel:
			terminalActivityCount === 0
				? "No terminal activity"
				: countLabel(terminalActivityCount, "terminal event", "terminal events"),
	};
}

function deriveTitle(viewModel: ThreadViewModel): string {
	const explicitTitle = normalizeTitle(viewModel.thread?.title);
	if (explicitTitle) return explicitTitle;

	const firstUserMessage = viewModel.timeline.find((entry) => entry.kind === "user-message" && normalizeTitle(entry.body));
	const timelineTitle = normalizeTitle(firstUserMessage?.body);
	return timelineTitle ? truncateTitle(timelineTitle) : UNTITLED_THREAD_TITLE;
}

function normalizeTitle(value: string | undefined): string {
	return value?.trim().replace(/\s+/g, " ") ?? "";
}

function truncateTitle(title: string): string {
	if (title.length <= FALLBACK_TITLE_MAX_LENGTH) return title;
	return `${title.slice(0, FALLBACK_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

function deriveStatus(viewModel: ThreadViewModel): DerivedThreadStatus {
	if (viewModel.error) return "error";
	if (viewModel.isReplaying) return "replaying";
	if (viewModel.turns.some((turn) => turn.status === "running")) return "running";
	if (viewModel.turns.some((turn) => turn.status === "queued")) return "queued";
	if (viewModel.turns.some((turn) => turn.status === "waiting")) return "waiting";
	if (viewModel.thread?.status) return viewModel.thread.status;

	const latestTurn = viewModel.turns.reduce<ThreadViewModel["turns"][number] | undefined>((latest, turn) => {
		if (!latest) return turn;
		return turn.updatedAt.localeCompare(latest.updatedAt) >= 0 ? turn : latest;
	}, undefined);

	switch (latestTurn?.status) {
		case "queued":
			return "queued";
		case "running":
			return "running";
		case "waiting":
			return "waiting";
		case "failed":
			return "failed";
		case "completed":
			return "completed";
		case "cancelled":
		case undefined:
			return "idle";
	}
}

function statusLabel(status: DerivedThreadStatus): string {
	switch (status) {
		case "idle":
			return "Idle";
		case "queued":
			return "Queued";
		case "running":
			return "Running";
		case "waiting":
			return "Waiting";
		case "failed":
			return "Failed";
		case "completed":
			return "Completed";
		case "replaying":
			return "Replaying";
		case "error":
			return "Error";
	}
}

function statusTone(status: DerivedThreadStatus): ThreadPresentationStatusTone {
	switch (status) {
		case "running":
		case "replaying":
			return "running";
		case "queued":
			return "warning";
		case "waiting":
			return "warning";
		case "completed":
			return "success";
		case "failed":
		case "error":
			return "danger";
		case "idle":
			return "idle";
	}
}

function connectionLabel(viewModel: ThreadViewModel): string {
	if (viewModel.isReplaying) return "Replaying";
	if (viewModel.isLive) return "Live";
	if (viewModel.error) return "Error";
	return "Idle";
}

function countTimelineKinds(timeline: readonly TimelineEntryViewModel[]): ThreadTimelineKindCounts {
	const counts: Partial<Record<ThreadTimelineEntryKind, number>> = {};
	for (const entry of timeline) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
	return counts;
}

function countTimelineKind(counts: ThreadTimelineKindCounts, kind: ThreadTimelineEntryKind): number {
	return counts[kind] ?? 0;
}

function countLabel(count: number, singular: string, plural: string): string {
	if (count === 0) return `No ${plural}`;
	if (count === 1) return `1 ${singular}`;
	return `${count} ${plural}`;
}
