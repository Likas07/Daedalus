import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("SettingsManager subagent settings", () => {
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

	it("updates global subagent defaults", () => {
		const manager = SettingsManager.inMemory();
		manager.setSubagentsEnabled(true);
		manager.setSubagentDefaultPrimary("orchestrator");
		manager.setSubagentMaxDepth(3);
		manager.setSubagentMaxConcurrency(6);

		expect(manager.getSubagentSettings()).toEqual({
			enabled: true,
			defaultPrimary: "orchestrator",
			maxDepth: 3,
			maxConcurrency: 6,
			agents: {},
		});
	});

	it("stores and clears per-role overrides", () => {
		const manager = SettingsManager.inMemory();
		manager.setSubagentRoleModel("scout", "anthropic/claude-sonnet-4-5");
		manager.setSubagentRoleThinkingLevel("scout", "low");

		expect(manager.getSubagentSettings().agents.scout).toEqual({
			model: "anthropic/claude-sonnet-4-5",
			thinkingLevel: "low",
		});

		manager.clearSubagentRoleOverride("scout");
		expect(manager.getSubagentSettings().agents.scout).toBeUndefined();
	});
});
