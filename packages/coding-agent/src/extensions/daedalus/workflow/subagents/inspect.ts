import type { ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import type { ActiveSubagentRun, SubagentRunResult, SubagentRunStatus } from "../../../../core/subagents/index.js";
import { showJsonArtifact, showTextArtifact } from "./viewer.js";

export interface InspectableSubagentRun {
	runId: string;
	agent: string;
	status: SubagentRunStatus;
	summary: string;
	startedAt?: number;
	updatedAt?: number;
	activity?: string;
	recentActivity?: string[];
	childSessionFile?: string;
	contextArtifactPath?: string;
	resultArtifactPath?: string;
}

function rankStatus(status: SubagentRunStatus): number {
	return status === "running" ? 0 : 1;
}

export function buildInspectorOptions(
	active: ActiveSubagentRun[],
	persisted: SubagentRunResult[],
): InspectableSubagentRun[] {
	const byRunId = new Map<string, InspectableSubagentRun>();

	for (const run of persisted) {
		byRunId.set(run.runId, run);
	}
	for (const run of active) {
		byRunId.set(run.runId, {
			...byRunId.get(run.runId),
			...run,
		});
	}

	return [...byRunId.values()].sort((a, b) => {
		const statusDiff = rankStatus(a.status) - rankStatus(b.status);
		if (statusDiff !== 0) return statusDiff;
		return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
	});
}

export function formatInspectorLabel(run: InspectableSubagentRun): string {
	const icon = run.status === "running" ? "⋯" : run.status === "completed" ? "✓" : "✗";
	const detail = run.status === "running" ? (run.activity ?? run.summary) : run.summary;
	return `${icon} ${run.agent} · ${detail}`;
}

export async function openSubagentArtifacts(ctx: ExtensionCommandContext, run: InspectableSubagentRun): Promise<void> {
	const actions = [
		run.childSessionFile
			? {
					label: "Transcript",
					open: () => showTextArtifact(ctx, `${run.agent} transcript`, run.childSessionFile!),
				}
			: undefined,
		run.contextArtifactPath
			? {
					label: "Context packet",
					open: () => showTextArtifact(ctx, `${run.agent} context`, run.contextArtifactPath!),
				}
			: undefined,
		run.resultArtifactPath
			? {
					label: "Result JSON",
					open: () => showJsonArtifact(ctx, `${run.agent} result`, run.resultArtifactPath!),
				}
			: undefined,
	].filter((action): action is { label: string; open: () => Promise<void> } => Boolean(action));

	if (actions.length === 0) {
		ctx.ui.notify("No artifacts are available for this subagent run.", "info");
		return;
	}

	if (actions.length === 1) {
		await actions[0]!.open();
		return;
	}

	const selectedLabel = await ctx.ui.select(
		"Open subagent artifact",
		actions.map((action) => action.label),
	);
	const selected = actions.find((action) => action.label === selectedLabel);
	if (selected) {
		await selected.open();
	}
}
