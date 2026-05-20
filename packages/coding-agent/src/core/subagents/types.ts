import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type {
	SubagentExecutionModePreference,
	SubagentIsolationPreference,
	SubagentRoleOverride,
} from "../settings-schema.js";
import type { WorkspaceTarget } from "../workspaces/types.js";
import type { BranchIsolationMetadata } from "./branch-isolation.js";

export type SubagentSource = "bundled" | "user" | "project";
export type SubagentRunStatus = "running" | "completed" | "partial" | "blocked" | "failed" | "aborted";

export type SubagentEnvelopeStatus = "completed" | "partial" | "blocked";
export type SubagentWorkspaceIsolation = "inherit" | "shared" | "worktree";
export type SubagentMergeBackPolicy = "patch" | "branch";

export interface SubagentTaskBinding {
	type: "plan-task";
	planPath: string;
	taskId: string;
	taskTitle?: string;
	files?: string[];
}

export interface SubagentMergeBackResultDetails {
	policy: SubagentMergeBackPolicy;
	status: "not_started" | "skipped" | "clean" | "applied" | "blocked" | "failed";
	message: string;
	artifactPath?: string;
	branchName?: string;
	files?: string[];
	conflicts?: string[];
	stdout?: string;
	stderr?: string;
}

export interface SubagentWorkspaceMetadata {
	/** Effective internal workspace behavior. */
	isolation: SubagentWorkspaceIsolation;
	/** Public artifact-first isolation request/effect metadata. */
	requestedIsolated?: boolean;
	effectiveIsolated?: boolean;
	workspaceTarget?: WorkspaceTarget;
	baseBranch?: string;
	baseCommit?: string;
	mergeBack?: SubagentMergeBackPolicy;
	mergeBackArtifactPath?: string;
	mergeBackBranch?: string;
	mergeBackTarget?: WorkspaceTarget;
	mergeBackResult?: SubagentMergeBackResultDetails;
}

export interface SubagentResultEnvelope {
	task: string;
	status: SubagentEnvelopeStatus;
	summary: string;
	output: string;
}

export interface SubagentRejectedSubmitAttempt {
	rawParams: unknown;
	error: string;
	repairs: string[];
	attempt: number;
	maxAttempts: number;
}

export interface SubagentDegradedResultMetadata {
	reason: "no-valid-submit-result";
	validationErrors: string[];
	invalidSubmitAttempts: number;
	lastRejectedSubmit?: SubagentRejectedSubmitAttempt;
	childSessionFile: string;
}

export interface SubagentResultSidecarRecord extends SubagentResultEnvelope {
	resultId: string;
	agentId: string;
	conversationId: string;
	degraded?: SubagentDegradedResultMetadata;
}

export interface SubagentResultReference {
	resultId: string;
	agentId: string;
	conversationId: string;
	task: string;
	status: SubagentEnvelopeStatus;
	summary: string;
	note: string;
}

export interface SubagentDefinition {
	name: string;
	displayName?: string;
	description: string;
	systemPrompt: string;
	source: SubagentSource;
	filePath?: string;
	tools?: readonly string[];
	spawns?: readonly string[] | "*";
	model?: string;
	thinkingLevel?: ThinkingLevel;
	outputSchema?: unknown;
	toolPolicy?: SubagentPolicy;
	modelOverrides?: {
		gpt?: string;
		claude?: string;
	};
	purpose?: "exploration" | "planning" | "implementation" | "review" | string;
	executionModePreference?: SubagentExecutionModePreference;
	isolationPreference?: SubagentIsolationPreference;
	costClass?: "free" | "cheap" | "expensive" | string;
	useWhen?: readonly string[];
	avoidWhen?: readonly string[];
	observabilityTags?: readonly string[];
}

export interface SubagentPolicy {
	allowedTools: readonly string[];
	writableGlobs: readonly string[];
	readableGlobs?: readonly string[];
	spawns: readonly string[] | "*";
	maxDepth?: number;
}

