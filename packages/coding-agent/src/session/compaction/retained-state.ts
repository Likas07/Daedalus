import type { PlanModeState } from "../../plan-mode/state";
import type { SessionEntry } from "../../session/session-manager";
import type { TodoItem, TodoPhase } from "../../tools/todo-write";

export const COMPACTION_RETAINED_STATE_KEY = "phase2RetainedState";

export interface CompactionRetainedTaskOwnership {
	taskId: string;
	paths: string[];
}

export interface CompactionRetainedWaveState {
	id: string;
	goal?: string;
	totalTasks: number;
	completedTasks: number;
	failedTasks: string[];
	ownership: CompactionRetainedTaskOwnership[];
}

export interface CompactionRetainedState {
	activeObjective?: string;
	planMode?: Pick<PlanModeState, "planFilePath" | "workflow">;
	pendingVerification: string[];
	blockers: string[];
	activeTodos: Array<Pick<TodoItem, "content" | "status"> & { phase: string }>;
	wave?: CompactionRetainedWaveState;
}

function parseTaskWave(details: unknown): CompactionRetainedWaveState | undefined {
	if (!details || typeof details !== "object") return undefined;
	const record = details as Record<string, unknown>;
	const wave = record.wave;
	if (!wave || typeof wave !== "object") return undefined;
	const waveRecord = wave as Record<string, unknown>;
	if (
		typeof waveRecord.id !== "string" ||
		typeof waveRecord.totalTasks !== "number" ||
		typeof waveRecord.completedTasks !== "number"
	) {
		return undefined;
	}
	const results = Array.isArray(record.results) ? record.results : [];
	const failedTasks: string[] = [];
	const ownership: CompactionRetainedTaskOwnership[] = [];
	for (const result of results) {
		if (!result || typeof result !== "object") continue;
		const resultRecord = result as Record<string, unknown>;
		const taskId = typeof resultRecord.id === "string" ? resultRecord.id : undefined;
		const taskName = typeof resultRecord.description === "string" ? resultRecord.description : taskId;
		const failed =
			resultRecord.aborted === true ||
			typeof resultRecord.error === "string" ||
			(typeof resultRecord.exitCode === "number" && resultRecord.exitCode !== 0);
		if (failed && taskName) {
			failedTasks.push(taskName);
		}
		const ownedPaths = Array.isArray(resultRecord.ownedPaths)
			? resultRecord.ownedPaths.filter((item): item is string => typeof item === "string")
			: [];
		if (taskId && ownedPaths.length > 0) {
			ownership.push({ taskId, paths: ownedPaths });
		}
	}
	return {
		id: waveRecord.id,
		goal: typeof waveRecord.goal === "string" ? waveRecord.goal : undefined,
		totalTasks: waveRecord.totalTasks,
		completedTasks: waveRecord.completedTasks,
		failedTasks,
		ownership,
	};
}

export function extractLatestTaskWaveState(entries: SessionEntry[]): CompactionRetainedWaveState | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: string; toolName?: string; details?: unknown; isError?: boolean };
		if (message.role !== "toolResult" || message.toolName !== "task" || message.isError) continue;
		const parsed = parseTaskWave(message.details);
		if (parsed) return parsed;
	}
	return undefined;
}

function buildActiveTodos(phases: TodoPhase[]): Array<Pick<TodoItem, "content" | "status"> & { phase: string }> {
	return phases.flatMap(phase =>
		phase.tasks
			.filter(task => task.status === "pending" || task.status === "in_progress")
			.map(task => ({ phase: phase.name, content: task.content, status: task.status })),
	);
}

export function buildCompactionRetainedState(
	entries: SessionEntry[],
	todoPhases: TodoPhase[],
	planModeState?: PlanModeState,
): CompactionRetainedState | undefined {
	const activeTodos = buildActiveTodos(todoPhases);
	const activeObjective = activeTodos[0] ? `${activeTodos[0].phase}: ${activeTodos[0].content}` : undefined;
	const pendingVerification = activeTodos
		.filter(task => /verify|verification|review|check/i.test(task.content))
		.map(task => `${task.phase}: ${task.content}`);
	const wave = extractLatestTaskWaveState(entries);
	const blockers = wave?.failedTasks ?? [];
	const planMode = planModeState?.enabled
		? { planFilePath: planModeState.planFilePath, workflow: planModeState.workflow }
		: undefined;
	if (!activeObjective && !planMode && activeTodos.length === 0 && pendingVerification.length === 0 && !wave) {
		return undefined;
	}
	return {
		activeObjective,
		planMode,
		pendingVerification,
		blockers,
		activeTodos,
		wave,
	};
}

export function appendRetainedStateToSummary(summary: string, state: CompactionRetainedState | undefined): string {
	if (!state) return summary;
	const lines: string[] = [];
	if (state.activeObjective) {
		lines.push(`- Objective: ${state.activeObjective}`);
	}
	if (state.planMode) {
		lines.push(
			`- Plan mode: ${state.planMode.planFilePath}${state.planMode.workflow ? ` (${state.planMode.workflow})` : ""}`,
		);
	}
	if (state.wave) {
		const goalText = state.wave.goal ? ` — ${state.wave.goal}` : "";
		lines.push(`- Wave ${state.wave.id}: ${state.wave.completedTasks}/${state.wave.totalTasks} completed${goalText}`);
		if (state.wave.failedTasks.length > 0) {
			lines.push(`- Wave blockers: ${state.wave.failedTasks.join(", ")}`);
		}
		if (state.wave.ownership.length > 0) {
			lines.push(
				`- Ownership: ${state.wave.ownership.map(item => `${item.taskId} -> ${item.paths.join(", ")}`).join("; ")}`,
			);
		}
	}
	if (state.pendingVerification.length > 0) {
		lines.push(`- Pending verification: ${state.pendingVerification.join("; ")}`);
	}
	if (state.activeTodos.length > 0) {
		lines.push(
			`- Active tasks: ${state.activeTodos.map(task => `${task.phase}: ${task.content} [${task.status}]`).join("; ")}`,
		);
	}
	if (lines.length === 0) return summary;
	return `${summary}\n\n## Active Runtime State\n${lines.join("\n")}`;
}
