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
					terminal: { showImages: false, clearOnShrink: true },
					images: { blockImages: true, autoResize: false },
				},
				diagnostics: ["ok"],
				models: [{ id: "gpt-5", provider: "openai" }],
				selectedProvider: "openai",
				selectedModel: "gpt-5",
				enabledModels: ["openai/*"],
				thinkingLevels: ["low", "high"],
				keybindings: [{ id: "app.commandPalette", description: "Open palette", defaultKeys: ["super+k"], keys: ["ctrl+k"], overridden: true }],
			},
			[{ provider: "openai", authenticated: true, status: "ready" }],
		);
		expect(vm.selectedModel).toBe("gpt-5");
		expect(vm.theme).toBe("obsidian");
		expect(vm.keybindings[0]?.combo).toBe("ctrl+k");
		expect(vm.providers[0]?.authenticated).toBe(true);
		expect(vm.terminal.showImages).toBe(false);
		expect(vm.images.blockImages).toBe(true);
	});
});
