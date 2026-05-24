export type SubagentExecutionModePreference = "foreground" | "background" | "either";
export type SubagentIsolationPreference = "shared-branch" | "child-branch" | "either";
export type SubagentDelegationAggressiveness = "conservative" | "balanced" | "aggressive";
export type SubagentBranchIsolationThreshold = "never" | "high-risk" | "always";
export type DelegationIsolationMode =
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
export type DelegationIsolationMergeMode = "patch" | "branch";

export interface SubagentRoleOverride {
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	executionModePreference?: SubagentExecutionModePreference;
	isolationPreference?: SubagentIsolationPreference;
}

export interface SubagentBranchIsolationSettings {
	enabled?: boolean;
	mutationThreshold?: SubagentBranchIsolationThreshold;
	namingTemplate?: string;
}

export interface DelegationIsolationSettings {
	mode?: DelegationIsolationMode;
	merge?: DelegationIsolationMergeMode;
}

export interface SubagentSettings {
	delegationAggressiveness?: SubagentDelegationAggressiveness;
	maxDepth?: number;
	maxConcurrency?: number;
	backgroundRoles?: string[];
	branchIsolation?: SubagentBranchIsolationSettings;
	agents?: Record<string, SubagentRoleOverride>;
}

export interface HostedImageGenerationSettings {
	outputFormat?: "png";
}

export interface ImageSettings {
	autoResize?: boolean;
	blockImages?: boolean;
	hostedGeneration?: boolean | HostedImageGenerationSettings;
}
