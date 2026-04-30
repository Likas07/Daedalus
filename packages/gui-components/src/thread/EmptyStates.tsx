import React, { type ReactNode } from "react";

export interface EmptyTimelineProps {
	readonly isLoading?: boolean;
	readonly error?: string;
	readonly onReconnect?: () => void;
}

export function EmptyTimeline({ isLoading, error, onReconnect }: EmptyTimelineProps): ReactNode {
	if (error) {
		return React.createElement(
			"section",
			{
				className: "daedalus-thread-empty daedalus-thread-empty-error",
				role: "status",
				"aria-live": "assertive",
			},
			renderEmptyCard(
				"error",
				"Connection",
				"Thread connection needs attention",
				error,
				onReconnect
					? React.createElement(
							"button",
							{
								type: "button",
								onClick: onReconnect,
								className: "daedalus-thread-empty-action",
								"data-testid": "thread-reconnect",
							},
							"Reconnect",
						)
					: null,
			),
		);
	}

	if (isLoading) {
		return React.createElement(
			"section",
			{ className: "daedalus-thread-empty daedalus-thread-empty-loading", role: "status", "aria-live": "polite" },
			renderEmptyCard("loading", "Replaying", "Loading thread", "Replaying Daedalus timeline events…"),
		);
	}

	return React.createElement(
		"section",
		{ className: "daedalus-thread-empty daedalus-thread-empty-ready", role: "status", "aria-live": "polite" },
		renderEmptyCard("empty", "Thread", "No timeline entries yet", "Send a turn to start this Daedalus thread."),
	);
}

function renderEmptyCard(
	state: string,
	eyebrow: string,
	title: string,
	body: string,
	action: ReactNode = null,
): ReactNode {
	return React.createElement(
		"article",
		{ className: `daedalus-thread-empty-card daedalus-thread-empty-card-${state} daedalus-thread-entry-shell` },
		React.createElement("p", { className: "daedalus-thread-empty-eyebrow" }, eyebrow),
		React.createElement("h2", { className: "daedalus-thread-empty-title" }, title),
		React.createElement("p", { className: "daedalus-thread-empty-copy" }, body),
		action,
	);
}

export function ApprovalPlaceholder(): ReactNode {
	return React.createElement(
		"section",
		{ className: "daedalus-thread-placeholder", "aria-label": "Approvals" },
		React.createElement("h2", null, "Approvals"),
		React.createElement("p", null, "No pending approvals. Approval details will appear here when the agent asks."),
	);
}

export function DiffPlaceholder(): ReactNode {
	return React.createElement(
		"section",
		{ className: "daedalus-thread-placeholder", "aria-label": "Diffs" },
		React.createElement("h2", null, "Diffs"),
		React.createElement(
			"p",
			null,
			"No diff selected. Large diffs are loaded from Daedalus payload windows on demand.",
		),
	);
}

export function TerminalPlaceholder(): ReactNode {
	return React.createElement(
		"section",
		{ className: "daedalus-thread-placeholder", "aria-label": "Terminal" },
		React.createElement("h2", null, "Terminal"),
		React.createElement("p", null, "No terminal context is open. Terminal output will stream here when available."),
	);
}
