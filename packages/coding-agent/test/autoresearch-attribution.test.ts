import { describe, expect, it } from "bun:test";
import { buildExperimentAttribution } from "../src/autoresearch/attribution";
import type { SessionEntry } from "../src/session/session-manager";

function createEntries(): SessionEntry[] {
	return [
		{
			type: "compaction",
			id: "compaction-1",
			parentId: null,
			timestamp: new Date().toISOString(),
			summary: "summary",
			firstKeptEntryId: "message-1",
			tokensBefore: 100,
			preserveData: { phase2RetainedState: { activeObjective: "Execution" } },
		},
		{
			type: "message",
			id: "task-result-1",
			parentId: "compaction-1",
			timestamp: new Date().toISOString(),
			message: {
				role: "toolResult",
				toolName: "task",
				content: [{ type: "text", text: "ok" }],
				details: {
					wave: { id: "wave-1", goal: "Evaluate workers", totalTasks: 2, completedTasks: 2 },
					results: [
						{ agent: "plan", ownedPaths: ["src/task/**"] },
						{ agent: "reviewer", ownedPaths: ["src/config/**"] },
					],
				},
				timestamp: Date.now(),
			},
		} as SessionEntry,
	];
}

describe("autoresearch attribution", () => {
	it("derives attribution from task and compaction history", () => {
		expect(buildExperimentAttribution(createEntries())).toEqual({
			workerProfiles: ["plan", "reviewer"],
			overlapPolicy: "scoped",
			compactionRetainedState: true,
			waveId: "wave-1",
			waveGoal: "Evaluate workers",
		});
	});
});
