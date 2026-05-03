export type WorkspaceIsolationMode = "shared_cwd" | "dedicated_worktree" | "external_worktree" | "detached";

export type WorkspaceValidationStatus = "unknown" | "valid" | "missing" | "dirty" | "conflict" | "invalid";

export interface WorkspaceMergeBackMetadata {
	strategy?: "manual" | "merge" | "rebase" | "squash";
	baseBranch?: string;
	targetBranch?: string;
	baseCommit?: string;
	lastMergedCommit?: string;
	status?: "not_started" | "ready" | "merged" | "blocked" | "abandoned";
}

export interface WorkspaceAdoptionMetadata {
	adoptedFromSessionId?: string;
	adoptedFromPath?: string;
	adoptedAt?: string;
	reason?: string;
}

export interface WorkspaceTarget {
	/** Stable frontend/workspace identifier when one exists. */
	id?: string;
	/** Human-readable project/workspace label. */
	name?: string;
	/** Absolute working directory used by the agent. */
	cwd: string;
	/** Canonical project root when different from cwd. */
	projectRoot?: string;
	/** Isolation model for this workspace. */
	isolationMode: WorkspaceIsolationMode;
	/** Optional git metadata for later worktree hierarchy tasks. */
	repositoryRoot?: string;
	branch?: string;
	worktreePath?: string;
	baseBranch?: string;
	baseCommit?: string;
	validationStatus?: WorkspaceValidationStatus;
	validationMessage?: string;
	mergeBack?: WorkspaceMergeBackMetadata;
	adoption?: WorkspaceAdoptionMetadata;
}

export interface WorkspaceSessionLineage {
	parentSessionId?: string;
	parentSessionPath?: string;
	sourceSessionId?: string;
	sourceSessionPath?: string;
	forkedAt?: string;
}

export interface WorkspaceSessionIdentity {
	/** Schema marker for future migrations independent of session header version. */
	version: 1;
	sessionId?: string;
	workspace: WorkspaceTarget;
	lineage?: WorkspaceSessionLineage;
	createdAt?: string;
	updatedAt?: string;
}

export type WorkspaceResumeStatus = "resumable" | "needs_adoption" | "workspace_missing" | "cwd_mismatch" | "invalid";

export interface WorkspaceResumeDiagnostic {
	status: WorkspaceResumeStatus;
	message?: string;
	expectedCwd?: string;
	actualCwd?: string;
	workspace?: WorkspaceTarget;
}

export interface WorkspaceResumeDiagnostics {
	status: WorkspaceResumeStatus;
	diagnostics: WorkspaceResumeDiagnostic[];
}

export interface WorkspaceResumeValidation {
	status: WorkspaceResumeStatus;
	valid: boolean;
	message?: string;
	target: WorkspaceTarget;
	actualCwd?: string;
	actualBranch?: string;
}

export type WorkspaceCleanupRiskLevel = "none" | "safe" | "dirty" | "external" | "missing";

export interface WorkspaceCleanupRisk {
	safe: boolean;
	level: WorkspaceCleanupRiskLevel;
	reasons: string[];
	dirtyStatus?: string;
}
