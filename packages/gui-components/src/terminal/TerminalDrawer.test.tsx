import { describe, expect, test } from "bun:test";
import type { TerminalDrawerState } from "@daedalus-pi/gui-core/terminal/reducer";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { TerminalDrawer } from "./TerminalDrawer";

type TerminalContext = TerminalDrawerState["contextsById"][string];
type TerminalChunk = TerminalDrawerState["outputByTerminalId"][string][number];
type TerminalFailure = TerminalDrawerState["failureByTerminalId"][string];
type TestElement = {
	readonly type: string | ((props: Record<string, unknown>) => unknown);
	readonly props?: Record<string, unknown> | null;
};

const baseTimestamp = "2026-04-30T12:00:00Z";

function makeContext(overrides: Partial<TerminalContext> = {}): TerminalContext {
	const terminalId = overrides.terminalId ?? "terminal-1";
	return {
		terminalId,
		workspaceTargetId: "workspace-1",
		threadId: "thread-1",
		title: "Agent shell",
		status: "running",
		cwd: "/home/likas/Research/Daedalus",
		rows: 24,
		cols: 80,
		createdAt: baseTimestamp,
		updatedAt: baseTimestamp,
		...overrides,
	};
}

function makeChunk(text: string, seq = 1): TerminalChunk {
	return { cursor: { seq }, text, byteLength: text.length };
}

function makeFailure(overrides: Partial<TerminalFailure> = {}): TerminalFailure {
	return {
		ok: false,
		code: "io-error",
		terminalId: "terminal-1",
		workspaceTargetId: "workspace-1",
		threadId: "thread-1",
		message: "Terminal failed",
		...overrides,
	};
}

function makeState(
	contexts: readonly TerminalContext[] = [],
	overrides: Partial<TerminalDrawerState> = {},
): TerminalDrawerState {
	return {
		isOpen: contexts.length > 0,
		activeTerminalId: contexts[0]?.terminalId,
		contextsById: Object.fromEntries(
			contexts.map((context) => [context.terminalId, context]),
		) as TerminalDrawerState["contextsById"],
		terminalOrder: contexts.map((context) => context.terminalId),
		outputByTerminalId: {},
		failureByTerminalId: {},
		...overrides,
	};
}

function isTestElement(value: unknown): value is TestElement {
	return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function resolveNode(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(resolveNode);
	if (!isTestElement(node)) return node;
	if (typeof node.type === "function") return resolveNode(node.type(node.props ?? {}));
	return { ...node, props: { ...(node.props ?? {}), children: resolveNode(node.props?.children) } };
}

function collectElements(node: unknown, type: string): TestElement[] {
	const elements: TestElement[] = [];
	const visit = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (!isTestElement(value)) return;
		if (value.type === type) elements.push(value);
		visit(value.props?.children);
	};
	visit(node);
	return elements;
}

function textContent(node: unknown): string {
	if (Array.isArray(node)) return node.map(textContent).join("");
	if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
	if (!isTestElement(node)) return "";
	return textContent(node.props?.children);
}

function findButton(root: unknown, label: string): TestElement {
	const button = collectElements(root, "button").find((element) => textContent(element.props?.children) === label);
	if (!button) throw new Error(`Expected to find button ${label}`);
	return button;
}

function click(button: TestElement): void {
	const onClick = button.props?.onClick;
	if (typeof onClick !== "function")
		throw new Error(`Expected ${textContent(button.props?.children)} to be clickable`);
	onClick();
}

