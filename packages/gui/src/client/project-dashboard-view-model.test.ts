import { describe, expect, test } from "bun:test";
import { createProjectDashboardViewModel } from "./project-dashboard-view-model";
import type { GuiState } from "./runtime";

function state(overrides: Partial<GuiState> = {}): GuiState {
	return {
		connected: true,
		connectionStatus: "connected",
		reconnectAttempt: 0,
		projectRoot: "/repo/feature-tree",
		displayDensity: "comfortable",
		providerStatuses: [],
		approvalItems: [],
		lastProjectId: "project-1",
		worktrees: [],
		sessions: [],
		events: [],
		extensionRequests: [],
		notifications: [],
		diagnostics: [],
		integrations: [],
		terminalOutput: "",
		terminalCursor: 0,
		projects: [{ id: "project-1", path: "/repo/feature-tree", name: "feature-tree" }],
		terminals: [],
		models: [],
		mode: "daedalus",
		fastMode: false,
		accessMode: "supervised",
		authStatuses: [],
		composerAttachments: [],
		composerFileMentions: [],
		composerSlashCommands: [],
		sessionTokensUsed: 0,
		...overrides,
	};
}

describe("createProjectDashboardViewModel", () => {
	test("derives branch and diff counts from active diff, not hardcoded placeholders", () => {
		const model = createProjectDashboardViewModel(
			state({
				activeDiff: {
					branch: "task-21",
					upstream: "origin/task-21",
					ahead: 2,
					behind: 1,
					stagedCount: 1,
					unstagedCount: 1,
					files: [
						{
							path: "src/a.ts",
							status: "modified",
							staged: true,
							insertions: 7,
							deletions: 3,
							riskGroup: "source",
						},
						{
							path: "test/a.test.ts",
							status: "added",
							staged: false,
							insertions: 11,
							deletions: 0,
							riskGroup: "tests",
						},
					],
					riskyGroups: ["source", "tests"],
				},
			}),
		);

		expect(model.branchLabel).toBe("task-21");
		expect(model.git.insertions).toBe(18);
		expect(model.git.deletions).toBe(3);
		expect(model.git.files).toBe(2);
		expect(model.git.stagedCount).toBe(1);
		expect(model.git.unstagedCount).toBe(1);
		expect(model.branchLabel).not.toBe("main");
	});

	test("renders worktree rows from backend ids and paths", () => {
		const model = createProjectDashboardViewModel(
			state({
				worktrees: [
					{
						id: "wt-backend",
						projectId: "project-1",
						branch: "real-branch",
						path: "/repo/wt",
						upstream: null,
						dirty: true,
						dirtyCount: 4,
						activeSessionCount: 2,
						cleanupRequiresConfirmation: true,
					},
				],
				projectRoot: "/repo/wt",
			}),
		);

		expect(model.activeWorktree?.id).toBe("wt-backend");
		expect(model.activeWorktree?.path).toBe("/repo/wt");
		expect(model.branchLabel).toBe("real-branch");
		expect(model.worktrees).toHaveLength(1);
	});

	test("derives sessions, approvals, terminals, and web editor disabled reason", () => {
		const model = createProjectDashboardViewModel(
			state({
				sessions: [
					{ id: "s1", title: "active", status: "running" },
					{ id: "s2", title: "done", status: "completed" },
				],
				approvalItems: [{ id: "a1", summary: "write", risk: "medium", scope: "repo" }],
				terminals: [{ terminalId: "t1", cwd: "/repo", cols: 80, rows: 24, status: "running", history: "" }],
			}),
		);

		expect(model.activeSessions.map((session) => session.id)).toEqual(["s1"]);
		expect(model.approvalCount).toBe(1);
		expect(model.terminalCount).toBe(1);
		expect(model.openInEditor.enabled).toBe(false);
		expect(model.openInEditor.reason).toContain("desktop");
	});
});
