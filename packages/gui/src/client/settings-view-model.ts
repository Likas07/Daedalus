import type { SettingsSnapshotResult } from "@daedalus-pi/app-server-client";
import type { RendererAuthStatus, RendererModel } from "./gui-state-types";

export interface SettingsViewModel {
	readonly selectedProvider?: string;
	readonly selectedModel?: string;
	readonly theme: string;
	readonly thinkingLevel: string;
	readonly density: "compact" | "comfortable" | "spacious";
	readonly schema: SettingsSnapshotResult["schema"];
	readonly thinkingLevels: readonly string[];
	readonly enabledModels: readonly string[];
	readonly models: readonly RendererModel[];
	readonly providers: readonly RendererAuthStatus[];
	readonly keybindings: readonly { id: string; label: string; combo: string; overridden: boolean }[];
	readonly diagnostics: readonly string[];
	readonly terminal: { showImages: boolean; clearOnShrink: boolean };
	readonly images: { blockImages: boolean; autoResize: boolean };
}

export function createSettingsViewModel(snapshot: SettingsSnapshotResult | undefined, providers: readonly RendererAuthStatus[] = []): SettingsViewModel {
	const effective = snapshot?.effective ?? {};
	const terminal = readRecord(effective.terminal);
	const images = readRecord(effective.images);
	return {
		selectedProvider: stringValue(snapshot?.selectedProvider ?? effective.defaultProvider),
		selectedModel: stringValue(snapshot?.selectedModel ?? effective.defaultModel),
		theme: stringValue(effective.theme) ?? "daedalus-dark",
		thinkingLevel: stringValue(effective.defaultThinkingLevel) ?? "medium",
		density: densityValue(effective.density),
		schema: snapshot?.schema ?? [],
		thinkingLevels: snapshot?.thinkingLevels ?? ["off", "minimal", "low", "medium", "high", "xhigh"],
		enabledModels: arrayOfStrings(snapshot?.enabledModels ?? effective.enabledModels),
		models: (snapshot?.models ?? []) as RendererModel[],
		providers,
		keybindings: (snapshot?.keybindings ?? []).map((binding) => ({
			id: binding.id,
			label: binding.description,
			combo: binding.keys.join(", ") || "unbound",
			overridden: binding.overridden,
		})),
		diagnostics: snapshot?.diagnostics ?? [],
		terminal: {
			showImages: booleanValue(terminal.showImages, true),
			clearOnShrink: booleanValue(terminal.clearOnShrink, false),
		},
		images: {
			blockImages: booleanValue(images.blockImages, false),
			autoResize: booleanValue(images.autoResize, true),
		},
	};
}

function readRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function densityValue(value: unknown): "compact" | "comfortable" | "spacious" {
	return value === "compact" || value === "spacious" ? value : "comfortable";
}

function arrayOfStrings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
