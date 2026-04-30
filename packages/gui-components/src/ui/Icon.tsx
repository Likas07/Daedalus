import React, { type ReactNode } from "react";

export type IconName = "approval" | "check" | "diff" | "spark" | "terminal" | "thread" | "warning";
export type IconTone = "default" | "muted" | "success" | "warning" | "danger";

export interface IconProps {
	readonly name: IconName;
	readonly label?: string;
	readonly size?: number;
	readonly tone?: IconTone;
	readonly testId?: string;
}

const iconPaths: Record<IconName, string> = {
	approval: "M9 12l2 2 4-5M5 5h14v14H5z",
	check: "M20 6 9 17l-5-5",
	diff: "M7 7h10M7 12h6M7 17h10M4 4h16v16H4z",
	spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
	terminal: "M5 7l5 5-5 5M12 17h7",
	thread: "M5 6h14v9H8l-3 3z",
	warning: "M12 4l9 16H3zM12 9v4M12 17h.01",
};

export function Icon({ name, label, size = 16, tone = "default", testId }: IconProps): ReactNode {
	return React.createElement(
		"svg",
		{
			"aria-hidden": label ? undefined : true,
			"aria-label": label,
			"data-icon": name,
			"data-testid": testId,
			className: `daedalus-icon daedalus-icon-${name} daedalus-icon-${tone}`,
			fill: "none",
			focusable: false,
			height: size,
			role: label ? "img" : undefined,
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			strokeWidth: 2,
			viewBox: "0 0 24 24",
			width: size,
		},
		React.createElement("path", { d: iconPaths[name] }),
	);
}
