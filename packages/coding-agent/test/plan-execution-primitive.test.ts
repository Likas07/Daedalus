import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import {
	hasUnfinishedPlanWork,
	initializePlanExecution,
	loadPlanArtifact,
	markPlanStepsCompleted,
	parsePlanArtifactText,
} from "../src/extensions/daedalus/workflow/plan-execution/shared.js";

function getText(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("execute_plan primitive", () => {
	let tempDir: string;
	let agentDir: string;
	let planPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-execute-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "docs", "plans"), { recursive: true });
		planPath = join(tempDir, "docs", "plans", "auth-plan.md");
		writeFileSync(planPath, "Plan:\n1. Inspect auth flow\n2. Implement token refresh\n3. Add refresh tests\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("initializes execution state from a markdown plan artifact", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});
		const executePlan = session.getToolDefinition("execute_plan");
		expect(executePlan).toBeDefined();

		const result = await executePlan!.execute(
			"execute-plan-1",
			{ path: "docs/plans/auth-plan.md" },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(result)).toContain("Initialized plan execution");
		expect(result.details.todos).toHaveLength(3);
		expect(result.details.todos[0]).toMatchObject({ content: "Inspect auth flow", status: "in_progress" });
		expect(result.details.unfinished).toBe(true);

		session.dispose();
	});

	it("reads only the active plan task detail", async () => {
		writeFileSync(
			planPath,
			[
				"# Example Implementation Plan",
				"",
				"### Task 1: Add read guidance",
				"",
				"**Files:**",
				"- Modify: `packages/coding-agent/src/core/tools/read.ts`",
				"",
				"- [ ] **Step 1: Write failing test**",
				"",
				"Run: `bun test packages/coding-agent/test/tools.test.ts`",
				"",
				"### Task 2: Profile reads",
				"",
				"**Files:**",
				"- Modify: `packages/coding-agent/src/extensions/daedalus/tools/context-profile/analyzer.ts`",
			].join("\n"),
		);
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		const executePlan = session.getToolDefinition("execute_plan")!;
		await executePlan.execute("execute-plan-task-detail", { path: "docs/plans/auth-plan.md" }, undefined, undefined, { cwd: tempDir } as any);

		const taskRead = session.getToolDefinition("plan_task_read");
		expect(taskRead).toBeDefined();
		const result = await taskRead!.execute("plan-task-read-1", { selector: "active" }, undefined, undefined, { cwd: tempDir } as any);
		const output = getText(result);

		expect(output).toContain("Task 1: Add read guidance");
		expect(output).toContain("packages/coding-agent/src/core/tools/read.ts");
		expect(output).not.toContain("Task 2: Profile reads");
		expect(Buffer.byteLength(output, "utf8")).toBeLessThan(10_000);

		session.dispose();
	});

	it("resumes partially completed plans from existing execution state", () => {
		const plan = loadPlanArtifact(planPath, tempDir);
		const initial = initializePlanExecution(plan);
		const progressed = markPlanStepsCompleted({ plan, todos: initial.todos, summary: initial.summary }, [1]);
		const resumed = initializePlanExecution(plan, progressed);
		expect(resumed.todos[0]).toMatchObject({ status: "completed" });
		expect(resumed.todos[1]).toMatchObject({ status: "in_progress" });
		expect(hasUnfinishedPlanWork({ plan, todos: resumed.todos, summary: resumed.summary })).toBe(true);
	});

	it("marks steps complete and detects unfinished plan state", () => {
		const plan = loadPlanArtifact(planPath, tempDir);
		const initial = initializePlanExecution(plan);
		const progressed = markPlanStepsCompleted({ plan, todos: initial.todos, summary: initial.summary }, [1, 2, 3]);
		expect(progressed.todos.every((todo) => todo.status === "completed")).toBe(true);
		expect(hasUnfinishedPlanWork(progressed)).toBe(false);
	});

	it("parses writing-plans task sections into compact todos and task details", () => {
		const plan = parsePlanArtifactText(
			[
				"# Example Implementation Plan",
				"",
				"### Task 1: Add read guidance",
				"",
				"**Files:**",
				"- Modify: `packages/coding-agent/src/core/tools/read.ts`",
				"- Test: `packages/coding-agent/test/tools.test.ts`",
				"",
				"- [ ] **Step 1: Write the failing test**",
				"",
				"```ts",
				"expect(true).toBe(true);",
				"```",
				"",
				"- [ ] **Step 2: Run focused test**",
				"",
				"Run: `bun test packages/coding-agent/test/tools.test.ts`",
				"Expected: PASS",
				"",
				"### Task 2: Profile reads",
				"",
				"**Files:**",
				"- Modify: `packages/coding-agent/src/extensions/daedalus/tools/context-profile/analyzer.ts`",
				"",
				"- [ ] **Step 1: Add analyzer test**",
			].join("\n"),
		);

		expect(plan.format).toBe("markdown-task-sections-v1");
		expect(plan.steps).toHaveLength(2);
		expect(plan.steps.map((step) => step.content)).toEqual(["Task 1: Add read guidance", "Task 2: Profile reads"]);
		expect(plan.steps[0]).toMatchObject({ step: 1, content: "Task 1: Add read guidance" });
		expect(plan.steps[0].detail).toContain("Write the failing test");
		expect(plan.steps[0].files).toContain("packages/coding-agent/src/core/tools/read.ts");
	});

	it("parses stable plan metadata for lanes and verification criteria", () => {
		const plan = parsePlanArtifactText(
			"Plan:\n1. [lane:auth] Inspect auth flow | verify: identify login handler\n2. Add refresh tests | verify: tests fail before implementation\n",
		);
		expect(plan.steps[0]).toMatchObject({ step: 1, lane: "auth", verification: "identify login handler" });
		expect(plan.steps[1]).toMatchObject({ step: 2, verification: "tests fail before implementation" });
		expect(plan.steps[0]?.id).toContain("plan-step-1-");
	});
});
