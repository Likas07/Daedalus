import type { TerminalDrawerState } from "@daedalus-pi/gui-core/terminal/reducer";
import {
	selectActiveTerminalContext,
	selectActiveTerminalOutput,
	selectTerminalContexts,
} from "@daedalus-pi/gui-core/terminal/reducer";
import React, { type ReactNode } from "react";
import { TerminalPane } from "./TerminalPane";

export interface TerminalDrawerProps {
	readonly state: TerminalDrawerState;
	readonly onOpen?: () => void | Promise<void>;
	readonly onSelect?: (terminalId: string) => void | Promise<void>;
	readonly onSendInput?: (terminalId: string, input: string) => void | Promise<void>;
	readonly onCloseTerminal?: (terminalId: string) => void | Promise<void>;
	readonly onReconnectTerminal?: (terminalId: string) => void | Promise<void>;
}

export function TerminalDrawer({
	state,
	onOpen,
	onSelect,
	onSendInput,
	onCloseTerminal,
	onReconnectTerminal,
}: TerminalDrawerProps): ReactNode {
	const contexts = selectTerminalContexts(state);
	const active = selectActiveTerminalContext(state);
	const activeSummary = active ? `${active.title} · ${active.cwd}` : "No active terminal";

	return React.createElement(
		"section",
		{
			className: "daedalus-terminal-drawer",
			"aria-label": "Terminal drawer",
			"data-open": state.isOpen ? "true" : "false",
			"data-testid": "terminal-drawer",
		},
		React.createElement(
			"header",
			{ className: "daedalus-terminal-drawer-toolbar" },
			React.createElement(
				"div",
				{ className: "daedalus-terminal-drawer-title" },
				React.createElement("p", { className: "daedalus-terminal-eyebrow" }, "Workspace"),
				React.createElement("h2", null, "Terminal"),
				React.createElement("p", { className: "daedalus-terminal-active-summary" }, activeSummary),
			),
			React.createElement(
				"div",
				{ className: "daedalus-terminal-drawer-actions" },
				React.createElement(
					"span",
					{
						className: "daedalus-terminal-context-count",
						"aria-label": `${contexts.length} terminal contexts`,
					},
					`${contexts.length} ${contexts.length === 1 ? "terminal" : "terminals"}`,
				),
				React.createElement("button", { type: "button", onClick: () => void onOpen?.() }, "Open terminal"),
			),
		),
		state.error
			? React.createElement("p", { role: "alert", className: "daedalus-terminal-failure" }, state.error)
			: null,
		contexts.length > 1
			? React.createElement(
					"nav",
					{ className: "daedalus-terminal-context-tabs", "aria-label": "Terminal contexts" },
					contexts.map((context) =>
						React.createElement(
							"button",
							{
								key: context.terminalId,
								type: "button",
								"aria-label": `${context.title} terminal (${context.status})`,
								"aria-pressed": context.terminalId === active?.terminalId,
								onClick: () => void onSelect?.(context.terminalId),
							},
							context.title,
						),
					),
				)
			: null,
		React.createElement(TerminalPane, {
			context: active,
			chunks: selectActiveTerminalOutput(state),
			failure: active ? state.failureByTerminalId[active.terminalId] : undefined,
			isReplaying: state.replayingTerminalId === active?.terminalId,
			onSendInput,
			onClose: onCloseTerminal,
			onReconnect: onReconnectTerminal,
		}),
	);
}
