export type TaskState =
	| "queued"
	| "reserved"
	| "starting"
	| "running"
	| "completing"
	| "completed"
	| "failed"
	| "cancelled"
	| "interrupted";

export type TaskExecutionMode = "foreground" | "background";
export type TaskIsolationMode = "shared-branch" | "child-branch";

export interface LaunchInput {
	parentSessionFile: string;
	parentAgent: string;
	parentRunId?: string;
	agent: string;
	goal: string;
	executionMode: TaskExecutionMode;
	isolationMode?: TaskIsolationMode;
	modelKey?: string;
	rootId?: string;
}

export interface TaskRecord extends LaunchInput {
	id: string;
	status: TaskState;
	createdAt: number;
	updatedAt: number;
	summary: string;
	error?: string;
}
