import React, { type ReactNode } from "react";

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
		{ className: "daedalus-thread-composer", onSubmit: handleSubmit, "data-testid": "thread-composer" },
		React.createElement("label", { htmlFor: "daedalus-thread-prompt" }, "Message Daedalus"),
		React.createElement("textarea", {
			id: "daedalus-thread-prompt",
			name: "prompt",
			ref: inputRef,
			disabled,
			placeholder: "Ask Daedalus to keep working in this thread…",
			rows: 4,
		}),
		React.createElement(
			"div",
			{ className: "daedalus-thread-composer-actions" },
			React.createElement("button", { type: "submit", disabled }, isRunning ? "Send follow-up" : "Send turn"),
			onCancel
				? React.createElement(
						"button",
						{
							type: "button",
							disabled: !isRunning,
							onClick: () => void onCancel(),
							"data-testid": "thread-stop",
						},
						"Stop",
					)
				: null,
		),
	);
}