describe("TerminalDrawer", () => {
	test("renders an empty T3-style terminal surface", () => {
		const markup = renderMarkup(React.createElement(TerminalDrawer, { state: makeState() }));

		expectMarkupContains(markup, [
			'aria-label="Terminal drawer"',
			'data-open="false"',
			'data-testid="terminal-drawer"',
			"Workspace",
			"Terminal",
			"No active terminal",
			"0 terminals",
			"Open terminal",
			'data-testid="terminal-pane"',
			'data-testid="terminal-status"',
			"idle",
			'data-testid="terminal-output"',
			"Open a terminal to stream command output and send input from this drawer.",
		]);
	});

	test("renders an opened running terminal with context, controls, input, and monospaced output", () => {
		const context = makeContext();
		const markup = renderMarkup(
			React.createElement(TerminalDrawer, {
				state: makeState([context], {
					outputByTerminalId: {
						[context.terminalId]: [makeChunk("$ bun test\\n"), makeChunk("pass 2 tests\\n", 2)],
					},
				}),
			}),
		);

		expectMarkupContains(markup, [
			'data-open="true"',
			'data-testid="terminal-pane"',
			"Active terminal",
			"Agent shell",
			"/home/likas/Research/Daedalus",
			'data-testid="terminal-status"',
			"running",
			"Replay",
			"Close",
			'class="daedalus-terminal-output"',
			'data-testid="terminal-output"',
			"$ bun test",
			"pass 2 tests",
			"Input",
			"Send input",
			"Send",
		]);
	});

	test("wires open, select, replay, close, and send input callbacks", () => {
		const primary = makeContext({ terminalId: "terminal-1", title: "Agent shell" });
		const secondary = makeContext({ terminalId: "terminal-2", title: "Build server", status: "idle" });
		const calls: string[] = [];
		const root = resolveNode(
			React.createElement(TerminalDrawer, {
				state: makeState([primary, secondary]),
				onOpen: () => calls.push("open"),
				onSelect: (terminalId: string) => calls.push(`select:${terminalId}`),
				onReconnectTerminal: (terminalId: string) => calls.push(`replay:${terminalId}`),
				onCloseTerminal: (terminalId: string) => calls.push(`close:${terminalId}`),
				onSendInput: (terminalId: string, input: string) => calls.push(`send:${terminalId}:${input}`),
			}),
		);

		click(findButton(root, "Open terminal"));
		click(findButton(root, "Build server"));
		click(findButton(root, "Replay"));
		click(findButton(root, "Close"));

		const form = collectElements(root, "form")[0];
		const submittedInput = { value: "echo ready\n" };
		let prevented = false;
		const onSubmit = form?.props?.onSubmit;
		if (typeof onSubmit !== "function") throw new Error("Expected terminal form to handle submit");
		onSubmit({
			preventDefault: () => {
				prevented = true;
			},
			currentTarget: {
				elements: { namedItem: (name: string) => (name === "terminal-input" ? submittedInput : null) },
			},
		});

		expect(prevented).toBe(true);
		expect(submittedInput.value).toBe("");
		expect(calls).toEqual([
			"open",
			"select:terminal-2",
			"replay:terminal-1",
			"close:terminal-1",
			"send:terminal-1:echo ready\n",
		]);
	});

	test("renders guard and failure banners", () => {
		const context = makeContext({
			status: "guard-blocked",
			guard: {
				code: "command-blocked",
				message: "rm -rf is blocked by workspace policy",
				workspaceTargetId: "workspace-1",
				threadId: "thread-1",
			},
		});
		const markup = renderMarkup(
			React.createElement(TerminalDrawer, {
				state: makeState([context], {
					failureByTerminalId: {
						[context.terminalId]: makeFailure({
							code: "command-blocked",
							message: "Command blocked before it reached the PTY",
						}),
					},
				}),
			}),
		);

		expectMarkupContains(markup, [
			'data-testid="terminal-guard"',
			"command-blocked: rm -rf is blocked by workspace policy",
			'data-testid="terminal-failure"',
			"command-blocked: Command blocked before it reached the PTY",
		]);
	});

	test("disables close and input controls for closed and killed terminals", () => {
		for (const status of ["closed", "killed"] as const) {
			const context = makeContext({ terminalId: `terminal-${status}`, status });
			const root = resolveNode(React.createElement(TerminalDrawer, { state: makeState([context]) }));
			const close = findButton(root, "Close");
			const send = findButton(root, "Send");
			const replay = findButton(root, "Replay");
			const input = collectElements(root, "input").find((element) => element.props?.name === "terminal-input");

			expect(close.props?.disabled).toBe(true);
			expect(send.props?.disabled).toBe(true);
			expect(input?.props?.disabled).toBe(true);
			expect(replay.props?.disabled).toBeUndefined();
		}
	});
});
