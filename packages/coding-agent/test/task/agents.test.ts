import { describe, expect, test } from "bun:test";
import { clearBundledAgentsCache, loadBundledAgents } from "../../src/task/agents";

describe("bundled agent profiles", () => {
	test("includes an explicit orchestrator profile", () => {
		clearBundledAgentsCache();
		const orchestrator = loadBundledAgents().find(agent => agent.name === "orchestrator");

		expect(orchestrator).toBeDefined();
		expect(orchestrator).toMatchObject({
			name: "orchestrator",
			orchestrationRole: "orchestrator",
			readOnly: true,
			canSpawnAgents: true,
			useWorktree: false,
		});
		expect(orchestrator?.allowedTools).toContain("task");
	});
});
