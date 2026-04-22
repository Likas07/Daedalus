import { describe, expect, it } from "vitest";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

describe("role-aware performance tuning", () => {
	it("gives sage and muse semantic/exact discovery tools while keeping task-state writes scoped", () => {
		const agents = getBundledStarterAgents();
		const sage = agents.find((agent) => agent.name === "sage");
		const muse = agents.find((agent) => agent.name === "muse");
		expect(sage?.toolPolicy?.allowedTools).toEqual(expect.arrayContaining(["sem_search", "fs_search", "todo_read"]));
		expect(sage?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["sem_workspace_status", "sem_workspace_init", "sem_workspace_sync"]),
		);
		expect(sage?.toolPolicy?.allowedTools).not.toContain("todo_write");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("bash");
		expect(muse?.toolPolicy?.allowedTools).toEqual(
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

	it("tunes worker toward exact search and narrow task-state access while reviewer behavior is absorbed elsewhere", () => {
		const agents = getBundledStarterAgents();
		const worker = agents.find((agent) => agent.name === "worker");
		expect(worker?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["fs_search", "todo_read", "todo_write", "execute_plan", "sem_workspace_status"]),
		);
		expect(agents.some((agent) => agent.name === "reviewer")).toBe(false);
	});

	it("adds role-specific prompt doctrine for search and execution-state behavior", () => {
		const agents = getBundledStarterAgents();
		const sage = agents.find((agent) => agent.name === "sage");
		const muse = agents.find((agent) => agent.name === "muse");
		const worker = agents.find((agent) => agent.name === "worker");
		expect(sage?.systemPrompt).toContain("Stop once enough evidence exists");
		expect(muse?.systemPrompt).toContain("Create durable plan artifacts under `plans/`");
		expect(worker?.systemPrompt).toContain("Use todo_write narrowly");
		expect(worker?.systemPrompt).toContain("leave final synthesis and user-facing judgment to Daedalus");
	});
});
