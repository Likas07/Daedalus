import { describe, expect, it } from "bun:test";
import { SETTINGS_SCHEMA } from "../../src/config/settings-schema";
import { detectTaskOwnershipOverlaps, formatTaskOwnershipOverlapMessage } from "../../src/task/overlap-policy";

describe("task overlap policy", () => {
	it("detects overlapping owned path scopes", () => {
		expect(
			detectTaskOwnershipOverlaps([
				{ id: "TaskA", description: "A", assignment: "Do A", ownedPaths: ["src/task/**"] },
				{ id: "TaskB", description: "B", assignment: "Do B", ownedPaths: ["src/task/index.ts"] },
			]),
		).toEqual([
			{
				leftTaskId: "TaskA",
				rightTaskId: "TaskB",
				leftScope: "src/task/**",
				rightScope: "src/task/index.ts",
			},
		]);
	});

	it("ignores disjoint or unowned tasks", () => {
		expect(
			detectTaskOwnershipOverlaps([
				{ id: "TaskA", description: "A", assignment: "Do A", ownedPaths: ["src/task/**"] },
				{ id: "TaskB", description: "B", assignment: "Do B", ownedPaths: ["src/config/**"] },
				{ id: "TaskC", description: "C", assignment: "Do C" },
			]),
		).toEqual([]);
	});

	it("formats overlap messages for task execution errors", () => {
		const message = formatTaskOwnershipOverlapMessage([
			{ leftTaskId: "TaskA", rightTaskId: "TaskB", leftScope: "src/task/**", rightScope: "src/task/index.ts" },
		]);

		expect(message).toContain("Delegated task ownership overlaps detected");
		expect(message).toContain("TaskA (src/task/**) overlaps TaskB (src/task/index.ts)");
	});

	it("defaults delegated overlap policy to deny", () => {
		expect(SETTINGS_SCHEMA["task.overlapPolicy"]?.default).toBe("deny");
		expect(SETTINGS_SCHEMA["task.isolation.mode"]?.default).toBe("none");
	});
});
