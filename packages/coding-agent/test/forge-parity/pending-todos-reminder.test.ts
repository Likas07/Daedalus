import { describe, expect, it } from "vitest";
import { decidePendingTodosReminder } from "../../src/extensions/daedalus/workflow/pending-todos-hook.js";

describe("pending todos reminder", () => {
	it("injects once per pending set and refreshes when the set changes", () => {
		const first = decidePendingTodosReminder([{ id: "task-1", content: "write failing test", status: "pending" }]);
		expect(first.shouldInject).toBe(true);
		expect(first.reminder).toBe(
			"You have pending todo items that must be completed before finishing the task:\n\n- [PENDING] write failing test\n\nComplete these before yielding.",
		);

		const duplicate = decidePendingTodosReminder(
			[{ id: "task-1", content: "write failing test", status: "pending" }],
			first.signature,
		);
		expect(duplicate.shouldInject).toBe(false);

		const refreshed = decidePendingTodosReminder(
			[{ id: "task-2", content: "implement feature", status: "in_progress" }],
			first.signature,
		);
		expect(refreshed.shouldInject).toBe(true);
		expect(refreshed.reminder).toBe(
			"You have pending todo items that must be completed before finishing the task:\n\n- [IN_PROGRESS] implement feature\n\nComplete these before yielding.",
		);
	});
});
