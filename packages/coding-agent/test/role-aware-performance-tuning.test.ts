import { describe, expect, it } from "vitest";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

describe("role-aware performance tuning", () => {
	it("gives sage and muse semantic/exact discovery tools while keeping task-state writes scoped", () => {
		const agents = getBundledStarterAgents();
		const sage = agents.find((agent) => agent.name === "sage");
		const muse = agents.find((agent) => agent.name === "muse");
		expect(sage?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["sem_search", "fs_search", "todo_read", "write", "hashline_edit"]),
		);
		expect(sage?.toolPolicy?.writableGlobs).toEqual(["**/*.md"]);
		expect(sage?.toolPolicy?.allowedTools).not.toContain("sem_workspace_status");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("sem_workspace_init");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("sem_workspace_sync");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("todo_write");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("bash");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("plan_create");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("plan_validate");
		expect(sage?.toolPolicy?.allowedTools).not.toContain("skill");
		expect(muse?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["sem_search", "fs_search", "todo_read", "todo_write", "plan_create", "plan_validate"]),
		);
		expect(muse?.toolPolicy?.allowedTools).not.toContain("execute_plan");
		expect(muse?.toolPolicy?.allowedTools).not.toContain("sem_workspace_status");
		expect(muse?.toolPolicy?.allowedTools).not.toContain("sem_workspace_init");
		expect(muse?.toolPolicy?.allowedTools).not.toContain("sem_workspace_sync");
	});

	it("tunes worker toward exact search and narrow task-state access while reviewer behavior is absorbed elsewhere", () => {
		const agents = getBundledStarterAgents();
		const worker = agents.find((agent) => agent.name === "worker");
		expect(worker?.toolPolicy?.allowedTools).toEqual(
			expect.arrayContaining(["fs_search", "todo_read", "todo_write", "execute_plan"]),
		);
		expect(worker?.toolPolicy?.allowedTools).not.toContain("sem_workspace_status");
		expect(agents.some((agent) => agent.name === "reviewer")).toBe(false);
	});

	it("adds role-specific prompt doctrine for search and execution-state behavior", () => {
		const agents = getBundledStarterAgents();
		const sage = agents.find((agent) => agent.name === "sage");
		const muse = agents.find((agent) => agent.name === "muse");
		const worker = agents.find((agent) => agent.name === "worker");
		expect(sage?.systemPrompt).toContain("Stop once enough evidence exists");
		expect(muse?.systemPrompt).toContain("Create durable plan artifacts under `plans/`");
		expect(muse?.systemPrompt).toContain("At the start of every Muse task, load and use the `writing-plans` skill");
		expect(muse?.systemPrompt).toContain("executable-plan gate");
		expect(muse?.systemPrompt).toContain("`writing-plans` -> `plan_create` -> Muse `plan_validate`");
		expect(muse?.systemPrompt).toContain("`plan_path`");
		expect(muse?.systemPrompt).toContain("`recommended_parent_action`");
		expect(muse?.systemPrompt).toContain("Do not force plan artifacts for advisory architecture discussion");
		expect(muse?.systemPrompt).toContain("Do not use Markdown checkbox lists as Muse's plan output format");
		expect(worker?.systemPrompt).toContain("Use todo_write narrowly");
		expect(worker?.systemPrompt).toContain("leave final synthesis and user-facing judgment to Daedalus");
	});
});
