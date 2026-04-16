import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SubagentOverrideSelectorComponent } from "../src/modes/interactive/components/subagent-override-selector.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

describe("SubagentOverrideSelectorComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("shows bundled roles with summaries and updates thinking level", () => {
		const onThinking = vi.fn();
		const selector = new SubagentOverrideSelectorComponent(
			[
				{ name: "scout", description: "Read-only reconnaissance" },
				{ name: "worker", description: "Implementation role" },
			],
			{ scout: { thinkingLevel: "low" } },
			{
				onModelChange: vi.fn(),
				onThinkingLevelChange: onThinking,
				onClear: vi.fn(),
				validateModelRef: () => undefined,
				onDone: vi.fn(),
			},
		);

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain("scout");
		expect(output).toContain("thinking: low");

		selector.handleInput("\r");
		selector.handleInput("\x1b[B");
		selector.handleInput("\r");

		expect(onThinking).toHaveBeenCalledWith("scout", "medium");
	});

	it("shows execution and isolation preferences in the role summary", () => {
		const selector = new SubagentOverrideSelectorComponent(
			[{ name: "explore", description: "Read-only reconnaissance" }],
			{
				explore: {
					model: "anthropic/claude-sonnet-4-5",
					thinkingLevel: "low",
					executionModePreference: "background",
					isolationPreference: "shared-branch",
				},
			},
			{
				onModelChange: vi.fn(),
				onThinkingLevelChange: vi.fn(),
				onExecutionModeChange: vi.fn(),
				onIsolationPreferenceChange: vi.fn(),
				onClear: vi.fn(),
				validateModelRef: () => undefined,
				onDone: vi.fn(),
			},
		);

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain("mode: background");
		expect(output).toContain("isolation: shared-branch");
	});

	it("shows validation errors for bad model refs", () => {
		const selector = new SubagentOverrideSelectorComponent(
			[{ name: "scout", description: "Read-only reconnaissance" }],
			{},
			{
				onModelChange: vi.fn(),
				onThinkingLevelChange: vi.fn(),
				onClear: vi.fn(),
				validateModelRef: () => "Unknown model: bad/ref",
				onDone: vi.fn(),
			},
		);

		selector.handleInput("\r");
		selector.handleInput("\r");
		selector.handleInput("b");
		selector.handleInput("a");
		selector.handleInput("d");
		selector.handleInput("/");
		selector.handleInput("r");
		selector.handleInput("e");
		selector.handleInput("f");
		selector.handleInput("\r");

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain("Unknown model: bad/ref");
	});
});
