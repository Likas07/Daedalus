import { randomUUID } from "node:crypto";
import type { LaunchInput, TaskRecord, TaskState } from "./types.js";

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
	queued: ["reserved", "cancelled"],
	reserved: ["starting", "cancelled"],
	starting: ["running", "failed", "cancelled"],
	running: ["completing", "failed", "cancelled", "interrupted"],
	completing: ["completed", "failed"],
	completed: [],
	failed: [],
	cancelled: [],
	interrupted: [],
};

export function createTaskManager() {
	const tasks = new Map<string, TaskRecord>();

	return {
		createTask(input: LaunchInput): TaskRecord {
			const now = Date.now();
			const task: TaskRecord = {
				...input,
				id: randomUUID().slice(0, 8),
				status: "queued",
				createdAt: now,
				updatedAt: now,
				summary: input.goal,
			};
			tasks.set(task.id, task);
			return task;
		},

		transition(id: string, next: TaskState): void {
			const current = tasks.get(id);
			if (!current) {
				throw new Error(`Unknown task ${id}`);
			}
			if (!VALID_TRANSITIONS[current.status].includes(next)) {
				throw new Error(`Invalid task transition: ${current.status} -> ${next}`);
			}
			current.status = next;
			current.updatedAt = Date.now();
		},

		complete(id: string, update: { summary: string }): void {
			this.transition(id, "completing");
			const current = tasks.get(id);
			if (!current) {
				throw new Error(`Unknown task ${id}`);
			}
			current.summary = update.summary;
			this.transition(id, "completed");
		},

		getTask(id: string): TaskRecord | undefined {
			return tasks.get(id);
		},
	};
}
