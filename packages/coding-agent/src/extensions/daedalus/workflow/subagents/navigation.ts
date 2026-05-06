import type { SessionEntry } from "../../../../core/session-manager.js";
import type { InspectableSubagentRun } from "./inspect.js";

export interface SubagentNavigationTarget {
	label: string;
	sessionFile: string;
	runId?: string;
	status?: string;
	activity?: string;
}

export interface SubagentNavigationModel {
	current?: SubagentNavigationTarget;
	parent?: SubagentNavigationTarget;
	previous?: SubagentNavigationTarget;
	next?: SubagentNavigationTarget;
	siblings: SubagentNavigationTarget[];
	statusText: string;
}

export interface BuildSubagentNavigationOptions {
	runs: InspectableSubagentRun[];
	currentSessionFile?: string;
	currentEntries?: SessionEntry[];
	parentSessionFile?: string;
}

function rankStatus(status?: string): number {
	return status === "running" ? 0 : 1;
}

function cleanLabel(run: InspectableSubagentRun): string {
	const goal = run.goal ? ` · ${run.goal}` : "";
	return `${run.agent}${goal}`;
}

function fromRun(run: InspectableSubagentRun): SubagentNavigationTarget | undefined {
	if (!run.childSessionFile) return undefined;
	return {
		label: cleanLabel(run),
		sessionFile: run.childSessionFile,
		runId: run.runId,
		status: run.status,
		activity: run.activity,
	};
}

export function resolveSubagentParentFromEntries(entries: SessionEntry[] | undefined): string | undefined {
	for (let index = (entries?.length ?? 0) - 1; index >= 0; index--) {
		const entry = entries?.[index];
		if (entry?.type !== "custom" || entry.customType !== "subagent-run") continue;
		const data = entry.data as { parentSessionFile?: string } | undefined;
		if (data?.parentSessionFile) return data.parentSessionFile;
	}
	return undefined;
}

export function buildSubagentNavigationModel(options: BuildSubagentNavigationOptions): SubagentNavigationModel {
	const parentSessionFile = options.parentSessionFile ?? resolveSubagentParentFromEntries(options.currentEntries);
	const siblings = options.runs
		.filter((run) => !parentSessionFile || run.parentSessionFile === parentSessionFile)
		.sort((a, b) => {
			const status = rankStatus(a.status) - rankStatus(b.status);
			if (status !== 0) return status;
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		})
		.map(fromRun)
		.filter((target): target is SubagentNavigationTarget => Boolean(target));
	const currentIndex = siblings.findIndex((target) => target.sessionFile === options.currentSessionFile);
	const current = currentIndex >= 0 ? siblings[currentIndex] : undefined;
	const running = siblings.filter((target) => target.status === "running").length;
	return {
		current,
		parent: parentSessionFile ? { label: "Parent", sessionFile: parentSessionFile } : undefined,
		previous: currentIndex > 0 ? siblings[currentIndex - 1] : undefined,
		next: currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : undefined,
		siblings,
		statusText: `${siblings.length} sibling${siblings.length === 1 ? "" : "s"}${running ? ` · ${running} running` : ""}`,
	};
}

export function formatSubagentNavigationStatus(model: SubagentNavigationModel): string {
	const parts = [model.statusText];
	if (model.previous) parts.push("prev");
	if (model.next) parts.push("next");
	if (model.parent) parts.push("parent");
	return parts.join(" · ");
}
