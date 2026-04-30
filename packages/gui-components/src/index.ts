import type { GuiShellState } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";

export interface ShellFrameProps {
	readonly state: GuiShellState;
	readonly children?: ReactNode;
}

export function ShellFrame({ state, children }: ShellFrameProps): ReactNode {
	const projectCount = state.projects.length;
	const threadCount = state.threads.length;

	return React.createElement(
		"section",
		{
			"aria-label": "Daedalus React GUI shell",
			className: "daedalus-shell-frame",
		},
		React.createElement("h1", null, "Daedalus"),
		React.createElement("p", null, `${projectCount} projects · ${threadCount} threads`),
		children,
	);
}

export * from "./approval/ApprovalCard";
export * from "./approval/ApprovalQueue";
export * from "./diff/DiffFileView";
export * from "./diff/DiffPanel";
export * from "./terminal/TerminalDrawer";
export * from "./terminal/TerminalPane";
export * from "./thread/Composer";
export * from "./thread/EmptyStates";
export * from "./thread/ThreadWorkspace";
export * from "./thread/Timeline";
export * from "./ui";
