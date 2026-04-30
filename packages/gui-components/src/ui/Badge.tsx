import React, { type ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
	readonly children: ReactNode;
	readonly tone?: BadgeTone;
	readonly ariaLabel?: string;
	readonly testId?: string;
}

export function Badge({ children, tone = "neutral", ariaLabel, testId }: BadgeProps): ReactNode {
	return React.createElement(
		"span",
		{
			"aria-label": ariaLabel,
			"data-tone": tone,
			"data-testid": testId,
			className: `daedalus-badge daedalus-badge-${tone}`,
		},
		children,
	);
}
