import { describe, expect, test } from "bun:test";

import { getBundledStarterAgents } from "./bundled.js";

describe("bundled subagents", () => {
	test("loads bundled prompts and model overrides from text imports", () => {
		const agents = getBundledStarterAgents();

		expect(agents.map((agent) => agent.name)).toEqual(["sage", "muse", "worker"]);
		for (const agent of agents) {
			expect(agent.source).toBe("bundled");
			expect(agent.description.length).toBeGreaterThan(0);
			expect(agent.systemPrompt).toContain("You are");
			expect(agent.modelOverrides?.gpt).toBeString();
			expect(agent.modelOverrides?.claude).toBeString();
			expect(agent.toolPolicy).toBeDefined();
		}
	});
});
