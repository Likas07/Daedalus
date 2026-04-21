import type { ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import type { ActiveSubagentRun, SubagentRunResult, SubagentRunStatus } from "../../../../core/subagents/index.js";
import { buildRunInspectorModel, type InspectorRunSource } from "./inspector.js";
import { formatAgentLabel } from "./task-progress-renderer.js";
import { showSubagentInspector } from "./viewer.js";

export interface InspectableSubagentRun extends InspectorRunSource {
	status: SubagentRunStatus;
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
		byRunId.set(run.runId, { ...run, parentSessionFile: undefined });
	}
	for (const run of active) {
		byRunId.set(run.runId, {
			...byRunId.get(run.runId),
			...run,
			parentSessionFile: run.parentSessionFile,
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
	return `${icon} ${formatAgentLabel({ name: run.agent, displayName: run.displayName })} · ${detail}`;
}

export async function openSubagentInspector(ctx: ExtensionCommandContext, run: InspectableSubagentRun): Promise<void> {
	await showSubagentInspector(
		ctx,
		buildRunInspectorModel({
			...run,
			parentSessionFile: run.parentSessionFile ?? ctx.sessionManager.getSessionFile(),
		}),
	);
}

export { buildRunInspectorModel };
