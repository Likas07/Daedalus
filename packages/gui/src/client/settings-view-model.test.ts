import { describe, expect, test } from "bun:test";
import { createSettingsViewModel } from "./settings-view-model";

describe("createSettingsViewModel", () => {
	test("projects model, theme, auth, keybinding, and terminal settings", () => {
		const vm = createSettingsViewModel(
			{
				global: {},
				project: {},
				effective: {
					defaultProvider: "openai",
					defaultModel: "gpt-5",
					theme: "obsidian",
					defaultThinkingLevel: "high",
					density: "compact",
					terminal: { showImages: false, clearOnShrink: true },
					images: { blockImages: true, autoResize: false },
				},
				diagnostics: ["ok"],
				models: [{ id: "gpt-5", provider: "openai", capabilities: ["reasoning"], diagnostics: [] }],
				selectedProvider: "openai",
				selectedModel: "gpt-5",
				enabledModels: ["openai/*"],
				thinkingLevels: ["low", "high"],
				keybindings: [{ id: "app.commandPalette", description: "Open palette", defaultKeys: ["super+k"], keys: ["ctrl+k"], overridden: true }],
				schema: [{ key: "density", label: "Density", type: "string", scopes: ["global", "project"], values: ["compact", "comfortable", "spacious"] }],
			},
			[{ provider: "openai", enabled: true, authenticated: true, status: "env-key", authMethod: "env", actionable: false, canLogin: false, canLogout: false, canRelogin: false, modelCount: 1, models: [{ id: "gpt-5", available: true, capabilities: ["reasoning"], diagnostics: [] }], capabilities: ["reasoning"], diagnostics: [], updatedAt: "2026-04-26T00:00:00.000Z" }],
		);
		expect(vm.selectedModel).toBe("gpt-5");
		expect(vm.theme).toBe("obsidian");
		expect(vm.density).toBe("compact");
		expect(vm.keybindings[0]?.combo).toBe("ctrl+k");
		expect(vm.providers[0]?.authenticated).toBe(true);
		expect(vm.terminal.showImages).toBe(false);
		expect(vm.images.blockImages).toBe(true);
		expect(vm.models[0]?.capabilities).toContain("reasoning");
		expect(vm.providers[0]?.status).toBe("env-key");
		expect(vm.providers[0]?.models?.[0]?.id).toBe("gpt-5");
	});
});
