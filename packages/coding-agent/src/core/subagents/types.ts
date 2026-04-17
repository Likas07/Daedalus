import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type {
	SubagentExecutionModePreference,
	SubagentIsolationPreference,
	SubagentRoleOverride,
} from "../settings-schema.js";
import type { BranchIsolationMetadata } from "./branch-isolation.js";

export type SubagentSource = "bundled" | "user" | "project";
export type SubagentRunStatus = "running" | "completed" | "failed" | "aborted";

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
}

export interface SubagentRunRequest {
	agent: SubagentDefinition;
	parentSessionFile: string;
	goal: string;
	assignment: string;
	context?: string;
	outputSchema?: unknown;
	policy?: Partial<SubagentPolicy>;
	taskLabel?: string;
	metadata?: SubagentRunMetadata;
	onProgress?: (progress: SubagentRunProgress) => void;
}

export interface SubagentRunResult {
	runId: string;
	agent: string;
	status: SubagentRunStatus;
	summary: string;
	deliverable?: unknown;
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
}
