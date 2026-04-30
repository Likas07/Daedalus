import { SettingsManager } from "@daedalus-pi/coding-agent";

type SettingsScope = "global" | "project";

export type SettingsKey =
	| "defaultProvider"
	| "defaultModel"
	| "defaultThinkingLevel"
	| "theme"
	| "density"
	| "keybindings"
	| "enabledModels"
	| "terminal.showImages"
	| "terminal.clearOnShrink"
	| "images.blockImages"
	| "images.autoResize";

export interface SettingsServiceOptions {
	readonly settingsManager?: SettingsManager;
	readonly keybindings?: Record<
		string,
		{ description?: string; defaultKeys?: string | string[]; keys?: string | string[] }
	>;
	readonly listModels?: () => Promise<readonly SettingsModel[]>;
	readonly reloadResources?: () => Promise<unknown> | unknown;
}

export interface SettingsModel {
	readonly id: string;
	readonly label?: string;
	readonly provider?: string;
	readonly available?: boolean;
	readonly reasoningLevels?: readonly string[];
}

export interface SettingsSnapshot {
	readonly global: Record<string, unknown>;
	readonly project: Record<string, unknown>;
	readonly effective: Record<string, unknown>;
	readonly diagnostics: readonly string[];
	readonly models: readonly SettingsModel[];
	readonly selectedProvider?: string;
	readonly selectedModel?: string;
	readonly enabledModels?: readonly string[];
	readonly thinkingLevels: readonly string[];
	readonly keybindings: readonly {
		id: string;
		description: string;
		defaultKeys: readonly string[];
		keys: readonly string[];
		overridden: boolean;
	}[];
	readonly schema: readonly SettingsSchemaEntry[];
}

const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const densities = ["compact", "comfortable", "spacious"] as const;

export interface SettingsSchemaEntry {
	readonly key: SettingsKey;
	readonly label: string;
	readonly type: "string" | "boolean" | "string[]" | "keybindings";
	readonly scopes: readonly SettingsScope[];
	readonly values?: readonly string[];
	readonly resourceReload?: boolean;
}

const SETTINGS_SCHEMA: readonly SettingsSchemaEntry[] = [
	{ key: "defaultProvider", label: "Default provider", type: "string", scopes: ["global", "project"] },
	{ key: "defaultModel", label: "Default model", type: "string", scopes: ["global", "project"] },
	{
		key: "defaultThinkingLevel",
		label: "Thinking level",
		type: "string",
		scopes: ["global", "project"],
		values: thinkingLevels,
	},
	{ key: "theme", label: "Theme", type: "string", scopes: ["global", "project"], resourceReload: true },
	{ key: "density", label: "Density", type: "string", scopes: ["global", "project"], values: densities },
	{ key: "keybindings", label: "Keybindings", type: "keybindings", scopes: ["global", "project"] },
	{ key: "enabledModels", label: "Enabled model patterns", type: "string[]", scopes: ["global", "project"] },
	{ key: "terminal.showImages", label: "Terminal images", type: "boolean", scopes: ["global", "project"] },
	{ key: "terminal.clearOnShrink", label: "Clear terminal on shrink", type: "boolean", scopes: ["global", "project"] },
	{ key: "images.blockImages", label: "Block images", type: "boolean", scopes: ["global", "project"] },
	{ key: "images.autoResize", label: "Auto-resize images", type: "boolean", scopes: ["global", "project"] },
];

export class SettingsService {
	private readonly settingsManager: SettingsManager;
	private readonly keybindingDefinitions: Record<
		string,
		{ description?: string; defaultKeys?: string | string[]; keys?: string | string[] }
	>;

	constructor(private readonly options: SettingsServiceOptions = {}) {
		this.settingsManager = options.settingsManager ?? SettingsManager.create();
		this.keybindingDefinitions = options.keybindings ?? DEFAULT_KEYBINDINGS;
	}

	async read(): Promise<SettingsSnapshot> {
		const models = [...((await this.options.listModels?.()) ?? [])];
		const global = this.settingsManager.getGlobalSettings() as Record<string, unknown>;
		const project = this.settingsManager.getProjectSettings() as Record<string, unknown>;
		const selectedProvider = this.settingsManager.getDefaultProvider();
		const selectedModel = normalizeSelectedModel(models, this.settingsManager.getDefaultModel(), selectedProvider);
		const diagnostics = this.settingsManager.drainErrors().map((error) => `${error.scope}: ${error.error.message}`);
		return {
			global,
			project,
			effective: {
				defaultProvider: selectedProvider,
				defaultModel: selectedModel,
				defaultThinkingLevel: this.settingsManager.getDefaultThinkingLevel(),
				theme: stringSetting(global, project, "theme") ?? this.settingsManager.getTheme(),
				density: stringSetting(global, project, "density") ?? "comfortable",
				enabledModels: this.settingsManager.getEnabledModels(),
				keybindings: objectSetting(global, project, "keybindings") ?? {},
				terminal: {
					showImages: this.settingsManager.getShowImages(),
					clearOnShrink: this.settingsManager.getClearOnShrink(),
				},
				images: {
					blockImages: this.settingsManager.getBlockImages(),
					autoResize: this.settingsManager.getImageAutoResize(),
				},
			},
			diagnostics,
			models,
			selectedProvider,
			selectedModel,
			enabledModels: this.settingsManager.getEnabledModels(),
			thinkingLevels,
			keybindings: this.keybindings(),
			schema: SETTINGS_SCHEMA,
		};
	}

