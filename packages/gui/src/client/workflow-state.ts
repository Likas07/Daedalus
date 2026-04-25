import type {
	WorkflowChangedFile,
	WorkflowDiffSummary,
	WorkflowGitStatus,
	WorkflowTerminalMetadata,
	WorkflowWorktreeMetadata,
} from "@daedalus-pi/app-server-protocol";

export interface WorkflowState {
	readonly worktrees: readonly WorkflowWorktreeMetadata[];
	readonly terminals: readonly WorkflowTerminalMetadata[];
	readonly git: WorkflowGitStatus;
	readonly selectedWorktreeId?: string;
	readonly selectedTerminalId?: string;
	readonly diffPatch?: string;
}

export const emptyGitStatus: WorkflowGitStatus = {
	branch: null,
	upstream: null,
	ahead: 0,
	behind: 0,
	stagedCount: 0,
	unstagedCount: 0,
	files: [],
};

export function createWorkflowState(input: Partial<WorkflowState> = {}): WorkflowState {
	return { worktrees: [], terminals: [], git: emptyGitStatus, ...input };
}

export function changedFileCounts(
	files: readonly WorkflowChangedFile[],
): Record<WorkflowChangedFile["status"], number> {
	const counts: Record<WorkflowChangedFile["status"], number> = {
		added: 0,
		modified: 0,
		deleted: 0,
		renamed: 0,
		copied: 0,
		untracked: 0,
		conflicted: 0,
	};
	for (const file of files) counts[file.status] += 1;
	return counts;
}

export function riskyFiles(files: readonly WorkflowChangedFile[]): readonly WorkflowChangedFile[] {
	return files.filter(
		(file) => file.riskGroup === "secrets" || file.riskGroup === "config" || file.riskGroup === "lockfiles",
	);
}

export function summarizeDiff(diff: WorkflowDiffSummary | WorkflowGitStatus): string {
	const total = diff.files.length;
	const insertions = diff.files.reduce((sum, file) => sum + file.insertions, 0);
	const deletions = diff.files.reduce((sum, file) => sum + file.deletions, 0);
	return `${total} file${total === 1 ? "" : "s"} · +${insertions} -${deletions}`;
}

export function terminalElapsedLabel(terminal: Pick<WorkflowTerminalMetadata, "elapsedMs">): string {
	const seconds = Math.max(0, Math.floor(terminal.elapsedMs / 1000));
	const minutes = Math.floor(seconds / 60);
	return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
