import { describe, expect, it } from "vitest";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

describe("role-aware performance tuning", () => {
	it("gives scout and planner semantic/exact discovery tools while keeping task-state writes scoped", () => {
		const agents = getBundledStarterAgents();
		const scout = agents.find((agent) => agent.name === "scout");
		const planner = agents.find((agent) => agent.name === "planner");
		expect(scout?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(["sem_search", "fs_search", "todo_read"]));
		expect(scout?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["sem_workspace_status", "sem_workspace_init", "sem_workspace_sync"]),
		);
		expect(scout?.toolPolicy?.allowedTools).not.toContain("todo_write");
		expect(scout?.toolPolicy?.allowedTools).not.toContain("bash");
		expect(planner?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining([
				"sem_search",
				"fs_search",
				"sem_workspace_status",
				"sem_workspace_init",
				"sem_workspace_sync",
				"todo_read",
				"todo_write",
				"execute_plan",
			]),
		);
	});

	it("tunes worker and reviewer toward exact search and narrow task-state access", () => {
		const agents = getBundledStarterAgents();
		const worker = agents.find((agent) => agent.name === "worker");
		const reviewer = agents.find((agent) => agent.name === "reviewer");
		expect(worker?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(["fs_search", "todo_read", "todo_write", "execute_plan", "sem_workspace_status"]));
		expect(reviewer?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(["fs_search", "todo_read"]));
		expect(reviewer?.toolPolicy?.allowedTools).not.toContain("todo_write");
		expect(reviewer?.toolPolicy?.allowedTools).not.toContain("bash");
	});

	it("adds role-specific prompt doctrine for search and execution-state behavior", () => {
		const agents = getBundledStarterAgents();
		const scout = agents.find((agent) => agent.name === "scout");
		const planner = agents.find((agent) => agent.name === "planner");
		const worker = agents.find((agent) => agent.name === "worker");
		const reviewer = agents.find((agent) => agent.name === "reviewer");
		expect(scout?.systemPrompt).toContain("Prefer sem_search for ambiguous discovery");
		expect(planner?.systemPrompt).toContain("Use execute_plan when a markdown plan artifact should become active tracked execution state.");
		expect(worker?.systemPrompt).toContain("Use todo_write narrowly");
		expect(reviewer?.systemPrompt).toContain("Prefer fs_search/read/todo_read");
	});
});
