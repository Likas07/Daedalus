import type { AppEvent, DaedalusWorkflowState } from "@daedalus-pi/app-server-protocol";

export interface DaedalusWorkflowViewModel {
	readonly todoSummary: string;
	readonly planSummary: string;
	readonly semanticSummary: string;
	readonly openQuestions: readonly DaedalusWorkflowState["questions"][number][];
	readonly workflow: DaedalusWorkflowState;
}

export function buildDaedalusWorkflowViewModel(workflow: DaedalusWorkflowState): DaedalusWorkflowViewModel {
	const completed = workflow.todos.filter((todo) => todo.status === "completed").length;
	const blocked = workflow.todos.filter((todo) => todo.status === "blocked").length;
	const activePlan = workflow.plans.at(-1);
	return {
		workflow,
		todoSummary: `${completed}/${workflow.todos.length} complete${blocked ? ` · ${blocked} blocked` : ""}`,
		planSummary: activePlan ? `${activePlan.title} · ${activePlan.status}` : "No plan captured",
		semanticSummary: workflow.semanticWorkspace.indexedPath
			? `${workflow.semanticWorkspace.status} · ${workflow.semanticWorkspace.indexedPath}`
			: workflow.semanticWorkspace.status,
		openQuestions: workflow.questions.filter((question) => question.status === "open"),
	};
}

export function workflowFromTypedEvents(events: readonly AppEvent[]): DaedalusWorkflowState | undefined {
	for (const event of [...events].reverse()) {
		if (event.type === "daedalus/workflow/projected" && isRecord(event.payload) && isWorkflow(event.payload.workflow)) {
			return event.payload.workflow;
		}
	}
	return undefined;
}

function isWorkflow(value: unknown): value is DaedalusWorkflowState {
	return isRecord(value) && typeof value.sessionId === "string" && Array.isArray(value.todos) && Array.isArray(value.plans);
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