	async set(scope: SettingsScope, key: SettingsKey, value: unknown): Promise<SettingsSnapshot> {
		this.apply(scope, key, this.validate(key, value));
		await this.settingsManager.flush();
		await this.reloadResources();
		return this.read();
	}

	async reset(scope: SettingsScope, key: SettingsKey): Promise<SettingsSnapshot> {
		this.apply(scope, key, undefined);
		await this.settingsManager.flush();
		await this.reloadResources();
		return this.read();
	}

	async reloadResources(): Promise<void> {
		await this.settingsManager.reload();
		await this.options.reloadResources?.();
	}

	private keybindings(): SettingsSnapshot["keybindings"] {
		return Object.entries(this.keybindingDefinitions).map(([id, def]) => {
			const defaultKeys = toKeys(def.defaultKeys);
			const configured = keybindingOverrides(
				this.settingsManager.getGlobalSettings() as Record<string, unknown>,
				this.settingsManager.getProjectSettings() as Record<string, unknown>,
			)[id];
			const keys = configured ? toKeys(configured) : toKeys(def.keys ?? def.defaultKeys);
			return {
				id,
				description: def.description ?? id,
				defaultKeys,
				keys,
				overridden: configured !== undefined || def.keys !== undefined,
			};
		});
	}

	private validate(key: SettingsKey, value: unknown): unknown {
		if (key === "enabledModels") {
			if (value === undefined) return undefined;
			if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
				throw new Error("enabledModels must be an array of strings");
			return value;
		}
		if (
			key === "terminal.showImages" ||
			key === "terminal.clearOnShrink" ||
			key === "images.blockImages" ||
			key === "images.autoResize"
		) {
			if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
			return value;
		}
		if (key === "density" && !densities.includes(value as (typeof densities)[number]))
			throw new Error("density is invalid");
		if (key === "keybindings") {
			if (!isStringArrayRecord(value)) throw new Error("keybindings must be an object of string arrays");
			return value;
		}
		if (key === "defaultThinkingLevel" && !thinkingLevels.includes(value as (typeof thinkingLevels)[number]))
			throw new Error("defaultThinkingLevel is invalid");
		if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string`);
		return value;
	}

	private apply(scope: SettingsScope, key: SettingsKey, value: unknown): void {
		const manager = this.settingsManager as unknown as {
			globalSettings: unknown;
			projectSettings: unknown;
			markModified(field: string, nestedKey?: string): void;
			markProjectModified(field: string, nestedKey?: string): void;
			save(): void;
			saveProjectSettings(settings: unknown): void;
		};
		const target =
			scope === "project" ? this.settingsManager.getProjectSettings() : this.settingsManager.getGlobalSettings();
		setPath(target as Record<string, unknown>, key, value);
		const [field, nested] = key.split(".") as [string, string | undefined];
		if (scope === "project") {
			manager.markProjectModified(field, nested);
			manager.saveProjectSettings(target);
		} else {
			manager.globalSettings = target;
			manager.markModified(field, nested);
			manager.save();
		}
	}
}

function toKeys(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return [value];
	return [];
}

function setPath(target: Record<string, unknown>, key: string, value: unknown): void {
	const parts = key.split(".");
	let cursor = target;
	for (const part of parts.slice(0, -1)) {
		const next = cursor[part];
		cursor[part] = typeof next === "object" && next !== null && !Array.isArray(next) ? next : {};
		cursor = cursor[part] as Record<string, unknown>;
	}
	if (value === undefined) delete cursor[parts.at(-1)!];
	else cursor[parts.at(-1)!] = value;
}

function stringSetting(
	global: Record<string, unknown>,
	project: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = project[key] ?? global[key];
	return typeof value === "string" ? value : undefined;
}

function objectSetting(
	global: Record<string, unknown>,
	project: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = project[key] ?? global[key];
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function normalizeSelectedModel(
	models: readonly SettingsModel[],
	selectedModel: string | undefined,
	selectedProvider: string | undefined,
): string | undefined {
	if (!selectedModel) return undefined;
	if (models.some((model) => model.id === selectedModel)) return selectedModel;
	if (!selectedModel.includes("/") && selectedProvider) {
		const providerQualified = `${selectedProvider}/${selectedModel}`;
		if (models.some((model) => model.id === providerQualified)) return providerQualified;
	}
	if (selectedModel.includes("/")) return selectedModel;
	const matches = models.filter((model) => {
		const [provider, id] = model.id.split("/", 2);
		return (
			id === selectedModel &&
			(!selectedProvider || model.provider === selectedProvider || provider === selectedProvider)
		);
	});
	return matches.length === 1 ? matches[0]?.id : selectedModel;
}

function keybindingOverrides(...settings: Record<string, unknown>[]): Record<string, string[]> {
	return Object.assign(
		{},
		...settings.map((setting) => {
			const value = setting.keybindings;
			return isStringArrayRecord(value) ? value : {};
		}),
	);
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.values(value).every((item) => Array.isArray(item) && item.every((entry) => typeof entry === "string"))
	);
}

const DEFAULT_KEYBINDINGS = {
	"app.commandPalette": { defaultKeys: "super+k", description: "Open command palette" },
	"app.session.new": { defaultKeys: "super+n", description: "New session" },
	"app.terminal.toggle": { defaultKeys: "super+`", description: "Toggle terminal" },
	"app.settings.open": { defaultKeys: "super+,", description: "Open settings" },
	"app.approval.accept": { defaultKeys: "super+enter", description: "Approve and continue" },
	"app.approval.cancel": { defaultKeys: "escape", description: "Cancel approval" },
};
