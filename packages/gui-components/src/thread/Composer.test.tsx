import { describe, expect, test } from "bun:test";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { Composer, type ComposerProps } from "./Composer";

type ComposerFormProps = {
	readonly onSubmit?: (event: { preventDefault(): void; readonly currentTarget: HTMLFormElement }) => void;
	readonly children?: unknown;
};

type ElementProps = Record<string, unknown> & { readonly children?: unknown };
type TestElement<Props extends ElementProps = ElementProps> = { readonly props: Props };

function renderComposer(props: Partial<ComposerProps> = {}): string {
	return renderMarkup(React.createElement(Composer, { onSubmit: () => undefined, ...props }));
}

function isElementWithProps<Props extends ElementProps>(node: unknown): node is TestElement<Props> {
	return typeof node === "object" && node !== null && "props" in node;
}

function getComposerForm(props: ComposerProps): TestElement<ComposerFormProps> {
	const element = Composer(props);
	if (!isElementWithProps<ComposerFormProps>(element)) throw new Error("Composer did not render a form element");
	return element;
}

function findElementByTestId(node: unknown, testId: string): TestElement<ElementProps> | undefined {
	if (!isElementWithProps<ElementProps>(node)) return undefined;
	if (node.props["data-testid"] === testId || node.props.testId === testId) return node;

	const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
	for (const child of children) {
		const match = findElementByTestId(child, testId);
		if (match) return match;
	}
	return undefined;
}

function withPromptFormData(prompt: string | null, run: () => void): void {
	const formDataTarget = globalThis as typeof globalThis & { FormData: typeof FormData };
	const OriginalFormData = formDataTarget.FormData;

	class MockFormData {
		get(name: string): FormDataEntryValue | null {
			return name === "prompt" ? prompt : null;
		}
	}

	formDataTarget.FormData = MockFormData as unknown as typeof FormData;
	try {
		run();
	} finally {
		formDataTarget.FormData = OriginalFormData;
	}
}

describe("Composer", () => {
	test("renders a T3-style rounded frame with editor, toolbar, chips, and send/stop controls", () => {
		const markup = renderComposer({ isRunning: true, onCancel: () => undefined });

		expectMarkupContains(markup, [
			'aria-label="Thread composer"',
			'class="daedalus-thread-composer daedalus-thread-composer-t3"',
			'class="daedalus-thread-composer-frame"',
			'class="daedalus-thread-composer-editor"',
			"<textarea",
			'name="prompt"',
			'data-testid="thread-composer-prompt"',
			'class="daedalus-thread-composer-toolbar"',
			'class="daedalus-thread-composer-chips"',
			'aria-label="Composer mode and status"',
			"Thread mode",
			'data-testid="thread-composer-status"',
			"Running",
			"Plain text",
			'class="daedalus-thread-composer-controls"',
			'data-testid="thread-stop"',
			'data-testid="thread-send"',
			"Send follow-up",
		]);
		expect(markup).not.toContain("contenteditable");
	});

	test("renders idle and disabled state without requiring a cancel handler", () => {
		const markup = renderComposer({ disabled: true });

		expectMarkupContains(markup, ["Message Daedalus", "Ready", "Send turn", "disabled", 'data-testid="thread-send"']);
		expect(markup).not.toContain('data-testid="thread-stop"');
	});

	test("passes inputRef through to the textarea", () => {
		const inputRef = { current: null };
		const formElement = getComposerForm({ inputRef, onSubmit: () => undefined });
		const promptEditor = findElementByTestId(formElement, "thread-composer-prompt");

		expect(promptEditor?.props.ref).toBe(inputRef);
	});

	test("trims submitted prompts, calls onSubmit, and resets the form", () => {
		const prompts: string[] = [];
		let prevented = false;
		let resetCount = 0;
		const formElement = getComposerForm({
			onSubmit: (prompt) => {
				prompts.push(prompt);
			},
		});

		withPromptFormData("  keep working in this thread  ", () => {
			formElement.props.onSubmit?.({
				preventDefault: () => {
					prevented = true;
				},
				currentTarget: {
					reset: () => {
						resetCount += 1;
					},
				} as HTMLFormElement,
			});
		});

		expect(prevented).toBe(true);
		expect(prompts).toEqual(["keep working in this thread"]);
		expect(resetCount).toBe(1);
	});

	test("ignores empty submitted prompts without resetting the form", () => {
		const prompts: string[] = [];
		let prevented = false;
		let resetCount = 0;
		const formElement = getComposerForm({
			onSubmit: (prompt) => {
				prompts.push(prompt);
			},
		});

		withPromptFormData("   \n\t  ", () => {
			formElement.props.onSubmit?.({
				preventDefault: () => {
					prevented = true;
				},
				currentTarget: {
					reset: () => {
						resetCount += 1;
					},
				} as HTMLFormElement,
			});
		});

		expect(prevented).toBe(true);
		expect(prompts).toEqual([]);
		expect(resetCount).toBe(0);
	});

	test("wires the optional stop control to onCancel while running", () => {
		let cancelCount = 0;
		const formElement = getComposerForm({
			isRunning: true,
			onSubmit: () => undefined,
			onCancel: () => {
				cancelCount += 1;
			},
		});
		const stopControl = findElementByTestId(formElement, "thread-stop");

		expect(stopControl).toBeDefined();
		expect(stopControl?.props.disabled).toBe(false);
		(stopControl?.props.onClick as (() => void) | undefined)?.();
		expect(cancelCount).toBe(1);
	});
});
