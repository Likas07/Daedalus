import type { SubagentRunStatus } from "../../../../core/subagents/index.js";
import type { SubagentNavigationModel } from "./navigation.js";
import { createSubagentSessionLink } from "./session-link.js";
import { formatAgentLabel } from "./task-progress-renderer.js";

export type InspectorActionKind =
	| "transcript"
	| "context"
	| "result"
	| "meta"
	| "open-child"
	| "back-to-parent"
	| "parent"
	| "previous"
	| "next";

export interface InspectorAction {
	label: string;
	kind: InspectorActionKind;
	path?: string;
}

export interface RunInspectorModel {
	runId: string;
	title: string;
	agentLabel: string;
	status: string;
	summary: string;
	goal?: string;
	activity?: string;
	recentActivity?: string[];
	startedAt?: number;
	updatedAt?: number;
	navigation?: SubagentNavigationModel;
	actions: InspectorAction[];
}

export type InspectorRunSource = {
	runId: string;
	agent: string;
	status: SubagentRunStatus;
	summary: string;
	displayName?: string;
	goal?: string;
	parentSessionFile?: string;
	startedAt?: number;
	updatedAt?: number;
	activity?: string;
	recentActivity?: string[];
	childSessionFile?: string;
	contextArtifactPath?: string;
	resultArtifactPath?: string;
};

export function buildRunInspectorModel(
	run: InspectorRunSource,
	navigation?: SubagentNavigationModel,
): RunInspectorModel {
	const link = createSubagentSessionLink({
		childSessionFile: run.childSessionFile,
		parentSessionFile: run.parentSessionFile,
	});
	const actions: InspectorAction[] = [];

	if (run.childSessionFile) actions.push({ label: "Transcript", kind: "transcript", path: run.childSessionFile });
	if (run.contextArtifactPath)
		actions.push({ label: "Context packet", kind: "context", path: run.contextArtifactPath });
	if (run.resultArtifactPath) actions.push({ label: "Result JSON", kind: "result", path: run.resultArtifactPath });
	if (link.metaArtifactPath) actions.push({ label: "Metadata", kind: "meta", path: link.metaArtifactPath });
	if (run.childSessionFile)
		actions.push({ label: "Open child session", kind: "open-child", path: run.childSessionFile });
	if (link.parentSessionFile)
		actions.push({ label: "Back to parent", kind: "back-to-parent", path: link.parentSessionFile });
	if (navigation?.parent) actions.push({ label: "Parent", kind: "parent", path: navigation.parent.sessionFile });
	if (navigation?.previous)
		actions.push({
			label: `Prev: ${navigation.previous.label}`,
			kind: "previous",
			path: navigation.previous.sessionFile,
		});
	if (navigation?.next)
		actions.push({ label: `Next: ${navigation.next.label}`, kind: "next", path: navigation.next.sessionFile });

	return {
		runId: run.runId,
		title: `${formatAgentLabel({ name: run.agent, displayName: run.displayName })} · ${run.status}`,
		agentLabel: formatAgentLabel({ name: run.agent, displayName: run.displayName }),
		status: run.status,
		summary: run.summary,
		goal: run.goal,
		activity: run.activity,
		recentActivity: run.recentActivity,
		startedAt: run.startedAt,
		updatedAt: run.updatedAt,
		navigation,
		actions,
	};
}
