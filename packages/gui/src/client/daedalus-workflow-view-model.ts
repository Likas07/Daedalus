import type { AppEvent, DaedalusWorkflowState, ThreadPendingAction } from "@daedalus-pi/app-server-protocol";
import type { SessionSummary } from "./runtime";
import type { ApprovalItem } from "./view-model";

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

export interface ThreadScopedPendingInput {
	readonly id: string;
	readonly title: string;
	readonly summary?: string;
}

export interface ThreadScopedPendingActionsInput {
	readonly threadId?: string;
	readonly sessionId?: string;
	readonly workflow?: DaedalusWorkflowState;
	readonly approvals?: readonly ApprovalItem[];
	readonly threadActions?: readonly ThreadPendingAction[];
	readonly sessions?: readonly SessionSummary[];
}

export interface ThreadScopedPendingActions {
	readonly openQuestions: readonly DaedalusWorkflowState["questions"][number][];
	readonly pendingInput: readonly ThreadScopedPendingInput[];
	readonly approvals: readonly ApprovalItem[];
	readonly threadActions: readonly ThreadPendingAction[];
}

export function threadScopedPendingActions(input: ThreadScopedPendingActionsInput): ThreadScopedPendingActions {
	const sessionId = input.sessionId;
	const threadId = input.threadId;
	const matchesSession = (value?: string): boolean => !!value && (!!sessionId && value === sessionId || !!threadId && value === threadId);
	const workflow = input.workflow;
	const openQuestions = workflow && matchesSession(workflow.sessionId)
		? workflow.questions.filter((question) => question.status === "open")
		: [];
	const threadActions = (input.threadActions ?? []).filter((action) => {
		const record = action as ThreadPendingAction & { sessionId?: string; threadId?: string };
		return !record.sessionId && !record.threadId || matchesSession(record.sessionId) || matchesSession(record.threadId);
	});
	const approvalIds = new Set(threadActions.map((action) => action.approvalId).filter((id): id is string => !!id));
	const approvals = (input.approvals ?? []).filter((approval) => matchesSession(approval.sessionId) && (approvalIds.size === 0 || approvalIds.has(approval.id)));
	const pendingInput = (input.sessions ?? [])
		.filter((session) => matchesSession(session.id) && session.pendingUserInput)
		.map((session) => ({ id: session.id, title: session.bestNextAction?.label ?? "User input requested", summary: session.needsAttentionReason ?? session.latestMessage }));
	return { openQuestions, pendingInput, approvals, threadActions };
}

export function workflowFromTypedEvents(events: readonly AppEvent[]): DaedalusWorkflowState | undefined {
	for (const event of [...events].reverse()) {
		if (
			event.type === "daedalus/workflow/projected" &&
			isRecord(event.payload) &&
			isWorkflow(event.payload.workflow)
		) {
			return event.payload.workflow;
		}
	}
	return undefined;
}

function isWorkflow(value: unknown): value is DaedalusWorkflowState {
	return (
		isRecord(value) && typeof value.sessionId === "string" && Array.isArray(value.todos) && Array.isArray(value.plans)
	);
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
