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

	test("worker advertises scoped plan_task_read guidance", () => {
		const worker = getBundledStarterAgents().find((agent) => agent.name === "worker");

		expect(worker?.tools).toContain("plan_task_read");
		expect(worker?.toolPolicy?.allowedTools).toContain("plan_task_read");
		expect(worker?.systemPrompt).toContain("call plan_task_read() before edits");
		expect(worker?.systemPrompt).toContain("stay within the assigned task and listed files when practical");
		expect(worker?.systemPrompt).toContain("file scope as soft in v1");
		expect(worker?.systemPrompt).toContain("changed files, verification commands run, verification results");
	});
});
