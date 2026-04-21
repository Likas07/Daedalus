import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { initializePlanExecution, loadPlanArtifact, markPlanStepsCompleted, hasUnfinishedPlanWork, parsePlanArtifactText } from "../src/extensions/daedalus/workflow/plan-execution/shared.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

function getText(result: any): string {
	return result.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
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
		writeFileSync(
			planPath,
			"Plan:\n1. Inspect auth flow\n2. Implement token refresh\n3. Add refresh tests\n",
		);
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("initializes execution state from a markdown plan artifact", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({ cwd: tempDir, agentDir, model: getModel("anthropic", "claude-sonnet-4-5")!, settingsManager, sessionManager });
		await session.bindExtensions({});
		const executePlan = session.getToolDefinition("execute_plan");
		expect(executePlan).toBeDefined();

		const result = await executePlan!.execute("execute-plan-1", { path: "docs/plans/auth-plan.md" }, undefined, undefined, { cwd: tempDir } as any);
		expect(getText(result)).toContain("Initialized plan execution");
		expect(result.details.todos).toHaveLength(3);
		expect(result.details.todos[0]).toMatchObject({ content: "Inspect auth flow", status: "in_progress" });
		expect(result.details.unfinished).toBe(true);

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

	it("parses stable plan metadata for lanes and verification criteria", () => {
		const plan = parsePlanArtifactText(
			"Plan:\n1. [lane:auth] Inspect auth flow | verify: identify login handler\n2. Add refresh tests | verify: tests fail before implementation\n",
		);
		expect(plan.steps[0]).toMatchObject({ step: 1, lane: "auth", verification: "identify login handler" });
		expect(plan.steps[1]).toMatchObject({ step: 2, verification: "tests fail before implementation" });
		expect(plan.steps[0]?.id).toContain("plan-step-1-");
	});
});
