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
			{ className: "daedalus-thread-empty daedalus-thread-empty-error", role: "status" },
			React.createElement("h2", null, "Thread connection needs attention"),
			React.createElement("p", null, error),
			onReconnect
				? React.createElement(
						"button",
						{ type: "button", onClick: onReconnect, "data-testid": "thread-reconnect" },
						"Reconnect",
					)
				: null,
		);
	}

	if (isLoading) {
		return React.createElement(
			"section",
			{ className: "daedalus-thread-empty", role: "status" },
			React.createElement("h2", null, "Loading thread"),
			React.createElement("p", null, "Replaying Daedalus timeline events…"),
		);
	}

	return React.createElement(
		"section",
		{ className: "daedalus-thread-empty", role: "status" },
		React.createElement("h2", null, "No timeline entries yet"),
		React.createElement("p", null, "Send a turn to start this Daedalus thread."),
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
