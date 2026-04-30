import React, { type ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { StatusPill } from "../ui/StatusPill";

type RefObject<T> = { readonly current: T };
type FormSubmitEvent = { preventDefault(): void; readonly currentTarget: HTMLFormElement };

export interface ComposerProps {
	readonly disabled?: boolean;
	readonly isRunning?: boolean;
	readonly inputRef?: RefObject<HTMLTextAreaElement | null>;
	readonly onSubmit: (prompt: string) => void | Promise<void>;
	readonly onCancel?: () => void | Promise<void>;
}

export function Composer({ disabled, isRunning, inputRef, onSubmit, onCancel }: ComposerProps): ReactNode {
	const statusLabel = isRunning ? "Running" : "Ready";
	const submitLabel = isRunning ? "Send follow-up" : "Send turn";

	const handleSubmit = (event: FormSubmitEvent) => {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const prompt = String(data.get("prompt") ?? "").trim();
		if (!prompt) return;
		void onSubmit(prompt);
		form.reset();
	};

	return React.createElement(
		"form",
		{
			"aria-label": "Thread composer",
			className: "daedalus-thread-composer daedalus-thread-composer-t3",
			onSubmit: handleSubmit,
			"data-testid": "thread-composer",
		},
		React.createElement(
			"div",
			{ className: "daedalus-thread-composer-frame" },
			React.createElement(
				"div",
				{ className: "daedalus-thread-composer-editor" },
				React.createElement("label", { htmlFor: "daedalus-thread-prompt" }, "Message Daedalus"),
				React.createElement("textarea", {
					id: "daedalus-thread-prompt",
					name: "prompt",
					ref: inputRef,
					disabled,
					placeholder: "Ask Daedalus to keep working in this thread…",
					rows: 5,
					"data-testid": "thread-composer-prompt",
				}),
			),
			React.createElement(
				"footer",
				{ className: "daedalus-thread-composer-toolbar" },
				React.createElement(
					"div",
					{ className: "daedalus-thread-composer-chips", "aria-label": "Composer mode and status" },
					React.createElement(Badge, { tone: "accent", ariaLabel: "Composer mode: thread" }, "Thread mode"),
					React.createElement(
						StatusPill,
						{
							tone: isRunning ? "running" : "idle",
							ariaLabel: `Agent status: ${statusLabel}`,
							testId: "thread-composer-status",
						},
						statusLabel,
					),
					React.createElement(Badge, { tone: "neutral", ariaLabel: "Plain text textarea composer" }, "Plain text"),
				),
				React.createElement(
					"div",
					{ className: "daedalus-thread-composer-controls" },
					onCancel
						? React.createElement(
								Button,
								{
									type: "button",
									tone: "danger",
									size: "sm",
									disabled: !isRunning,
									onClick: () => void onCancel(),
									ariaLabel: "Stop running turn",
									testId: "thread-stop",
								},
								"Stop",
							)
						: null,
					React.createElement(
						Button,
						{
							type: "submit",
							tone: "primary",
							size: "sm",
							disabled,
							ariaLabel: submitLabel,
							testId: "thread-send",
						},
						submitLabel,
					),
				),
			),
		),
	);
}
