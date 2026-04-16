import type { ThinkingLevel } from "@daedalus-pi/agent-core";

export type SubagentSource = "bundled" | "user" | "project";
export type SubagentRunStatus = "running" | "completed" | "failed" | "aborted";

export interface SubagentDefinition {
	name: string;
	description: string;
	systemPrompt: string;
	source: SubagentSource;
	filePath?: string;
	tools?: string[];
	spawns?: string[] | "*";
	model?: string;
	thinkingLevel?: ThinkingLevel;
	outputSchema?: unknown;
	toolPolicy?: SubagentPolicy;
}

export interface SubagentPolicy {
	allowedTools: string[];
	writableGlobs: string[];
	readableGlobs?: string[];
	spawns: string[] | "*" | [];
	maxDepth?: number;
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
}

export interface SubagentRunResult {
	runId: string;
	agent: string;
	status: SubagentRunStatus;
	summary: string;
	childSessionFile: string;
	resultArtifactPath?: string;
	contextArtifactPath?: string;
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
	childSessionFile?: string;
}
