import type { SessionEntry } from "../session/session-manager";

export interface ExperimentAttribution {
	workerProfiles?: string[];
	overlapPolicy?: "scoped" | "unscoped";
	compactionRetainedState?: boolean;
	waveId?: string;
	waveGoal?: string;
}

function extractLatestTaskAttribution(entries: SessionEntry[]): ExperimentAttribution {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: string; toolName?: string; details?: unknown; isError?: boolean };
		if (message.role !== "toolResult" || message.toolName !== "task" || message.isError) continue;
		const details = message.details;
		if (!details || typeof details !== "object") return {};
		const record = details as Record<string, unknown>;
		const wave = record.wave as Record<string, unknown> | undefined;
		const results = Array.isArray(record.results) ? record.results : [];
		const workerProfiles = Array.from(
			new Set(
				results
					.filter((result): result is Record<string, unknown> => !!result && typeof result === "object")
					.map(result => result.agent)
					.filter((agent): agent is string => typeof agent === "string" && agent.length > 0),
			),
		);
		const scopedResults = results.filter(
			(result): result is Record<string, unknown> =>
				!!result &&
				typeof result === "object" &&
				Array.isArray((result as Record<string, unknown>).ownedPaths) &&
				((result as Record<string, unknown>).ownedPaths as unknown[]).length > 0,
		).length;
		return {
			workerProfiles: workerProfiles.length > 0 ? workerProfiles : undefined,
			overlapPolicy:
				results.length > 0 && scopedResults === results.length
					? "scoped"
					: results.length > 0
						? "unscoped"
						: undefined,
			waveId: typeof wave?.id === "string" ? wave.id : undefined,
			waveGoal: typeof wave?.goal === "string" ? wave.goal : undefined,
		};
	}
	return {};
}

function hasRetainedCompactionState(entries: SessionEntry[]): boolean {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "compaction") continue;
		return Boolean(entry.preserveData && typeof entry.preserveData.phase2RetainedState === "object");
	}
	return false;
}

export function buildExperimentAttribution(entries: SessionEntry[]): ExperimentAttribution | undefined {
	const taskAttribution = extractLatestTaskAttribution(entries);
	const attribution: ExperimentAttribution = {
		...taskAttribution,
		compactionRetainedState: hasRetainedCompactionState(entries) || undefined,
	};
	if (Object.values(attribution).every(value => value === undefined)) {
		return undefined;
	}
	return attribution;
}
