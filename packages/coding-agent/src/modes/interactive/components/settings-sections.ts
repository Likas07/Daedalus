import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type { SettingItem } from "@daedalus-pi/tui";
import type { SettingsCallbacks, SettingsConfig } from "./settings-selector.js";
import { SelectSubmenu, THINKING_DESCRIPTIONS } from "./settings-submenus.js";
import { SubagentOverrideSelectorComponent } from "./subagent-override-selector.js";

export interface SettingsSection {
	id: "general" | "display" | "behavior" | "subagents";
	label: string;
	items: SettingItem[];
}

export function buildBaseSettingsSections(
	config: SettingsConfig,
	callbacks: SettingsCallbacks,
	options: { supportsImages: boolean },
): SettingsSection[] {
	const generalItems: SettingItem[] = [
		{
			id: "autocompact",
			label: "Auto-compact",
			description: "Automatically compact context when it gets too large",
			currentValue: config.autoCompact ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "steering-mode",
			label: "Steering mode",
			description:
				"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
			currentValue: config.steeringMode,
			values: ["one-at-a-time", "all"],
		},
		{
			id: "follow-up-mode",
			label: "Follow-up mode",
			description:
				"Alt+Enter queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
			currentValue: config.followUpMode,
			values: ["one-at-a-time", "all"],
		},
		{
			id: "transport",
			label: "Transport",
			description: "Preferred transport for providers that support multiple transports",
			currentValue: config.transport,
			values: ["sse", "websocket", "auto"],
		},
		{
			id: "skill-commands",
			label: "Skill commands",
			description: "Register skills as /skill:name commands",
			currentValue: config.enableSkillCommands ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "collapse-changelog",
			label: "Collapse changelog",
			description: "Show condensed changelog after updates",
			currentValue: config.collapseChangelog ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "quiet-startup",
			label: "Quiet startup",
			description: "Disable verbose printing at startup",
			currentValue: config.quietStartup ? "true" : "false",
			values: ["true", "false"],
		},
	];

	const displayItems: SettingItem[] = [
		{
			id: "theme",
			label: "Theme",
			description: "Color theme for the interface",
			currentValue: config.currentTheme,
			submenu: (currentValue, done) =>
				new SelectSubmenu(
					"Theme",
					"Select color theme",
					config.availableThemes.map((themeName) => ({ value: themeName, label: themeName })),
					currentValue,
					(value) => {
						callbacks.onThemeChange(value);
						done(value);
					},
					() => {
						callbacks.onThemePreview?.(currentValue);
						done();
					},
					(value) => callbacks.onThemePreview?.(value),
				),
		},
	];

	if (options.supportsImages) {
		displayItems.push({
			id: "show-images",
			label: "Show images",
			description: "Render images inline in terminal",
			currentValue: config.showImages ? "true" : "false",
			values: ["true", "false"],
		});
	}

	displayItems.push(
		{
			id: "auto-resize-images",
			label: "Auto-resize images",
			description: "Resize large images to 2000x2000 max for better model compatibility",
			currentValue: config.autoResizeImages ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "block-images",
			label: "Block images",
			description: "Prevent images from being sent to LLM providers",
			currentValue: config.blockImages ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "hide-thinking",
			label: "Hide thinking",
			description: "Hide thinking blocks in assistant responses",
			currentValue: config.hideThinkingBlock ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "show-hardware-cursor",
			label: "Show hardware cursor",
			description: "Show the terminal cursor while still positioning it for IME support",
			currentValue: config.showHardwareCursor ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "editor-padding",
			label: "Editor padding",
			description: "Horizontal padding for input editor (0-3)",
			currentValue: String(config.editorPaddingX),
			values: ["0", "1", "2", "3"],
		},
		{
			id: "autocomplete-max-visible",
			label: "Autocomplete max items",
			description: "Max visible items in autocomplete dropdown (3-20)",
			currentValue: String(config.autocompleteMaxVisible),
			values: ["3", "5", "7", "10", "15", "20"],
		},
		{
			id: "clear-on-shrink",
			label: "Clear on shrink",
			description: "Clear empty rows when content shrinks (may cause flicker)",
			currentValue: config.clearOnShrink ? "true" : "false",
			values: ["true", "false"],
		},
	);

	const behaviorItems: SettingItem[] = [
		{
			id: "thinking",
			label: "Thinking level",
			description: "Reasoning depth for thinking-capable models",
			currentValue: config.thinkingLevel,
			submenu: (currentValue, done) =>
				new SelectSubmenu(
					"Thinking Level",
					"Select reasoning depth for thinking-capable models",
					config.availableThinkingLevels.map((level) => ({
						value: level,
						label: level,
						description: THINKING_DESCRIPTIONS[level as ThinkingLevel],
					})),
					currentValue,
					(value) => {
						callbacks.onThinkingLevelChange(value as ThinkingLevel);
						done(value);
					},
					() => done(),
				),
		},
		{
			id: "fast-mode",
			label: "Fast mode",
			description: "Request priority inference when the current model/provider supports it",
			currentValue: config.fastMode ? "true" : "false",
			values: ["true", "false"],
		},
		{
			id: "double-escape-action",
			label: "Double-escape action",
			description: "Action when pressing Escape twice with empty editor",
			currentValue: config.doubleEscapeAction,
			values: ["tree", "fork", "none"],
		},
		{
			id: "tree-filter-mode",
			label: "Tree filter mode",
			description: "Default filter when opening /tree",
			currentValue: config.treeFilterMode,
			values: ["default", "no-tools", "user-only", "labeled-only", "all"],
		},
	];

	return [
		{ id: "general", label: "General", items: generalItems },
		{ id: "display", label: "Display", items: displayItems },
		{ id: "behavior", label: "Behavior", items: behaviorItems },
	];
}

