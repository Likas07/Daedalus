import { describe, expect, it } from "bun:test";
import { buildExperimentAttribution } from "../src/autoresearch/attribution";
import { parseAgentFields } from "../src/discovery/agent-fields";
import { appendRetainedStateToSummary, buildCompactionRetainedState } from "../src/session/compaction/retained-state";
import type { SessionEntry } from "../src/session/session-manager";
import { renderTemplate } from "../src/task/template";
import type { TodoPhase } from "../src/tools/todo-write";

function createTaskToolResult(details: unknown): SessionEntry {
	return {
		type: "message",
		id: "task-result",
		parentId: null,
		timestamp: new Date().toISOString(),
		message: {
			role: "toolResult",
			toolName: "task",
			content: [{ type: "text", text: "ok" }],
			details,
			timestamp: Date.now(),
		},
	} as SessionEntry;
}

describe("phase 2 rollout gates", () => {
	it("keeps declarative agent profile metadata authoritative", () => {
		expect(
			parseAgentFields({
				name: "plan",
				description: "Architect",
				role: "plan",
				orchestrationRole: "orchestrator",
				readOnly: true,
				editScopes: ["src/task/**"],
			}),
		).toMatchObject({
			role: "plan",
			orchestrationRole: "orchestrator",
			readOnly: true,
			editScopes: ["src/task/**"],
		});
	});

	it("keeps wave and ownership context in delegated prompts", () => {
		const result = renderTemplate(
			"Background",
			{
				id: "WaveTask",
				description: "Scoped work",
				assignment: "Change only the owned files.",
				ownedPaths: ["src/task/**"],
			},
			{ id: "wave-4", goal: "Complete orchestrator follow-up." },
		);

		expect(result.task).toContain('<wave id="wave-4">');
		expect(result.task).toContain("Complete orchestrator follow-up.");
		expect(result.task).toContain("You own the following paths for this task:");
		expect(result.task).toContain("`src/task/**`");
	});

	it("keeps retained runtime state visible after compaction", () => {
		const phases: TodoPhase[] = [
			{
				id: "phase-1",
				name: "Verification",
				tasks: [{ id: "task-1", content: "Verify scoped workers", status: "in_progress", notes: "", details: "" }],
			},
		];
		const retained = buildCompactionRetainedState(
			[
				createTaskToolResult({
					wave: { id: "wave-4", goal: "Complete orchestrator follow-up.", totalTasks: 1, completedTasks: 0 },
					results: [{ id: "WaveTask", description: "Scoped work", exitCode: 0, ownedPaths: ["src/task/**"] }],
				}),
			],
			phases,
			{ enabled: true, planFilePath: "local://PLAN.md", workflow: "iterative" },
		);
		const summary = appendRetainedStateToSummary("Base summary", retained);

		expect(summary).toContain("## Active Runtime State");
		expect(summary).toContain("Plan mode: local://PLAN.md (iterative)");
		expect(summary).toContain("Wave wave-4: 0/1 completed — Complete orchestrator follow-up.");
	});

	it("keeps benchmark attribution tied to worker mix and overlap policy", () => {
		expect(
			buildExperimentAttribution([
				{
					type: "compaction",
					id: "compaction-1",
					parentId: null,
					timestamp: new Date().toISOString(),
					summary: "summary",
					firstKeptEntryId: "message-1",
					tokensBefore: 100,
					preserveData: { phase2RetainedState: { activeObjective: "Execution" } },
				} as SessionEntry,
				createTaskToolResult({
					wave: { id: "wave-9", goal: "Benchmark wave", totalTasks: 2, completedTasks: 2 },
					results: [
						{ agent: "plan", ownedPaths: ["src/task/**"] },
						{ agent: "reviewer", ownedPaths: ["src/config/**"] },
					],
				}),
			]),
		).toEqual({
			workerProfiles: ["plan", "reviewer"],
			overlapPolicy: "scoped",
			compactionRetainedState: true,
			waveId: "wave-9",
			waveGoal: "Benchmark wave",
		});
	});
});