export interface SubagentRunMetadata {
	parentRunId?: string;
	parentAgent?: string;
	depth?: number;
	effectiveRoleOverride?: SubagentRoleOverride;
}

export interface SubagentSessionContext {
	runId: string;
	agentName: string;
	depth: number;
	spawns: readonly string[] | "*";
	maxDepth?: number;
	workspaceTarget?: WorkspaceTarget;
	taskBinding?: SubagentTaskBinding;
}

export interface SubagentRunProgress {
	runId: string;
	agent: string;
	status: "running";
	summary: string;
	childSessionFile: string;
	contextArtifactPath?: string;
	activity?: string;
	recentActivity?: string[];
	workspaceTarget?: WorkspaceTarget;
	taskBinding?: SubagentTaskBinding;
}

export interface SubagentRunRequest {
	agent: SubagentDefinition;
	parentSessionFile: string;
	goal: string;
	assignment: string;
	context?: string;
	conversationId?: string;
	outputSchema?: unknown;
	policy?: Partial<SubagentPolicy>;
	taskLabel?: string;
	metadata?: SubagentRunMetadata;
	onProgress?: (progress: SubagentRunProgress) => void;
	/** Public model-facing isolation flag. true requests artifact-first isolated delegation. */
	isolated?: boolean;
	/** Internal workspace target policy. Defaults to inherit; legacy child-branch maps to worktree. */
	isolation?: SubagentWorkspaceIsolation;
	mergeBack?: SubagentMergeBackPolicy;
	baseBranch?: string;
	workspaceTarget?: WorkspaceTarget;
	taskBinding?: SubagentTaskBinding;
	/** Worktree setup defaults to true for worktree isolation; false skips bootstrap. */
	setupWorktree?: boolean;
	/** Include ignored files during worktree setup; defaults to true for worktree isolation. */
	includeIgnored?: boolean;
	/** Legacy branch isolation inputs retained for compatibility. */
	isolationMode?: "shared-branch" | "child-branch";
	branchTemplate?: string;
}

export interface SubagentRunResult {
	runId: string;
	resultId?: string;
	agent: string;
	parentSessionFile?: string;
	status: SubagentRunStatus;
	summary: string;
	task?: string;
	conversationId?: string;
	output?: string;
	reference?: SubagentResultReference;
	deliverable?: unknown;
	degraded?: SubagentDegradedResultMetadata;
	goal?: string;
	startedAt?: number;
	updatedAt?: number;
	activity?: string;
	recentActivity?: string[];
	childSessionFile: string;
	resultArtifactPath?: string;
	contextArtifactPath?: string;
	isolationMode?: "shared-branch" | "child-branch";
	branchMetadata?: BranchIsolationMetadata;
	isolation?: SubagentWorkspaceIsolation;
	workspaceTarget?: WorkspaceTarget;
	workspaceMetadata?: SubagentWorkspaceMetadata;
	isolated?: boolean;
	baseBranch?: string;
	mergeBack?: SubagentMergeBackPolicy;
	mergeBackResult?: SubagentMergeBackResultDetails;
	taskBinding?: SubagentTaskBinding;
	data?: unknown;
	error?: string;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: number;
	};
}

export interface ActiveSubagentRun {
	runId: string;
	agent: string;
	parentSessionFile: string;
	status: SubagentRunStatus;
	summary: string;
	startedAt: number;
	updatedAt: number;
	activity?: string;
	recentActivity?: string[];
	childSessionFile?: string;
	contextArtifactPath?: string;
	isolationMode?: "shared-branch" | "child-branch";
	branchMetadata?: BranchIsolationMetadata;
	isolation?: SubagentWorkspaceIsolation;
	workspaceTarget?: WorkspaceTarget;
	workspaceMetadata?: SubagentWorkspaceMetadata;
	isolated?: boolean;
	mergeBackResult?: SubagentMergeBackResultDetails;
	taskBinding?: SubagentTaskBinding;
}
