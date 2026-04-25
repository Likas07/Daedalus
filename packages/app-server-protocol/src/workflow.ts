import type { ProjectId, SessionId, TerminalId, WorktreeId } from "./ids";

export type WorkflowFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted";
export type WorkflowRiskGroup =
	| "source"
	| "tests"
	| "config"
	| "secrets"
	| "lockfiles"
	| "generated"
	| "docs"
	| "other";
export type WorkflowTerminalStatus = "running" | "exited" | "killed";

export interface WorkflowWorktreeMetadata {
	readonly id: WorktreeId | string;
	readonly projectId: ProjectId | string;
	readonly branch: string | null;
	readonly path: string;
	readonly upstream?: string | null;
	readonly dirty: boolean;
	readonly dirtyCount: number;
	readonly activeSessionCount: number;
	readonly cleanupRequiresConfirmation: boolean;
}

export interface WorkflowTerminalMetadata {
	readonly id: TerminalId | string;
	readonly projectId?: ProjectId;
	readonly worktreeId?: WorktreeId;
	readonly sessionId?: SessionId;
	readonly cwd: string;
	readonly shell: string;
	readonly status: WorkflowTerminalStatus;
	readonly attached: boolean;
	readonly owner?: string;
	readonly replayCursor: number;
	readonly elapsedMs: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkflowChangedFile {
	readonly path: string;
	readonly previousPath?: string;
	readonly status: WorkflowFileStatus;
	readonly staged: boolean;
	readonly insertions: number;
	readonly deletions: number;
	readonly riskGroup: WorkflowRiskGroup;
}

export interface WorkflowGitStatus {
	readonly branch: string | null;
	readonly upstream: string | null;
	readonly ahead: number;
	readonly behind: number;
	readonly stagedCount: number;
	readonly unstagedCount: number;
	readonly files: readonly WorkflowChangedFile[];
}

export interface WorkflowDiffSummary extends WorkflowGitStatus {
	readonly patch?: string;
	readonly riskyGroups: readonly WorkflowRiskGroup[];
}

export interface SafeCommitInput {
	readonly cwd: string;
	readonly message: string;
	readonly allowWithActiveSessions?: boolean;
	readonly activeSessionCount?: number;
}

export interface SafeCommitResult {
	readonly committed: boolean;
	readonly commit?: string;
	readonly warnings: readonly string[];
}

export interface StageFilesInput {
	readonly cwd: string;
	readonly paths: readonly string[];
}

export interface UnstageFilesInput extends StageFilesInput {}
