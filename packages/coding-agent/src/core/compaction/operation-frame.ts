export type SummaryOperation =
	| { kind: "file_read"; path: string }
	| { kind: "file_update"; path: string }
	| { kind: "file_remove"; path: string }
	| { kind: "undo"; path: string }
	| { kind: "search"; pattern: string }
	| { kind: "sem_search"; queries: { query: string; useCase: string }[] }
	| { kind: "shell"; command: string; exitCode?: number; artifactPaths?: { stdout?: string; stderr?: string } }
	| { kind: "fetch"; url: string; artifactPath?: string }
	| { kind: "followup"; question: string }
	| { kind: "plan"; planName: string }
	| { kind: "skill"; name: string }
	| { kind: "task"; agentId: string }
	| { kind: "mcp"; name: string }
	| { kind: "todo_write"; changes: Array<{ kind: "added" | "updated" | "removed"; status?: string; content: string }> }
	| { kind: "todo_read" };

export interface SummaryToolCall {
	toolCallId: string;
	tool: SummaryOperation;
}

export type SummaryContent = { type: "text"; text: string } | { type: "toolCall"; toolCall: SummaryToolCall };

export interface SummaryMessageEntry {
	role: "user" | "assistant" | "system";
	contents: SummaryContent[];
}

export interface OperationFrame {
	cwd: string;
	messages: SummaryMessageEntry[];
}

export function emptyFrame(cwd: string): OperationFrame {
	return { cwd, messages: [] };
}
