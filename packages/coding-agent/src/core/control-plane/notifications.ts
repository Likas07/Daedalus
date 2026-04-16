import type { TaskRecord } from "./types.js";

export function buildCompletionNotification(task: TaskRecord): string {
	return [
		"<task_metadata>",
		`<task_id>${task.id}</task_id>`,
		`<agent>${task.agent}</agent>`,
		`<status>${task.status}</status>`,
		`<summary>${task.summary}</summary>`,
		"</task_metadata>",
	].join("\n");
}
