import type { SessionEntry, SessionStore } from "@daedalus-pi/coding-agent";
import type {
	DaedalusPlanState,
	DaedalusQuestionPrompt,
	DaedalusSemanticWorkspaceState,
	DaedalusTodoItem,
	DaedalusWorkflowState,
	OrchestrationArtifactLink,
	OrchestrationLane,
	OrchestrationProjection,
	SessionId,
} from "@daedalus-pi/app-server-protocol";

export interface DaedalusWorkflowServiceOptions {
	readonly sessionStore: SessionStore;
}

export class DaedalusWorkflowService {
	constructor(private readonly options: DaedalusWorkflowServiceOptions) {}

	async read(sessionId: SessionId): Promise<DaedalusWorkflowState> {
		const session = await this.options.sessionStore.read({ sessionId });
		return projectDaedalusWorkflow(session.header.id as SessionId, session.entries);
	}
}

export function projectDaedalusWorkflow(sessionId: SessionId, entries: readonly SessionEntry[]): DaedalusWorkflowState {
	const todos = new Map<string, DaedalusTodoItem>();
	const plans = new Map<string, DaedalusPlanState>();
	const questions = new Map<string, DaedalusQuestionPrompt>();
	let semanticWorkspace: DaedalusSemanticWorkspaceState = { status: "idle" };
	let mode: OrchestrationProjection["mode"] = "build";
	let updatedAt: string | undefined;
	for (const entry of entries) {
		updatedAt = entry.timestamp ?? updatedAt;
		const customType = customTypeOf(entry);
		const data = dataOf(entry);
		if (customType === "plan-mode") mode = readMode(data) ?? mode;
		for (const todo of readTodos(customType, data)) todos.set(todo.id, todo);
		const plan = readPlan(customType, data, entry.timestamp);
		if (plan) plans.set(plan.id, plan);
		const question = readQuestion(customType, data, entry.timestamp);
		if (question) questions.set(question.id, question);
		semanticWorkspace = readSemantic(customType, data, entry.timestamp) ?? semanticWorkspace;
	}
	const lanes = [...todos.values()].map((todo): OrchestrationLane => ({
		id: todo.id,
		sessionId,
		kind: "subagent",
		title: todo.title,
		status: laneStatus(todo.status),
		summary: todo.summary,
		dependencies: todo.dependencies,
		blockedBy: todo.status === "blocked" ? todo.dependencies : undefined,
		artifacts: resultArtifacts(todo),
		updatedAt,
	}));
	const orchestration: OrchestrationProjection = {
		sessionId,
		mode,
		lanes,
		checkpoints: lanes.filter((lane) => lane.status === "completed"),
		updatedAt,
	};
	return { sessionId, plans: [...plans.values()], todos: [...todos.values()], questions: [...questions.values()], semanticWorkspace, orchestration, updatedAt };
}

function customTypeOf(entry: SessionEntry): string | undefined {
	return "customType" in entry && typeof entry.customType === "string" ? entry.customType : undefined;
}
function dataOf(entry: SessionEntry): Record<string, unknown> {
	if ("data" in entry && isRecord(entry.data)) return entry.data;
	if ("details" in entry && isRecord(entry.details)) return entry.details;
	return {};
}
function readTodos(customType: string | undefined, data: Record<string, unknown>): DaedalusTodoItem[] {
	const source = Array.isArray(data.todos) ? data.todos : Array.isArray(data.items) ? data.items : undefined;
	if (!source || !(customType?.includes("todo") || customType === "plan-execution-init" || customType === "status-dashboard")) return [];
	return source.filter(isRecord).map((item, index) => ({
		id: text(item, "id") ?? `todo-${index + 1}`,
		title: text(item, "title") ?? text(item, "content") ?? text(item, "text") ?? `Todo ${index + 1}`,
		status: todoStatus(text(item, "status")),
		summary: text(item, "summary"),
		dependencies: strings(item.dependencies),
	}));
}
function readPlan(customType: string | undefined, data: Record<string, unknown>, updatedAt?: string): DaedalusPlanState | undefined {
	const plan = isRecord(data.plan) ? data.plan : customType?.includes("plan") && customType !== "plan-mode" ? data : undefined;
	if (!plan) return undefined;
	return { id: text(plan, "id") ?? text(plan, "planId") ?? "plan", title: text(plan, "title") ?? text(plan, "goal") ?? "Plan", status: planStatus(text(plan, "status") ?? customType), path: text(plan, "path"), taskIds: strings(plan.taskIds), updatedAt };
}
function readQuestion(customType: string | undefined, data: Record<string, unknown>, updatedAt?: string): DaedalusQuestionPrompt | undefined {
	if (customType !== "question" && customType !== "questionnaire") return undefined;
	return { id: text(data, "id") ?? customType, kind: customType, prompt: text(data, "prompt") ?? text(data, "question") ?? "Question", status: data.answer ? "answered" : "open", choices: strings(data.choices), answer: text(data, "answer"), updatedAt };
}
function readSemantic(customType: string | undefined, data: Record<string, unknown>, updatedAt?: string): DaedalusSemanticWorkspaceState | undefined {
	if (!customType?.includes("sem")) return undefined;
	return { status: semanticStatus(text(data, "status")), indexedPath: text(data, "indexedPath") ?? text(data, "path"), indexName: text(data, "indexName"), summary: text(data, "summary"), updatedAt };
}
function laneStatus(status: DaedalusTodoItem["status"]): OrchestrationLane["status"] {
	if (status === "in_progress") return "running";
	if (status === "completed") return "completed";
	if (status === "blocked") return "blocked";
	if (status === "cancelled") return "failed";
	return "queued";
}
function resultArtifacts(todo: DaedalusTodoItem): OrchestrationArtifactLink[] {
	return todo.summary ? [{ kind: "transcript", id: todo.id, label: "summary" }] : [];
}
function readMode(data: Record<string, unknown>): OrchestrationProjection["mode"] | undefined {
	const mode = text(data, "mode");
	return mode === "plan" || mode === "build" || mode === "yolo" ? mode : undefined;
}
function todoStatus(value?: string): DaedalusTodoItem["status"] {
	if (value === "in_progress" || value === "completed" || value === "blocked" || value === "cancelled") return value;
	return "pending";
}
function planStatus(value?: string): DaedalusPlanState["status"] {
	if (value?.includes("complete")) return "completed";
	if (value?.includes("execut")) return "executing";
	if (value === "ready" || value === "blocked") return value;
	return "draft";
}
function semanticStatus(value?: string): DaedalusSemanticWorkspaceState["status"] {
	if (value === "indexing" || value === "ready" || value === "error") return value;
	return "idle";
}
function text(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}
function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
