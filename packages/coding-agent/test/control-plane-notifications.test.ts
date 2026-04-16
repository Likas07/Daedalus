import { describe, expect, it } from "vitest";
import { buildCompletionNotification } from "../src/core/control-plane/notifications.js";

describe("control-plane notifications", () => {
	it("formats task completion as structured metadata", () => {
		const text = buildCompletionNotification({
			id: "task-1",
			agent: "reviewer",
			goal: "Review auth flow",
			parentSessionFile: "/tmp/parent.jsonl",
			parentAgent: "daedalus",
			executionMode: "background",
			status: "completed",
			createdAt: 1,
			updatedAt: 2,
			summary: "No critical issues",
		});

		expect(text).toContain("<task_metadata>");
		expect(text).toContain("<agent>reviewer</agent>");
		expect(text).toContain("<status>completed</status>");
	});
});
