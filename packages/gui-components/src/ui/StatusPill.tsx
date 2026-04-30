import React, { type ReactNode } from "react";

export type StatusPillTone = "idle" | "running" | "success" | "warning" | "danger";

export interface StatusPillProps {
	readonly children: ReactNode;
	readonly tone?: StatusPillTone;
	readonly ariaLabel?: string;
	readonly testId?: string;
}

export function StatusPill({ children, tone = "idle", ariaLabel, testId }: StatusPillProps): ReactNode {
	return React.createElement(
		"span",
		{
			"aria-label": ariaLabel,
			"data-tone": tone,
			"data-testid": testId,
			className: `daedalus-status-pill daedalus-status-pill-${tone}`,
			role: "status",
		},
		React.createElement("span", { "aria-hidden": true, className: "daedalus-status-pill-dot" }),
		React.createElement("span", { className: "daedalus-status-pill-label" }, children),
	);
}
