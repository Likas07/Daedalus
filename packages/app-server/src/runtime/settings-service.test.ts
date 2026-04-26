import { describe, expect, test } from "bun:test";
import { SettingsManager } from "@daedalus-pi/coding-agent";
import { SettingsService } from "./settings-service";

describe("SettingsService", () => {
	test("reads schema-backed settings, models, and keybindings", async () => {
		const service = new SettingsService({
			settingsManager: SettingsManager.inMemory({
				defaultProvider: "openai",
				defaultModel: "gpt-5",
				theme: "daedalus-dark",
			}),
			listModels: async () => [{ id: "gpt-5", provider: "openai", reasoningLevels: ["low", "medium"] }],
		});
		const snapshot = await service.read();
		expect(snapshot.selectedProvider).toBe("openai");
		expect(snapshot.selectedModel).toBe("gpt-5");
		expect(snapshot.models[0]?.id).toBe("gpt-5");
		expect(snapshot.keybindings.length).toBeGreaterThan(0);
		expect(snapshot.schema.map((entry) => entry.key)).toContain("density");
		expect(snapshot.schema.map((entry) => entry.key)).toContain("keybindings");
	});

	test("sets, resets, and validates settings", async () => {
		const manager = SettingsManager.inMemory();
		const service = new SettingsService({ settingsManager: manager });
		await service.set("global", "defaultThinkingLevel", "high");
		expect(manager.getDefaultThinkingLevel()).toBe("high");
		await service.reset("global", "defaultThinkingLevel");
		expect(manager.getDefaultThinkingLevel()).toBeUndefined();
		expect(service.set("global", "defaultThinkingLevel", "extreme")).rejects.toThrow("invalid");
		await service.set("global", "density", "compact");
		expect((await service.read()).effective.density).toBe("compact");
		expect(service.set("global", "density", "tiny")).rejects.toThrow("density is invalid");
	});

	test("supports project-scoped values", async () => {
		const manager = SettingsManager.inMemory({ defaultModel: "global-model" });
		const service = new SettingsService({ settingsManager: manager });
		await service.set("project", "defaultModel", "project-model");
		const snapshot = await service.read();
		expect(snapshot.project.defaultModel).toBe("project-model");
		expect(snapshot.selectedModel).toBe("project-model");
	});

	test("persists keybinding overrides by scope", async () => {
		const manager = SettingsManager.inMemory();

		const service = new SettingsService({ settingsManager: manager });

		await service.set("project", "keybindings", { "app.commandPalette": ["ctrl+p"] });

		const snapshot = await service.read();

		expect(snapshot.project.keybindings).toEqual({ "app.commandPalette": ["ctrl+p"] });

		expect(snapshot.keybindings.find((binding) => binding.id === "app.commandPalette")?.keys).toEqual(["ctrl+p"]);
	});
});