export function buildSettingsSections(
	config: SettingsConfig,
	callbacks: SettingsCallbacks,
	options: { supportsImages: boolean },
): SettingsSection[] {
	const sections = buildBaseSettingsSections(config, callbacks, options);
	const safeOnSubagentRoleModelChange = callbacks.onSubagentRoleModelChange ?? (() => {});
	const safeOnSubagentRoleThinkingLevelChange = callbacks.onSubagentRoleThinkingLevelChange ?? (() => {});
	const safeOnClearSubagentRoleOverride = callbacks.onClearSubagentRoleOverride ?? (() => {});

	sections.push({
		id: "subagents",
		label: "Subagents",
		items: [
			{
				id: "subagents-delegation-aggressiveness",
				label: "Delegation aggressiveness",
				description: "How readily Daedalus delegates focused work to internal specialists.",
				currentValue: config.subagents.delegationAggressiveness,
				values: ["conservative", "balanced", "aggressive"],
			},
			{
				id: "subagents-max-depth",
				label: "Max depth",
				description: "Maximum nested subagent depth allowed by default.",
				currentValue: String(config.subagents.maxDepth),
				values: ["1", "2", "3", "4"],
			},
			{
				id: "subagents-max-concurrency",
				label: "Max concurrency",
				description: "Maximum number of child subagents allowed at once.",
				currentValue: String(config.subagents.maxConcurrency),
				values: ["1", "2", "3", "4", "6", "8"],
			},
			{
				id: "subagents-branch-isolation-threshold",
				label: "Branch isolation threshold",
				description: "When risky mutations should move to a child branch.",
				currentValue: config.subagents.branchIsolation.mutationThreshold,
				values: ["never", "high-risk", "always"],
			},
			{
				id: "subagents-role-overrides",
				label: "Role overrides",
				description:
					"Edit model/thinking overrides for bundled starter roles. Advanced tool/path policies stay in JSON.",
				currentValue: `${Object.keys(config.subagents.agents).length} configured`,
				submenu: (_currentValue, done) =>
					new SubagentOverrideSelectorComponent(config.subagents.roles, config.subagents.agents, {
						onModelChange: safeOnSubagentRoleModelChange,
						onThinkingLevelChange: safeOnSubagentRoleThinkingLevelChange,
						onExecutionModeChange: callbacks.onSubagentRoleExecutionModeChange ?? (() => {}),
						onIsolationPreferenceChange: callbacks.onSubagentRoleIsolationPreferenceChange ?? (() => {}),
						onClear: safeOnClearSubagentRoleOverride,
						validateModelRef: config.validateSubagentModelRef ?? (() => undefined),
						onDone: (summary) => done(summary),
					}),
			},
		],
	});

	return sections;
}
