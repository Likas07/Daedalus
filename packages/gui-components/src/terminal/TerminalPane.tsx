import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type ReactNode } from "react";

export interface TerminalPaneProps {
	readonly context?: protocolV1.TerminalContext;
	readonly chunks?: readonly protocolV1.TerminalReplayOutputChunk[];
	readonly failure?: protocolV1.TerminalFailure;
	readonly isReplaying?: boolean;
	readonly onSendInput?: (terminalId: string, input: string) => void | Promise<void>;
	readonly onClose?: (terminalId: string) => void | Promise<void>;
	readonly onReconnect?: (terminalId: string) => void | Promise<void>;
}

export function TerminalPane({
	context,
	chunks = [],
	failure,
	isReplaying,
	onSendInput,
	onClose,
	onReconnect,
}: TerminalPaneProps): ReactNode {
	if (!context) return React.createElement("p", { className: "daedalus-terminal-empty" }, "No terminal is open");
	const terminalId = context.terminalId;
	const disabled = context.status === "closed" || context.status === "killed" || context.status === "guard-blocked";
	return React.createElement(
		"article",
		{ className: `daedalus-terminal-pane daedalus-terminal-${context.status}`, "data-testid": "terminal-pane" },
		React.createElement(
			"header",
			null,
			React.createElement("strong", null, context.title),
			React.createElement("span", { "data-testid": "terminal-status" }, context.status),
			React.createElement("button", { type: "button", onClick: () => void onReconnect?.(terminalId) }, "Replay"),
			React.createElement(
				"button",
				{ type: "button", disabled, onClick: () => void onClose?.(terminalId) },
				"Close",
			),
		),
		context.guard
			? React.createElement(
					"p",
					{ role: "alert", className: "daedalus-terminal-guard", "data-testid": "terminal-guard" },
					`${context.guard.code}: ${context.guard.message}`,
				)
			: null,
		failure
			? React.createElement(
					"p",
					{ role: "alert", className: "daedalus-terminal-failure", "data-testid": "terminal-failure" },
					`${failure.code}: ${failure.message}`,
				)
			: null,
		isReplaying ? React.createElement("p", null, "Replaying terminal output…") : null,
		React.createElement(
			"pre",
			{ className: "daedalus-terminal-output", "data-testid": "terminal-output" },
			chunks.map((chunk) => chunk.text).join(""),
		),
		React.createElement(
			"form",
			{
				onSubmit: (event: {
					preventDefault(): void;
					currentTarget: { elements: { namedItem(name: string): unknown } };
				}) => {
					event.preventDefault();
					const input = event.currentTarget.elements.namedItem("terminal-input") as { value?: string } | null;
					if (input?.value) void onSendInput?.(terminalId, input.value);
					if (input) input.value = "";
				},
			},
			React.createElement("input", { name: "terminal-input", disabled, placeholder: "Send input" }),
			React.createElement("button", { type: "submit", disabled }, "Send"),
		),
	);
}
