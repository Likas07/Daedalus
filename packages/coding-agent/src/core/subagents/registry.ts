import type { ActiveSubagentRun, SubagentRunStatus } from "./types.js";

export class SubagentRegistry {
	#runs = new Map<string, ActiveSubagentRun>();
	#orderedIds: string[] = [];

	start(input: Omit<ActiveSubagentRun, "status" | "startedAt" | "updatedAt"> & { startedAt?: number }): void {
		const startedAt = input.startedAt ?? Date.now();
		const run: ActiveSubagentRun = {
			...input,
			status: "running",
			startedAt,
			updatedAt: startedAt,
		};
		this.#runs.set(run.runId, run);
		this.#orderedIds.push(run.runId);
	}

	update(
		runId: string,
		update: Pick<
			ActiveSubagentRun,
			"summary" | "activity" | "recentActivity" | "childSessionFile" | "contextArtifactPath"
		>,
	): void {
		const current = this.#runs.get(runId);
		if (!current) return;
		this.#runs.set(runId, {
			...current,
			...update,
			updatedAt: Date.now(),
		});
	}

	finish(runId: string, update: { status: Exclude<SubagentRunStatus, "running">; summary: string }): void {
		const current = this.#runs.get(runId);
		if (!current) return;
		this.#runs.set(runId, {
			...current,
			status: update.status,
			summary: update.summary,
			updatedAt: Date.now(),
		});
	}

	getRun(runId: string): ActiveSubagentRun | undefined {
		return this.#runs.get(runId);
	}

	getActiveRuns(): ActiveSubagentRun[] {
		return this.#orderedIds
			.map((runId) => this.#runs.get(runId))
			.filter((run): run is ActiveSubagentRun => !!run && run.status === "running");
	}

	getAllRuns(): ActiveSubagentRun[] {
		return this.#orderedIds.map((runId) => this.#runs.get(runId)).filter((run): run is ActiveSubagentRun => !!run);
	}
}
