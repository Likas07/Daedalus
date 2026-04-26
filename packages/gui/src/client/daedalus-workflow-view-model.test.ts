import { describe, expect, test } from "bun:test";
import type { AppEvent, DaedalusWorkflowState } from "@daedalus-pi/app-server-protocol";
import { buildDaedalusWorkflowViewModel, workflowFromTypedEvents } from "./daedalus-workflow-view-model";
import { orchestrationFromEvents } from "./orchestration-state";

const workflow: DaedalusWorkflowState = {
	sessionId: "s1",
	plans: [{ id: "p1", title: "Plan", status: "executing", taskIds: ["t1"] }],
	todos: [
		{ id: "t1", title: "Done", status: "completed", dependencies: [] },
		{ id: "t2", title: "Blocked", status: "blocked", dependencies: ["t1"] },
	],
	questions: [{ id: "q1", kind: "question", prompt: "Continue?", status: "open", choices: [] }],
	semanticWorkspace: { status: "ready", indexedPath: "/repo" },
	orchestration: {
		sessionId: "s1",
		mode: "build",
		lanes: [{ id: "t2", kind: "subagent", title: "Blocked", status: "blocked", dependencies: ["t1"], artifacts: [] }],
		checkpoints: [],
	},
};

describe("daedalus workflow view model", () => {
	test("summarizes todo, plan, question, and semantic state", () => {
		const view = buildDaedalusWorkflowViewModel(workflow);
		expect(view.todoSummary).toBe("1/2 complete · 1 blocked");
		expect(view.planSummary).toBe("Plan · executing");
		expect(view.semanticSummary).toBe("ready · /repo");
		expect(view.openQuestions.map((question) => question.id)).toEqual(["q1"]);
	});

	test("uses typed workflow events instead of substring lane inference", () => {
		const unrelated: AppEvent = { id: "e1", type: "agent mentioned subagent in prose", ts: "now", payload: {} };
		expect(orchestrationFromEvents([unrelated]).lanes).toEqual([]);
		const typed: AppEvent = {
			id: "e2",
			type: "daedalus/workflow/projected",
			ts: "now",
			sessionId: "s1",
			payload: { workflow },
		};
		expect(workflowFromTypedEvents([unrelated, typed])?.orchestration.lanes[0]?.id).toBe("t2");
	});
});
