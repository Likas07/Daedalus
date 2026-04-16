import type { TaskRecord } from "./types.js";

export class TaskHistory {
	private readonly byParent = new Map<string, TaskRecord[]>();

	record(parentSessionFile: string, task: TaskRecord): void {
		const current = this.byParent.get(parentSessionFile) ?? [];
		this.byParent.set(parentSessionFile, [...current, task]);
	}

	list(parentSessionFile: string | undefined): TaskRecord[] {
		if (!parentSessionFile) return [];
		return [...(this.byParent.get(parentSessionFile) ?? [])];
	}
}
