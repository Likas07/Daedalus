import type { SessionId } from "./ids";
import type { OrchestrationProjection } from "./orchestration";

export type DaedalusTodoStatus = "pending" | "in_progress" | "completed" | "blocked" | "cancelled";
export type DaedalusPlanStatus = "draft" | "ready" | "executing" | "completed" | "blocked";
export type DaedalusQuestionStatus = "open" | "answered" | "cancelled";
export type DaedalusSemanticStatus = "idle" | "indexing" | "ready" | "error";

export interface DaedalusTodoItem {
	readonly id: string;
	readonly title: string;
	readonly status: DaedalusTodoStatus;
	readonly summary?: string;
	readonly dependencies: readonly string[];
}

export interface DaedalusPlanState {
	readonly id: string;
	readonly title: string;
	readonly status: DaedalusPlanStatus;
	readonly path?: string;
	readonly taskIds: readonly string[];
	readonly updatedAt?: string;
}

export interface DaedalusQuestionPrompt {
	readonly id: string;
	readonly kind: "question" | "questionnaire";
	readonly prompt: string;
	readonly status: DaedalusQuestionStatus;
	readonly choices: readonly string[];
	readonly answer?: string;
	readonly updatedAt?: string;
}

export interface DaedalusSemanticWorkspaceState {
	readonly status: DaedalusSemanticStatus;
	readonly indexedPath?: string;
	readonly indexName?: string;
	readonly summary?: string;
	readonly updatedAt?: string;
}

export interface DaedalusWorkflowState {
	readonly sessionId: SessionId;
	readonly plans: readonly DaedalusPlanState[];
	readonly todos: readonly DaedalusTodoItem[];
	readonly questions: readonly DaedalusQuestionPrompt[];
	readonly semanticWorkspace: DaedalusSemanticWorkspaceState;
	readonly orchestration: OrchestrationProjection;
	readonly updatedAt?: string;
}
