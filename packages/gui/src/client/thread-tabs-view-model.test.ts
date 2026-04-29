import { describe, expect, test } from "bun:test";
import type { GuiState, SessionSummary } from "./runtime";
import { createThreadTabsViewModel } from "./view-model";

function session(overrides: Partial<SessionSummary>): SessionSummary {
	return { id: "s", title: "Thread", status: "running", ...overrides };
}

function state(overrides: Partial<GuiState> = {}): GuiState {
	return {
		connected: true,
		connectionStatus: "connected",
		reconnectAttempt: 0,
		projectRoot: "/repo/base",
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
		projects: [],
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

describe("createThreadTabsViewModel", () => {
	test("scopes thread tabs to the selected worktree target", () => {
		const model = createThreadTabsViewModel(
			state({
				selectedSessionId: "wt-a-1",
				sessions: [
					session({
						id: "wt-a-1",
						title: "A1",
						runsIn: {
							projectId: "project-1",
							worktreeId: "wt-a",
							path: "/repo/wt-a",
							canonicalPath: "/repo/wt-a",
							branch: "feat/a",
							isolationMode: "isolated-worktree",
							validationStatus: "valid",
						},
					}),
					session({ id: "wt-a-2", title: "A2", worktreeId: "wt-a", branch: "feat/a" }),
					session({ id: "wt-b-1", title: "B1", worktreeId: "wt-b", branch: "feat/b" }),
					session({ id: "base-1", title: "Base", projectId: "project-1" }),
				],
			}),
		);

		expect(model.modeLabel).toBe("worktree");
		expect(model.branchLabel).toBe("feat/a");
		expect(model.tabs.map((tab) => tab.session.id)).toEqual(["wt-a-1", "wt-a-2"]);
	});

	test("base checkout target excludes worktree threads and exposes attention badges", () => {
		const model = createThreadTabsViewModel(
			state({
				selectedSessionId: "base-1",
				approvalItems: [
					{ id: "approval-1", sessionId: "base-2", summary: "write file", risk: "medium", scope: "/repo" },
				],
				sessions: [
					session({ id: "base-1", title: "Base 1", projectId: "project-1", cwd: "/repo/base", status: "running" }),
					session({
						id: "base-2",
						title: "Base 2",
						projectId: "project-1",
						needsAttentionReason: "Choose a target",
					}),
					session({ id: "wt-a-1", title: "Worktree", worktreeId: "wt-a" }),
				],
			}),
		);

		expect(model.modeLabel).toBe("base checkout");
		expect(model.tabs.map((tab) => tab.session.id)).toEqual(["base-1", "base-2"]);
		expect(model.attentionCount).toBe(1);
		expect(model.tabs[1]?.attentionLabel).toBe("Choose a target");
		expect(model.tabs[1]?.pendingApprovalCount).toBe(1);
	});

	test("legacy worktree grouping remains scoped to the selected project", () => {
		const model = createThreadTabsViewModel(
			state({
				selectedSessionId: "selected",
				sessions: [
					session({ id: "selected", title: "Selected", projectId: "project-1", worktreeId: "wt-shared", branch: "feat/a" }),
					session({ id: "same-target", title: "Same target", projectId: "project-1", worktreeId: "wt-shared" }),
					session({ id: "other-project", title: "Other project", projectId: "project-2", worktreeId: "wt-shared" }),
				],
			}),
		);

		expect(model.modeLabel).toBe("worktree");
		expect(model.tabs.map((tab) => tab.session.id)).toEqual(["selected", "same-target"]);
	});

	test("missing selected thread falls back to the project target without stale selection", () => {
		const model = createThreadTabsViewModel(
			state({
				selectedSessionId: "missing-thread",
				sessions: [
					session({ id: "base-1", title: "Base", projectId: "project-1" }),
					session({ id: "wt-a", title: "Worktree", projectId: "project-1", worktreeId: "wt-a" }),
				],
			}),
		);

		expect(model.selectedThreadId).toBeUndefined();
		expect(model.tabs.map((tab) => tab.session.id)).toEqual(["base-1"]);
	});

	test("approval-only attention is counted and labelled per thread", () => {
		const model = createThreadTabsViewModel(
			state({
				selectedSessionId: "base-1",
				approvalItems: [
					{ id: "approval-1", sessionId: "base-1", summary: "edit", risk: "medium", scope: "/repo" },
					{ id: "approval-2", sessionId: "base-1", summary: "test", risk: "low", scope: "/repo" },
				],
				sessions: [session({ id: "base-1", title: "Base", projectId: "project-1", status: "active" })],
			}),
		);

		expect(model.attentionCount).toBe(1);
		expect(model.tabs[0]).toMatchObject({ needsAttention: true, attentionLabel: "2 approvals pending", pendingApprovalCount: 2 });
	});
});
