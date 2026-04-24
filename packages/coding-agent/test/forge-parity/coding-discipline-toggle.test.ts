import { describe, expect, it } from "vitest";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { buildSystemPrompt } from "../../src/core/system-prompt.js";

describe("coding discipline toggle", () => {
	it("defaults to enabled in settings", () => {
		const settings = SettingsManager.inMemory();
		expect(settings.getCodingDisciplineEnabled()).toBe(true);
		expect(settings.getCodingDisciplineSettings()).toEqual({ enabled: true });
	});

	it("updates the enabled flag in memory", () => {
		const settings = SettingsManager.inMemory();
		settings.setCodingDisciplineEnabled(false);
		expect(settings.getCodingDisciplineEnabled()).toBe(false);
		expect(settings.getCodingDisciplineSettings()).toEqual({ enabled: false });
	});

	it("omits the coding discipline section when disabled", () => {
		const prompt = buildSystemPrompt({
			selectedTools: [],
			contextFiles: [],
			skills: [],
			codingDisciplineEnabled: false,
		});
		expect(prompt).not.toContain("## Coding Discipline");
	});
});
