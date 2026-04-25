import { describe, expect, test } from "bun:test";
import {
	changedFileCounts,
	createWorkflowState,
	riskyFiles,
	summarizeDiff,
	terminalElapsedLabel,
} from "./client/workflow-state";

describe("phase 2 workflow state", () => {
	test("summarizes git counts and risky files", () => {
		const state = createWorkflowState({
			git: {
				branch: "feature",
				upstream: "origin/feature",
				ahead: 1,
				behind: 2,
				stagedCount: 1,
				unstagedCount: 1,
				files: [
					{
						path: "src/app.ts",
						status: "modified",
						staged: true,
						insertions: 3,
						deletions: 1,
						riskGroup: "source",
					},
					{ path: ".env", status: "added", staged: false, insertions: 1, deletions: 0, riskGroup: "secrets" },
				],
			},
		});
		expect(summarizeDiff(state.git)).toBe("2 files · +4 -1");
		expect(riskyFiles(state.git.files).map((file) => file.path)).toEqual([".env"]);
		expect(changedFileCounts(state.git.files).modified).toBe(1);
	});

	test("formats terminal elapsed metadata", () => {
		expect(terminalElapsedLabel({ elapsedMs: 65_000 })).toBe("1m 5s");
	});
});
