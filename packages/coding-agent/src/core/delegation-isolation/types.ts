export type DisplayedDelegationIsolationMode =
	| "none"
	| "auto"
	| "apfs"
	| "btrfs"
	| "zfs"
	| "reflink"
	| "overlayfs"
	| "projfs"
	| "block-clone"
	| "rcopy";

export type LegacyDelegationIsolationMode = "worktree" | "fuse-overlay" | "fuse-projfs";
export type DelegationIsolationModeInput = DisplayedDelegationIsolationMode | LegacyDelegationIsolationMode;
export type DelegationIsolationBackend = "none" | "rcopy";

export interface DelegationIsolationModeResolution {
	requestedMode: DelegationIsolationModeInput;
	displayedMode: DisplayedDelegationIsolationMode;
	backend: DelegationIsolationBackend;
	fallback?: {
		from: DisplayedDelegationIsolationMode;
		to: DelegationIsolationBackend;
		reason: string;
	};
}

export interface DelegationIsolationPaths {
	repoRoot: string;
	runId: string;
	encodedRepoRoot: string;
	baseDir: string;
	mergedDir: string;
}

export interface DelegationBaseline {
	repoRoot: string;
	head: string;
	stagedDiff: string;
	unstagedDiff: string;
	untrackedFiles: string[];
	untrackedPatch: string;
}

export interface DelegationIsolationHandle {
	repoRoot: string;
	runId: string;
	mergedDir: string;
	baseDir: string;
	backend: DelegationIsolationBackend;
	requestedMode: DelegationIsolationModeInput;
	displayedMode: DisplayedDelegationIsolationMode;
	fallback?: DelegationIsolationModeResolution["fallback"];
	baseline: DelegationBaseline;
	cleanup: () => Promise<void>;
}

export interface CreateDelegationIsolationOptions {
	repoRoot: string;
	runId: string;
	mode?: DelegationIsolationModeInput;
}

export interface DelegationDeltaPatch {
	content: string;
	files: string[];
}

export type DelegationMergeMode = "patch" | "branch";
export type DelegationMergeStatus = "merged" | "empty" | "blocked";

export interface MergeDelegationIsolationOptions {
	handle: DelegationIsolationHandle;
	mode: DelegationMergeMode;
}

export interface DelegationMergeResult {
	status: DelegationMergeStatus;
	mode: DelegationMergeMode;
	runId: string;
	patchPath?: string;
	branchName?: string;
	commit?: string;
	files: string[];
	message?: string;
}
