import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type { Transport } from "@daedalus-pi/ai";
import { Container, getCapabilities, SettingsList, Tabs } from "@daedalus-pi/tui";
import type {
	SubagentBranchIsolationThreshold,
	SubagentDelegationAggressiveness,
	SubagentExecutionModePreference,
	SubagentIsolationPreference,
} from "../../../core/settings-schema.js";
import { getSettingsListTheme, getTabsTheme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { buildSettingsSections } from "./settings-sections.js";

export interface SettingsSubagentRole {
	name: string;
	description: string;
	displayName?: string;
}

export interface SettingsSubagentRoleOverride {
	model?: string;
	thinkingLevel?: ThinkingLevel;
	executionModePreference?: SubagentExecutionModePreference;
	isolationPreference?: SubagentIsolationPreference;
}

export interface SettingsSubagentsConfig {
	delegationAggressiveness: SubagentDelegationAggressiveness;
	maxDepth: number;
	maxConcurrency: number;
	backgroundRoles: string[];
	branchIsolation: {
		enabled: boolean;
		mutationThreshold: SubagentBranchIsolationThreshold;
		namingTemplate: string;
	};
	roles: SettingsSubagentRole[];
	agents: Record<string, SettingsSubagentRoleOverride>;
}

export interface SettingsConfig {
	autoCompact: boolean;
	showImages: boolean;
	autoResizeImages: boolean;
	blockImages: boolean;
	enableSkillCommands: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	transport: Transport;
	thinkingLevel: ThinkingLevel;
	fastMode: boolean;
	availableThinkingLevels: ThinkingLevel[];
	currentTheme: string;
	availableThemes: string[];
	hideThinkingBlock: boolean;
	collapseChangelog: boolean;
	doubleEscapeAction: "fork" | "tree" | "none";
	treeFilterMode: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
	showHardwareCursor: boolean;
	editorPaddingX: number;
	autocompleteMaxVisible: number;
	quietStartup: boolean;
	clearOnShrink: boolean;
	subagents: SettingsSubagentsConfig;
	validateSubagentModelRef?: (value: string) => string | undefined;
}

export interface SettingsCallbacks {
	onAutoCompactChange: (enabled: boolean) => void;
	onShowImagesChange: (enabled: boolean) => void;
	onAutoResizeImagesChange: (enabled: boolean) => void;
	onBlockImagesChange: (blocked: boolean) => void;
	onEnableSkillCommandsChange: (enabled: boolean) => void;
	onSteeringModeChange: (mode: "all" | "one-at-a-time") => void;
	onFollowUpModeChange: (mode: "all" | "one-at-a-time") => void;
	onTransportChange: (transport: Transport) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onFastModeChange: (enabled: boolean) => void;
	onThemeChange: (theme: string) => void;
	onThemePreview?: (theme: string) => void;
	onHideThinkingBlockChange: (hidden: boolean) => void;
	onCollapseChangelogChange: (collapsed: boolean) => void;
	onDoubleEscapeActionChange: (action: "fork" | "tree" | "none") => void;
	onTreeFilterModeChange: (mode: "default" | "no-tools" | "user-only" | "labeled-only" | "all") => void;
	onShowHardwareCursorChange: (enabled: boolean) => void;
	onEditorPaddingXChange: (padding: number) => void;
	onAutocompleteMaxVisibleChange: (maxVisible: number) => void;
	onQuietStartupChange: (enabled: boolean) => void;
	onClearOnShrinkChange: (enabled: boolean) => void;
	onSubagentDelegationAggressivenessChange?: (value: SubagentDelegationAggressiveness) => void;
	onSubagentBranchIsolationThresholdChange?: (value: SubagentBranchIsolationThreshold) => void;
	onSubagentMaxDepthChange?: (value: number) => void;
	onSubagentMaxConcurrencyChange?: (value: number) => void;
	onSubagentRoleModelChange?: (role: string, model: string | undefined) => void;
	onSubagentRoleThinkingLevelChange?: (role: string, level: ThinkingLevel | undefined) => void;
	onSubagentRoleExecutionModeChange?: (role: string, mode: SubagentExecutionModePreference | undefined) => void;
	onSubagentRoleIsolationPreferenceChange?: (role: string, isolation: SubagentIsolationPreference | undefined) => void;
	onClearSubagentRoleOverride?: (role: string) => void;
	onCancel: () => void;
}

function handleBaseSettingChange(id: string, newValue: string, callbacks: SettingsCallbacks): void {
	switch (id) {
		case "autocompact":
			callbacks.onAutoCompactChange(newValue === "true");
			break;
		case "show-images":
			callbacks.onShowImagesChange(newValue === "true");
			break;
		case "auto-resize-images":
			callbacks.onAutoResizeImagesChange(newValue === "true");
			break;
		case "block-images":
			callbacks.onBlockImagesChange(newValue === "true");
			break;
		case "skill-commands":
			callbacks.onEnableSkillCommandsChange(newValue === "true");
			break;
		case "steering-mode":
			callbacks.onSteeringModeChange(newValue as "all" | "one-at-a-time");
			break;
		case "follow-up-mode":
			callbacks.onFollowUpModeChange(newValue as "all" | "one-at-a-time");
			break;
		case "transport":
			callbacks.onTransportChange(newValue as Transport);
			break;
		case "hide-thinking":
			callbacks.onHideThinkingBlockChange(newValue === "true");
			break;
		case "fast-mode":
			callbacks.onFastModeChange(newValue === "true");
			break;
		case "collapse-changelog":
			callbacks.onCollapseChangelogChange(newValue === "true");
			break;
		case "quiet-startup":
			callbacks.onQuietStartupChange(newValue === "true");
			break;
		case "double-escape-action":
			callbacks.onDoubleEscapeActionChange(newValue as "fork" | "tree" | "none");
			break;
		case "tree-filter-mode":
			callbacks.onTreeFilterModeChange(newValue as "default" | "no-tools" | "user-only" | "labeled-only" | "all");
			break;
		case "show-hardware-cursor":
			callbacks.onShowHardwareCursorChange(newValue === "true");
			break;
		case "editor-padding":
			callbacks.onEditorPaddingXChange(Number.parseInt(newValue, 10));
			break;
		case "autocomplete-max-visible":
			callbacks.onAutocompleteMaxVisibleChange(Number.parseInt(newValue, 10));
			break;
		case "clear-on-shrink":
			callbacks.onClearOnShrinkChange(newValue === "true");
			break;
		case "subagents-delegation-aggressiveness":
			callbacks.onSubagentDelegationAggressivenessChange?.(newValue as SubagentDelegationAggressiveness);
			break;
		case "subagents-branch-isolation-threshold":
			callbacks.onSubagentBranchIsolationThresholdChange?.(newValue as SubagentBranchIsolationThreshold);
			break;
		case "subagents-max-depth":
			callbacks.onSubagentMaxDepthChange?.(Number.parseInt(newValue, 10));
			break;
		case "subagents-max-concurrency":
			callbacks.onSubagentMaxConcurrencyChange?.(Number.parseInt(newValue, 10));
			break;
	}
}

export class SettingsSelectorComponent extends Container {
	private readonly tabs: Tabs;

	constructor(config: SettingsConfig, callbacks: SettingsCallbacks) {
		super();

		const sections = buildSettingsSections(config, callbacks, {
			supportsImages: getCapabilities().images !== null,
		});

		this.tabs = new Tabs(
			sections.map((section) => ({
				id: section.id,
				label: section.label,
				content: new SettingsList(
					section.items,
					10,
					getSettingsListTheme(),
					(id, value) => handleBaseSettingChange(id, value, callbacks),
					callbacks.onCancel,
					{ enableSearch: true },
				),
			})),
			getTabsTheme(),
			"general",
		);

		this.addChild(new DynamicBorder());
		this.addChild(this.tabs);
		this.addChild(new DynamicBorder());
	}

	handleInput(data: string): void {
		this.tabs.handleInput(data);
	}
}
