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
	return React.createElement(
		"section",
		{ className: "daedalus-terminal-drawer", "aria-label": "Terminal drawer", "data-testid": "terminal-drawer" },
		React.createElement(
			"header",
			null,
			React.createElement("h2", null, "Terminal"),
			React.createElement("button", { type: "button", onClick: () => void onOpen?.() }, "Open terminal"),
		),
		state.error ? React.createElement("p", { role: "alert" }, state.error) : null,
		contexts.length > 1
			? React.createElement(
					"nav",
					{ "aria-label": "Terminal contexts" },
					contexts.map((context) =>
						React.createElement(
							"button",
							{
								key: context.terminalId,
								type: "button",
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
