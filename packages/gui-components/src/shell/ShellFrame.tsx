import type { GuiShellState } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { ThreadSidebar } from "./ThreadSidebar";

export interface ShellFrameProps {
	readonly state: GuiShellState;
	readonly children?: ReactNode;
	readonly connectionLabel?: string;
	readonly activeThreadTitle?: string;
}

export function ShellFrame({ state, children, connectionLabel, activeThreadTitle }: ShellFrameProps): ReactNode {
	return React.createElement(
		"section",
		{
			"aria-label": "Daedalus React GUI shell",
			className: "daedalus-shell-frame",
		},
		React.createElement(ThreadSidebar, { activeThreadTitle, connectionLabel, state }),
		React.createElement("div", { className: "daedalus-shell-content", "data-testid": "shell-content" }, children),
	);
}
