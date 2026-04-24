import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "../src/modes/interactive/components/settings-selector.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function makeConfig(): SettingsConfig {
	return {
		autoCompact: true,
		showImages: true,
		autoResizeImages: true,
		blockImages: false,
		enableSkillCommands: true,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		transport: "sse",
		thinkingLevel: "medium",
		fastMode: false,
		availableThinkingLevels: ["off", "low", "medium", "high"],
		currentTheme: "dark",
		availableThemes: ["dark", "light"],
		hideThinkingBlock: false,
		collapseChangelog: false,
		doubleEscapeAction: "tree",
		treeFilterMode: "default",
		showHardwareCursor: false,
		editorPaddingX: 0,
		autocompleteMaxVisible: 5,
		quietStartup: false,
		clearOnShrink: false,
		subagents: {
			delegationAggressiveness: "balanced",
			maxDepth: 2,
			maxConcurrency: 4,
			backgroundRoles: ["sage"],
			branchIsolation: {
				enabled: true,
				mutationThreshold: "high-risk",
				namingTemplate: "subagent/{parentBranch}/{agent}/{runId}",
			},
			roles: [],
			agents: {},
		},
	};
}

function makeCallbacks(): SettingsCallbacks {
	return {
		onAutoCompactChange: vi.fn(),
		onShowImagesChange: vi.fn(),
		onAutoResizeImagesChange: vi.fn(),
		onBlockImagesChange: vi.fn(),
		onEnableSkillCommandsChange: vi.fn(),
		onSteeringModeChange: vi.fn(),
		onFollowUpModeChange: vi.fn(),
		onTransportChange: vi.fn(),
		onThinkingLevelChange: vi.fn(),
		onFastModeChange: vi.fn(),
		onThemeChange: vi.fn(),
		onThemePreview: vi.fn(),
		onHideThinkingBlockChange: vi.fn(),
		onCollapseChangelogChange: vi.fn(),
		onDoubleEscapeActionChange: vi.fn(),
		onTreeFilterModeChange: vi.fn(),
		onShowHardwareCursorChange: vi.fn(),
		onEditorPaddingXChange: vi.fn(),
		onAutocompleteMaxVisibleChange: vi.fn(),
		onQuietStartupChange: vi.fn(),
		onClearOnShrinkChange: vi.fn(),
		onCancel: vi.fn(),
	};
}

describe("SettingsSelectorComponent tabs", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("renders the header tabs and switches active content", () => {
		const selector = new SettingsSelectorComponent(makeConfig(), makeCallbacks());

		let render = stripAnsi(selector.render(120).join("\n"));
		expect(render).toContain("General");
		expect(render).toContain("Display");
		expect(render).toContain("Behavior");
		expect(render).toContain("Auto-compact");

		selector.handleInput("\x1b[C");
		selector.handleInput("\x1b[C");
		render = stripAnsi(selector.render(120).join("\n"));
		expect(render).toContain("Thinking level");
		expect(render).toContain("Fast mode");
		expect(render).not.toContain("Auto-compact");
	});

	it("adds a Subagents tab with runtime defaults", () => {
		const selector = new SettingsSelectorComponent(makeConfig(), makeCallbacks());
		selector.handleInput("\x1b[C");
		selector.handleInput("\x1b[C");
		selector.handleInput("\x1b[C");

		const render = stripAnsi(selector.render(120).join("\n"));
		expect(render).toContain("Subagents");
		expect(render).toContain("Delegation aggressiveness");
		expect(render).toContain("Branch isolation threshold");
		expect(render).toContain("Role overrides");
	});
});
