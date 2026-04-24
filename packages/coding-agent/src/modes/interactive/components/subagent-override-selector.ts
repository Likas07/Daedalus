import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import { Container, type SettingItem, SettingsList } from "@daedalus-pi/tui";
import type { SubagentExecutionModePreference, SubagentIsolationPreference } from "../../../core/settings-schema.js";
import { formatAgentLabel } from "../../../extensions/daedalus/workflow/subagents/task-progress-renderer.js";
import { getSettingsListTheme } from "../theme/theme.js";
import type { SettingsSubagentRole, SettingsSubagentRoleOverride } from "./settings-selector.js";
import { TextInputSubmenu } from "./settings-submenus.js";

const THINKING_VALUES = ["inherit", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const EXECUTION_MODE_VALUES = ["inherit", "foreground", "background", "either"] as const;
const ISOLATION_VALUES = ["inherit", "shared-branch", "child-branch", "either"] as const;

function formatRoleSummary(override: SettingsSubagentRoleOverride | undefined): string {
	if (!override?.model && !override?.thinkingLevel) {
		return "(inherit)";
	}

	const parts: string[] = [];
	if (override.model) {
		parts.push(`model: ${override.model}`);
	}
	if (override.thinkingLevel) {
		parts.push(`thinking: ${override.thinkingLevel}`);
	}
	if (override.executionModePreference) {
		parts.push(`mode: ${override.executionModePreference}`);
	}
	if (override.isolationPreference) {
		parts.push(`isolation: ${override.isolationPreference}`);
	}
	return parts.join(" · ");
}

function formatConfiguredOverrideCount(overrides: Record<string, SettingsSubagentRoleOverride>): string {
	return `${Object.keys(overrides).length} configured`;
}

export interface SubagentOverrideSelectorCallbacks {
	onModelChange: (role: string, model: string | undefined) => void;
	onThinkingLevelChange: (role: string, level: ThinkingLevel | undefined) => void;
	onExecutionModeChange: (role: string, mode: SubagentExecutionModePreference | undefined) => void;
	onIsolationPreferenceChange: (role: string, isolation: SubagentIsolationPreference | undefined) => void;
	onClear: (role: string) => void;
	validateModelRef: (value: string) => string | undefined;
	onDone: (summary: string) => void;
}

export class SubagentOverrideSelectorComponent extends Container {
	private readonly overrides: Record<string, SettingsSubagentRoleOverride>;
	private readonly roleList: SettingsList;

	constructor(
		roles: SettingsSubagentRole[],
		overrides: Record<string, SettingsSubagentRoleOverride>,
		private readonly callbacks: SubagentOverrideSelectorCallbacks,
	) {
		super();

		this.overrides = Object.fromEntries(Object.entries(overrides).map(([name, override]) => [name, { ...override }]));

		const items: SettingItem[] = roles.map((role) => ({
			id: role.name,
			label: formatAgentLabel({ name: role.name, displayName: role.displayName }),
			description: role.description,
			currentValue: formatRoleSummary(this.overrides[role.name]),
			submenu: (_currentValue, done) => this.createRoleSettingsList(role.name, done),
		}));

		this.roleList = new SettingsList(
			items,
			10,
			getSettingsListTheme(),
			() => {},
			() => {
				this.callbacks.onDone(formatConfiguredOverrideCount(this.overrides));
			},
			{ enableSearch: true },
		);
		this.addChild(this.roleList);
	}

	private createRoleSettingsList(roleName: string, onDone: () => void): SettingsList {
		const roleSettings = new SettingsList(
			[
				{
					id: "model",
					label: "Model override",
					description: "Use provider/modelId. Leave blank to inherit the role default.",
					currentValue: this.overrides[roleName]?.model ?? "(inherit)",
					submenu: (currentValue, done) =>
						new TextInputSubmenu({
							title: `Model override · ${roleName}`,
							description: "Use provider/modelId. Leave blank to inherit the role default.",
							initialValue: currentValue === "(inherit)" ? "" : currentValue,
							validate: this.callbacks.validateModelRef,
							onSubmit: (value) => {
								const nextValue = value || undefined;
								this.setRoleModel(roleName, nextValue);
								this.callbacks.onModelChange(roleName, nextValue);
								roleSettings.updateValue("model", nextValue ?? "(inherit)");
								this.roleList.updateValue(roleName, formatRoleSummary(this.overrides[roleName]));
								done(nextValue ?? "(inherit)");
							},
							onCancel: () => done(),
						}),
				},
				{
					id: "thinking",
					label: "Thinking level",
					description: "Override the role's reasoning depth for this starter role.",
					currentValue: this.overrides[roleName]?.thinkingLevel ?? "inherit",
					values: [...THINKING_VALUES],
				},
				{
					id: "clear",
					label: "Clear override",
					description: "Remove both model and thinking overrides for this role.",
					currentValue: "no",
					values: ["no", "clear"],
				},
				{
					id: "execution-mode",
					label: "Execution mode",
					description: "Override foreground/background preference for this role.",
					currentValue: this.overrides[roleName]?.executionModePreference ?? "inherit",
					values: [...EXECUTION_MODE_VALUES],
				},
				{
					id: "isolation",
					label: "Isolation",
					description: "Override shared-branch/child-branch preference for this role.",
					currentValue: this.overrides[roleName]?.isolationPreference ?? "inherit",
					values: [...ISOLATION_VALUES],
				},
			],
			10,
			getSettingsListTheme(),
			(id, value) => {
				if (id === "thinking") {
					const nextValue = value === "inherit" ? undefined : (value as ThinkingLevel);
					this.setRoleThinkingLevel(roleName, nextValue);
					this.callbacks.onThinkingLevelChange(roleName, nextValue);
					roleSettings.updateValue("thinking", value);
					this.roleList.updateValue(roleName, formatRoleSummary(this.overrides[roleName]));
					return;
				}

				if (id === "execution-mode") {
					const nextValue = value === "inherit" ? undefined : (value as SubagentExecutionModePreference);
					this.setRoleExecutionMode(roleName, nextValue);
					this.callbacks.onExecutionModeChange(roleName, nextValue);
					roleSettings.updateValue("execution-mode", value);
					this.roleList.updateValue(roleName, formatRoleSummary(this.overrides[roleName]));
					return;
				}

				if (id === "isolation") {
					const nextValue = value === "inherit" ? undefined : (value as SubagentIsolationPreference);
					this.setRoleIsolationPreference(roleName, nextValue);
					this.callbacks.onIsolationPreferenceChange(roleName, nextValue);
					roleSettings.updateValue("isolation", value);
					this.roleList.updateValue(roleName, formatRoleSummary(this.overrides[roleName]));
					return;
				}

				if (id === "clear" && value === "clear") {
					delete this.overrides[roleName];
					this.callbacks.onClear(roleName);
					roleSettings.updateValue("model", "(inherit)");
					roleSettings.updateValue("thinking", "inherit");
					roleSettings.updateValue("execution-mode", "inherit");
					roleSettings.updateValue("isolation", "inherit");
					roleSettings.updateValue("clear", "no");
					this.roleList.updateValue(roleName, formatRoleSummary(undefined));
				}
			},
			onDone,
			{ enableSearch: false },
		);

		return roleSettings;
	}

	private hasOverride(roleName: string): boolean {
		const override = this.overrides[roleName];
		return Boolean(
			override?.model ||
				override?.thinkingLevel ||
				override?.executionModePreference ||
				override?.isolationPreference,
		);
	}

	private setRoleModel(roleName: string, model: string | undefined): void {
		if (model) {
			this.overrides[roleName] = { ...(this.overrides[roleName] ?? {}), model };
		} else if (this.overrides[roleName]) {
			delete this.overrides[roleName].model;
			this.pruneRoleOverride(roleName);
		}
	}

	private setRoleThinkingLevel(roleName: string, thinkingLevel: ThinkingLevel | undefined): void {
		if (thinkingLevel) {
			this.overrides[roleName] = { ...(this.overrides[roleName] ?? {}), thinkingLevel };
		} else if (this.overrides[roleName]) {
			delete this.overrides[roleName].thinkingLevel;
			this.pruneRoleOverride(roleName);
		}
	}

	private setRoleExecutionMode(
		roleName: string,
		executionModePreference: SubagentExecutionModePreference | undefined,
	): void {
		if (executionModePreference) {
			this.overrides[roleName] = { ...(this.overrides[roleName] ?? {}), executionModePreference };
		} else if (this.overrides[roleName]) {
			delete this.overrides[roleName].executionModePreference;
			this.pruneRoleOverride(roleName);
		}
	}

	private setRoleIsolationPreference(
		roleName: string,
		isolationPreference: SubagentIsolationPreference | undefined,
	): void {
		if (isolationPreference) {
			this.overrides[roleName] = { ...(this.overrides[roleName] ?? {}), isolationPreference };
		} else if (this.overrides[roleName]) {
			delete this.overrides[roleName].isolationPreference;
			this.pruneRoleOverride(roleName);
		}
	}

	private pruneRoleOverride(roleName: string): void {
		if (!this.hasOverride(roleName)) {
			delete this.overrides[roleName];
		}
	}

	handleInput(data: string): void {
		this.roleList.handleInput(data);
	}

	capturesTabNavigation(): boolean {
		return this.roleList.capturesTabNavigation();
	}
}
