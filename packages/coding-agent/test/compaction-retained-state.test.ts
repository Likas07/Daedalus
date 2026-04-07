import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import {
	appendRetainedStateToSummary,
	buildCompactionRetainedState,
	extractLatestTaskWaveState,
} from "../src/session/compaction/retained-state";
import type { SessionEntry } from "../src/session/session-manager";
import type { TodoPhase } from "../src/tools/todo-write";

function createToolResultEntry(toolName: string, details: unknown): SessionEntry {
	return {
		type: "message",
		id: `${toolName}-entry`,
		parentId: null,
		timestamp: new Date().toISOString(),
		message: {
			role: "toolResult",
			toolName,
			content: [{ type: "text", text: "ok" }],
			details,
			timestamp: Date.now(),
		} as AgentMessage,
	};
}

describe("compaction retained state", () => {
	it("extracts the latest task wave from session entries", () => {
		const wave = extractLatestTaskWaveState([
			createToolResultEntry("task", {
				wave: { id: "wave-7", goal: "Verify scoped workers", totalTasks: 3, completedTasks: 2 },
				results: [
					{ id: "TaskA", description: "Planner", exitCode: 0, ownedPaths: ["src/task/**"] },
					{ id: "TaskB", description: "Verifier", exitCode: 1, ownedPaths: ["src/config/**"] },
				],
			}),
		]);

		expect(wave).toEqual({
			id: "wave-7",
			goal: "Verify scoped workers",
			totalTasks: 3,
			completedTasks: 2,
			failedTasks: ["Verifier"],
			ownership: [
				{ taskId: "TaskA", paths: ["src/task/**"] },
				{ taskId: "TaskB", paths: ["src/config/**"] },
			],
		});
	});

	it("builds retained state from todos, plan mode, and wave data", () => {
		const todoPhases: TodoPhase[] = [
			{
				id: "phase-1",
				name: "Execution",
				tasks: [
					{ id: "task-1", content: "Implement scoped edits", status: "in_progress", notes: "", details: "" },
					{ id: "task-2", content: "Verify wave output", status: "pending", notes: "", details: "" },
				],
			},
		];
		const state = buildCompactionRetainedState(
			[
				createToolResultEntry("task", {
					wave: { id: "wave-2", goal: "Finish execution", totalTasks: 2, completedTasks: 1 },
					results: [
						{ id: "task-verify", description: "Verification", error: "boom", ownedPaths: ["src/task/**"] },
					],
				}),
			],
			todoPhases,
			{ enabled: true, planFilePath: "local://PLAN.md", workflow: "iterative" },
		);

		expect(state).toMatchObject({
			activeObjective: "Execution: Implement scoped edits",
			pendingVerification: ["Execution: Verify wave output"],
			blockers: ["Verification"],
			planMode: { planFilePath: "local://PLAN.md", workflow: "iterative" },
		});
		expect(state?.wave?.id).toBe("wave-2");
		expect(state?.activeTodos).toHaveLength(2);
	});

	it("appends retained state summary block", () => {
		const summary = appendRetainedStateToSummary("History summary", {
			activeObjective: "Execution: Implement scoped edits",
			planMode: { planFilePath: "local://PLAN.md", workflow: "iterative" },
			pendingVerification: ["Execution: Verify wave output"],
			blockers: ["Verifier"],
			activeTodos: [{ phase: "Execution", content: "Implement scoped edits", status: "in_progress" }],
			wave: {
				id: "wave-2",
				goal: "Finish execution",
				totalTasks: 2,
				completedTasks: 1,
				failedTasks: ["Verifier"],
				ownership: [{ taskId: "TaskA", paths: ["src/task/**"] }],
			},
		});

		expect(summary).toContain("## Active Runtime State");
		expect(summary).toContain("Wave wave-2: 1/2 completed — Finish execution");
		expect(summary).toContain("Pending verification: Execution: Verify wave output");
		expect(summary).toContain("Ownership: TaskA -> src/task/**");
	});
});
