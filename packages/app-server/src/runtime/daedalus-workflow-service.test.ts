import { describe, expect, test } from "bun:test";
import type { SessionEntry, SessionStore, SessionStoreSession } from "@daedalus-pi/coding-agent";
import { DaedalusWorkflowService, projectDaedalusWorkflow } from "./daedalus-workflow-service";

function custom(customType: string, data: unknown, timestamp = "2026-04-26T00:00:00.000Z"): SessionEntry {
	return { type: "custom", id: crypto.randomUUID(), parentId: null, timestamp, customType, data } as SessionEntry;
}

describe("daedalus workflow service", () => {
	test("projects plans, todos, questions, semantic workspace, and typed lanes", () => {
		const workflow = projectDaedalusWorkflow("s1", [
			custom("plan-mode", { mode: "plan" }),
			custom("plan-execution-init", { plan: { id: "p1", title: "GUI parity", status: "executing", taskIds: ["t1"] }, todos: [{ id: "t1", title: "Build UI", status: "in_progress", dependencies: ["p1"], summary: "worker active" }] }),
			custom("question", { id: "q1", prompt: "Proceed?", choices: ["yes", "no"] }),
			custom("sem-search-workspace", { status: "ready", path: "/repo", summary: "indexed" }),
		]);
		expect(workflow.plans[0]).toMatchObject({ id: "p1", status: "executing" });
		expect(workflow.todos[0]).toMatchObject({ id: "t1", status: "in_progress" });
		expect(workflow.questions[0]).toMatchObject({ id: "q1", status: "open" });
		expect(workflow.semanticWorkspace).toMatchObject({ status: "ready", indexedPath: "/repo" });
		expect(workflow.orchestration.mode).toBe("plan");
		expect(workflow.orchestration.lanes[0]).toMatchObject({ id: "t1", status: "running" });
	});

	test("does not create lanes for unrelated entries", () => {
		const workflow = projectDaedalusWorkflow("s1", [custom("primary-role-mode", { role: "sage" })]);
		expect(workflow.orchestration.lanes).toEqual([]);
		expect(workflow.todos).toEqual([]);
	});

	test("redacts internal prompt text from workflow projections", () => {
		const workflow = projectDaedalusWorkflow("s1", [
			custom("plan-execution-init", {
				plan: { id: "p1", title: "Plan <internal>hidden system prompt</internal>", status: "executing" },
				todos: [{ id: "t1", title: "Build", status: "completed", summary: "done <internal>secret</internal>" }],
			}),
			custom("question", { id: "q1", prompt: "Proceed? <internal>never show</internal>" }),
		]);
		expect(JSON.stringify(workflow)).not.toContain("hidden system prompt");
		expect(JSON.stringify(workflow)).not.toContain("never show");
		expect(workflow.questions[0]?.prompt).toContain("[internal omitted]");
	});

	test("reads from persisted session store", async () => {
		const session: SessionStoreSession = { header: { type: "session", version: 3, id: "s1", timestamp: "now", cwd: "/repo" }, entries: [custom("questionnaire", { prompt: "Pick one", answer: "A" })] };
		const store = { read: async () => session } as unknown as SessionStore;
		const service = new DaedalusWorkflowService({ sessionStore: store });
		expect((await service.read("s1")).questions[0]?.status).toBe("answered");
	});
});
