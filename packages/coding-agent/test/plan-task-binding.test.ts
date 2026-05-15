import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSubagentTools } from "../src/core/subagents/policy.js";
import type { Tool } from "../src/core/tools/index.js";
import { writeExecutablePlanFiles } from "../src/extensions/daedalus/workflow/plan-execution/schema.js";
import { readBoundPlanTask } from "../src/extensions/daedalus/workflow/plan-execution/shared.js";

const tempDirs: string[] = [];

function createTempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-plan-task-binding-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "docs", "plans", "2026_05_15"), { recursive: true });
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeSamplePlan(cwd: string) {
	return writeExecutablePlanFiles(
		{
			schemaVersion: 1,
			title: "Scoped task plan",
			goal: "Verify scoped task reads",
			architecture: "Test only",
			techStack: ["TypeScript"],
			tasks: [
				{
					id: "task-a",
					title: "Allowed bound task",
					dependencies: [],
					files: { create: ["src/a.ts"], modify: [], test: ["test/a.test.ts"] },
					steps: [{ title: "Edit A", body: "Only A should be visible." }],
					verification: [{ command: "bun test test/a.test.ts", expected: "passes" }],
				},
				{
					id: "task-b",
					title: "Hidden sibling task",
					dependencies: [],
					files: { create: [], modify: ["src/secret.ts"], test: [] },
					steps: [{ title: "Edit B", body: "This sibling task must not be returned." }],
					verification: [{ command: "bun test test/b.test.ts", expected: "passes" }],
				},
			],
		},
		join(cwd, "docs", "plans", "2026_05_15", "scoped.md"),
	);
}

const parentPlanTaskRead: Tool = {
	name: "plan_task_read",
	description: "parent selector tool",
	parameters: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
	async execute() {
		throw new Error("parent selector tool should be replaced for bound subagents");
	},
} as Tool;

describe("bound plan task reads", () => {
	it("reads and formats only the bound task from a planPath and taskId", () => {
		const cwd = createTempRepo();
		const files = writeSamplePlan(cwd);

		const step = readBoundPlanTask(cwd, { type: "plan-task", planPath: files.sidecarPath, taskId: "task-a" });

		expect(step.id).toBe("task-a");
		expect(step.detail).toContain("Allowed bound task");
		expect(step.detail).toContain("src/a.ts");
		expect(step.detail).not.toContain("Hidden sibling task");
	});

	it("does not expose plan_task_read to unbound subagents", () => {
		const cwd = createTempRepo();
		const tools = createSubagentTools(
			cwd,
			{ allowedTools: ["plan_task_read"], writableGlobs: [], spawns: [], maxDepth: 1 },
			[parentPlanTaskRead],
		);

		expect(tools.some((tool) => tool.name === "plan_task_read")).toBe(false);
	});

	it("replaces parent plan_task_read with a zero-arg bound task reader", async () => {
		const cwd = createTempRepo();
		const files = writeSamplePlan(cwd);
		const tools = createSubagentTools(
			cwd,
			{ allowedTools: ["plan_task_read"], writableGlobs: [], spawns: [], maxDepth: 1 },
			[parentPlanTaskRead],
			{ type: "plan-task", planPath: files.sidecarPath, taskId: "task-a" },
		);

		const tool = tools.find((candidate) => candidate.name === "plan_task_read");
		expect(tool).toBeDefined();
		expect(JSON.stringify(tool!.parameters)).not.toContain("selector");
		const result = await tool!.execute("bound-read", {}, undefined, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";

		expect(text).toContain("Allowed bound task");
		expect(text).toContain("src/a.ts");
		expect(text).not.toContain("Hidden sibling task");
	});
});
