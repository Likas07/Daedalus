import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("SettingsManager subagent settings", () => {
	it("returns v2 defaults and preserves configured agent overrides", () => {
		const manager = SettingsManager.inMemory({
			subagents: {
				delegationAggressiveness: "aggressive",
				maxDepth: 3,
				maxConcurrency: 6,
				backgroundRoles: ["sage"],
				branchIsolation: {
					enabled: true,
					mutationThreshold: "always",
					namingTemplate: "subagent/{parentBranch}/{agent}/{runId}",
				},
				agents: {
					sage: {
						model: "anthropic/claude-sonnet-4-5",
						thinkingLevel: "low",
						executionModePreference: "background",
					},
				},
			},
		});

		expect(manager.getSubagentSettings()).toEqual({
			delegationAggressiveness: "aggressive",
			maxDepth: 3,
			maxConcurrency: 6,
			backgroundRoles: ["sage"],
			branchIsolation: {
				enabled: true,
				mutationThreshold: "always",
				namingTemplate: "subagent/{parentBranch}/{agent}/{runId}",
			},
			agents: {
				sage: {
					model: "anthropic/claude-sonnet-4-5",
					thinkingLevel: "low",
					executionModePreference: "background",
				},
			},
		});
	});

	it("falls back to orchestrator-native v2 defaults", () => {
		const manager = SettingsManager.inMemory();

		expect(manager.getSubagentSettings()).toEqual({
			delegationAggressiveness: "balanced",
			maxDepth: 2,
			maxConcurrency: 4,
			backgroundRoles: ["sage"],
			branchIsolation: {
				enabled: true,
				mutationThreshold: "high-risk",
				namingTemplate: "subagent/{parentBranch}/{agent}/{runId}",
			},
			agents: {},
		});
	});

	it("updates v2 global subagent defaults", () => {
		const manager = SettingsManager.inMemory();
		manager.setSubagentDelegationAggressiveness("conservative");
		manager.setSubagentMaxDepth(3);
		manager.setSubagentMaxConcurrency(6);
		manager.setSubagentBackgroundRoles(["muse"]);
		manager.setSubagentBranchIsolationThreshold("always");

		expect(manager.getSubagentSettings()).toEqual({
			delegationAggressiveness: "conservative",
			maxDepth: 3,
			maxConcurrency: 6,
			backgroundRoles: ["muse"],
			branchIsolation: {
				enabled: true,
				mutationThreshold: "always",
				namingTemplate: "subagent/{parentBranch}/{agent}/{runId}",
			},
			agents: {},
		});
	});

	it("stores and clears v2 per-role overrides", () => {
		const manager = SettingsManager.inMemory();
		manager.setSubagentRoleModel("sage", "anthropic/claude-sonnet-4-5");
		manager.setSubagentRoleThinkingLevel("sage", "low");
		manager.setSubagentRoleExecutionModePreference("sage", "background");
		manager.setSubagentRoleIsolationPreference("sage", "shared-branch");

		expect(manager.getSubagentSettings().agents.sage).toEqual({
			model: "anthropic/claude-sonnet-4-5",
			thinkingLevel: "low",
			executionModePreference: "background",
			isolationPreference: "shared-branch",
		});

		manager.clearSubagentRoleOverride("sage");
		expect(manager.getSubagentSettings().agents.sage).toBeUndefined();
	});
});
