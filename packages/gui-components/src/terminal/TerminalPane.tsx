import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type ReactNode } from "react";

const terminalInputName = "terminal-input";

type TerminalFormSubmitEvent = {
	preventDefault(): void;
	readonly currentTarget: { readonly elements: { namedItem(name: string): unknown } };
};

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
	if (!context) return renderEmptyTerminalPane();

	const terminalId = context.terminalId;
	const disabled = isTerminalDisabled(context.status);
	const output = chunks.map((chunk) => chunk.text).join("");
	const inputId = `${terminalInputName}-${terminalId}`;

	return React.createElement(
		"article",
		{
			className: `daedalus-terminal-pane daedalus-terminal-${context.status}`,
			"aria-label": `${context.title} terminal`,
			"data-testid": "terminal-pane",
		},
		React.createElement(
			"header",
			{ className: "daedalus-terminal-pane-header" },
			React.createElement(
				"div",
				{ className: "daedalus-terminal-context" },
				React.createElement("p", { className: "daedalus-terminal-eyebrow" }, "Active terminal"),
				React.createElement("strong", null, context.title),
				React.createElement("span", { className: "daedalus-terminal-cwd" }, context.cwd),
			),
			React.createElement(
				"div",
				{ className: "daedalus-terminal-toolbar" },
				React.createElement(
					"span",
					{
						className: "daedalus-terminal-status",
						"aria-label": `Terminal status: ${context.status}`,
						"data-testid": "terminal-status",
					},
					context.status,
				),
				React.createElement(
					"button",
					{ type: "button", onClick: () => void onReconnect?.(terminalId) },
					isReplaying ? "Replaying…" : "Replay",
				),
				React.createElement(
					"button",
					{ type: "button", disabled, onClick: () => void onClose?.(terminalId) },
					"Close",
				),
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
		isReplaying
			? React.createElement(
					"p",
					{ className: "daedalus-terminal-replay-state", role: "status" },
					"Replaying terminal output…",
				)
			: null,
		React.createElement(
			"div",
			{ className: "daedalus-terminal-output-shell" },
			React.createElement(
				"pre",
				{
					className: "daedalus-terminal-output",
					"aria-label": "Terminal output",
					"data-testid": "terminal-output",
				},
				output,
			),
		),
		React.createElement(
			"form",
			{
				className: "daedalus-terminal-input-row",
				onSubmit: (event: TerminalFormSubmitEvent) => {
					event.preventDefault();
					const input = event.currentTarget.elements.namedItem(terminalInputName) as { value?: string } | null;
					if (input?.value) void onSendInput?.(terminalId, input.value);
					if (input) input.value = "";
				},
			},
			React.createElement("label", { htmlFor: inputId }, "Input"),
			React.createElement("input", {
				id: inputId,
				name: terminalInputName,
				disabled,
				placeholder: disabled ? "Terminal is not accepting input" : "Send input",
				autoComplete: "off",
			}),
			React.createElement("button", { type: "submit", disabled }, "Send"),
		),
	);
}

function renderEmptyTerminalPane(): ReactNode {
	return React.createElement(
		"article",
		{
			className: "daedalus-terminal-pane daedalus-terminal-empty-state",
			"aria-label": "Terminal surface",
			"data-testid": "terminal-pane",
		},
		React.createElement(
			"header",
			{ className: "daedalus-terminal-pane-header" },
			React.createElement(
				"div",
				{ className: "daedalus-terminal-context" },
				React.createElement("p", { className: "daedalus-terminal-eyebrow" }, "Active terminal"),
				React.createElement("strong", null, "No active terminal"),
			),
			React.createElement(
				"span",
				{
					className: "daedalus-terminal-status",
					"aria-label": "Terminal status: idle",
					"data-testid": "terminal-status",
				},
				"idle",
			),
		),
		React.createElement(
			"p",
			{ className: "daedalus-terminal-empty" },
			"Open a terminal to stream command output and send input from this drawer.",
		),
		React.createElement(
			"pre",
			{
				className: "daedalus-terminal-output",
				"aria-label": "Terminal output",
				"data-testid": "terminal-output",
			},
			"",
		),
	);
}

function isTerminalDisabled(status: protocolV1.TerminalContextStatus): boolean {
	return status === "closed" || status === "killed" || status === "guard-blocked";
}
