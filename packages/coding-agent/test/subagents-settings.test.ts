import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("SettingsManager.getSubagentSettings", () => {
	it("returns subagent defaults and preserves agent overrides", () => {
		const manager = SettingsManager.inMemory({
			subagents: {
				enabled: true,
				defaultPrimary: "orchestrator",
				maxDepth: 3,
				maxConcurrency: 6,
				agents: {
					scout: { model: "anthropic/claude-sonnet-4-5", thinkingLevel: "low" },
				},
			},
		});

		expect(manager.getSubagentSettings()).toEqual({
			enabled: true,
			defaultPrimary: "orchestrator",
			maxDepth: 3,
			maxConcurrency: 6,
			agents: {
				scout: { model: "anthropic/claude-sonnet-4-5", thinkingLevel: "low" },
			},
		});
	});

	it("falls back to disabled standard-mode defaults", () => {
		const manager = SettingsManager.inMemory();

		expect(manager.getSubagentSettings()).toEqual({
			enabled: false,
			defaultPrimary: "standard",
			maxDepth: 2,
			maxConcurrency: 4,
			agents: {},
		});
	});
});
