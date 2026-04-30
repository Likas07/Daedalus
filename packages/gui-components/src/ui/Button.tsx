import React, { type ReactNode } from "react";

export type ButtonTone = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps {
	readonly children: ReactNode;
	readonly type?: "button" | "submit";
	readonly tone?: ButtonTone;
	readonly size?: ButtonSize;
	readonly disabled?: boolean;
	readonly ariaLabel?: string;
	readonly testId?: string;
	readonly onClick?: () => void | Promise<void>;
}

export function Button({
	children,
	type = "button",
	tone = "secondary",
	size = "md",
	disabled,
	ariaLabel,
	testId,
	onClick,
}: ButtonProps): ReactNode {
	return React.createElement(
		"button",
		{
			type: type === "submit" ? "submit" : "button",
			disabled,
			onClick,
			"aria-label": ariaLabel,
			"data-tone": tone,
			"data-size": size,
			"data-testid": testId,
			className: `daedalus-button daedalus-button-${tone} daedalus-button-${size}`,
		},
		children,
	);
}
