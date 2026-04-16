import { describe, expect, it } from "vitest";
import { createTaskManager } from "../src/core/control-plane/task-manager.js";

describe("TaskManager", () => {
	it("creates queued tasks and transitions them through completion", () => {
		const manager = createTaskManager();
		const task = manager.createTask({
			parentSessionFile: "/tmp/parent.jsonl",
			parentAgent: "daedalus",
			agent: "explore",
			goal: "Map auth flow",
			executionMode: "background",
		});

		expect(task.status).toBe("queued");
		manager.transition(task.id, "reserved");
		manager.transition(task.id, "starting");
		manager.transition(task.id, "running");
		manager.complete(task.id, { summary: "Found 3 files" });

		expect(manager.getTask(task.id)?.status).toBe("completed");
		expect(manager.getTask(task.id)?.summary).toBe("Found 3 files");
	});
});
