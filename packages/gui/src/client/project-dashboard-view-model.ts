import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
import type { RendererDiffSummary } from "./gui-state-types";
import type { GuiState, SessionSummary } from "./runtime";
import { activeSessions as selectActiveSessions } from "./view-model";

export interface ProjectDashboardViewModel {
	readonly projectPath?: string;
	readonly projectName: string;
	readonly activeWorktree?: WorkflowWorktreeMetadata;
	readonly branchLabel: string;
	readonly upstreamLabel: string;
	readonly git: ProjectDashboardGitSummary;
	readonly activeDiff?: RendererDiffSummary;
	readonly activeSessions: readonly SessionSummary[];
	readonly approvalCount: number;
	readonly terminalCount: number;
	readonly worktrees: readonly WorkflowWorktreeMetadata[];
	readonly cleanupRisks: readonly WorktreeCleanupRiskState[];
	readonly openInEditor: OpenInEditorState;
}

export interface ProjectDashboardGitSummary {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
	readonly stagedCount: number;
	readonly unstagedCount: number;
	readonly ahead: number;
	readonly behind: number;
}

export interface OpenInEditorState {
	readonly enabled: boolean;
	readonly path?: string;
	readonly reason?: string;
}

export interface WorktreeCleanupRiskState {
	readonly worktreeId: string;
	readonly risky: boolean;
	readonly confirmationRequired: boolean;
	readonly confirmationToken?: string;
	readonly reasonLabels: readonly string[];
}

function projectSessionTarget(session: SessionSummary): SessionSummary {
	if (!session.runsIn) return session;
	return {
		...session,
		projectId: session.runsIn.projectId,
		worktreeId: session.runsIn.worktreeId,
		branch: session.runsIn.branch,
		cwd: session.runsIn.path,
		isolationMode: session.runsIn.isolationMode,
		validationStatus: session.runsIn.validationStatus,
		needsAttentionReason: session.runsIn.reason ?? session.needsAttentionReason,
		bestNextAction:
			session.bestNextAction ??
			(session.runsIn.validationStatus === "valid"
				? { label: "Review diff" }
				: {
						label: "Resolve target",
						disabled: true,
						reason: session.runsIn.reason ?? "Build target needs attention.",
					}),
	};
}

export function createProjectDashboardViewModel(state: GuiState): ProjectDashboardViewModel {
	const projectPath = state.projectRoot ?? state.projects[0]?.path;
	const activeWorktree = selectActiveWorktree(state, projectPath);
	const activeDiff = state.activeDiff;
	const files = activeDiff?.files ?? [];
	const insertions = files.reduce((total, file) => total + file.insertions, 0);
	const deletions = files.reduce((total, file) => total + file.deletions, 0);
	const activeSessions = selectActiveSessions(state.sessions).map(projectSessionTarget);
	const editorPath = activeWorktree?.path ?? projectPath;
	return {
		projectPath,
		projectName:
			projectPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? state.projects[0]?.name ?? "Choose a workspace",
		activeWorktree,
		branchLabel: activeDiff?.branch ?? activeWorktree?.branch ?? "detached",
		upstreamLabel: activeDiff?.upstream ?? activeWorktree?.upstream ?? "no upstream",
		git: {
			files: files.length,
			insertions,
			deletions,
			stagedCount: activeDiff?.stagedCount ?? files.filter((file) => file.staged).length,
			unstagedCount: activeDiff?.unstagedCount ?? files.filter((file) => !file.staged).length,
			ahead: activeDiff?.ahead ?? 0,
			behind: activeDiff?.behind ?? 0,
		},
		activeDiff,
		activeSessions,
		approvalCount: state.approvalItems.length,
		terminalCount: state.terminals.filter(
			(terminal) => terminal.status === "running" || terminal.status === "starting",
		).length,
		worktrees: state.worktrees,
		cleanupRisks: state.worktrees.map((worktree) => ({
			worktreeId: String(worktree.id),
			risky: worktree.cleanupRisk?.risky ?? worktree.cleanupRequiresConfirmation,
			confirmationRequired: worktree.cleanupRequiresConfirmation,
			confirmationToken: worktree.cleanupRisk?.confirmationToken,
			reasonLabels:
				worktree.cleanupRisk?.reasons.map((reason) => reason.message) ??
				(worktree.cleanupRequiresConfirmation ? ["Cleanup requires confirmation."] : []),
		})),
		openInEditor: editorPath
			? {
					enabled: hasDesktopEditorBridge(),
					path: editorPath,
					reason: hasDesktopEditorBridge() ? undefined : "Open in editor is available only in the desktop app.",
				}
			: { enabled: false, reason: "Choose a project before opening an editor." },
	};
}

export function selectActiveWorktree(
	state: GuiState,
	projectPath = state.projectRoot,
): WorkflowWorktreeMetadata | undefined {
	if (state.activeDiff && projectPath) {
		const match = state.worktrees.find((worktree) => worktree.path === projectPath);
		if (match) return match;
	}
	return state.worktrees.find((worktree) => worktree.path === projectPath) ?? state.worktrees[0];
}

export function hasDesktopEditorBridge(
	win: Pick<Window, "desktopBridge" | "daedalusNative"> | undefined = typeof window === "undefined"
		? undefined
		: window,
): boolean {
	const bridge = win?.desktopBridge ?? win?.daedalusNative;
	return typeof bridge?.openInEditor === "function";
}
