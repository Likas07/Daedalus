import React, { type ReactNode } from "react";

export type PanelTone = "default" | "inset" | "elevated" | "danger";

export interface PanelProps {
	readonly children: ReactNode;
	readonly title?: ReactNode;
	readonly eyebrow?: ReactNode;
	readonly tone?: PanelTone;
	readonly ariaLabel?: string;
	readonly testId?: string;
}

export function Panel({ children, title, eyebrow, tone = "default", ariaLabel, testId }: PanelProps): ReactNode {
	const header =
		title || eyebrow
			? React.createElement(
					"header",
					{ className: "daedalus-panel-header" },
					eyebrow ? React.createElement("p", { className: "daedalus-panel-eyebrow" }, eyebrow) : null,
					title ? React.createElement("h2", { className: "daedalus-panel-title" }, title) : null,
				)
			: null;

	return React.createElement(
		"section",
		{
			"aria-label": ariaLabel,
			"data-tone": tone,
			"data-testid": testId,
			className: `daedalus-panel daedalus-panel-${tone}`,
		},
		header,
		React.createElement("div", { className: "daedalus-panel-body" }, children),
	);
}
