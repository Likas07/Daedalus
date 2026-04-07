import type { TaskIsolationMode } from "./isolation-backend";

export function resolveTaskIsolationRequest(
	configuredMode: TaskIsolationMode,
	isolationFlag: boolean | undefined,
	agentUseWorktree: boolean | undefined,
): { isolationRequested: boolean; effectiveIsolationMode: TaskIsolationMode } {
	const isolationRequested = isolationFlag ?? agentUseWorktree === true;
	const effectiveIsolationMode = isolationRequested && configuredMode === "none" ? "worktree" : configuredMode;
	return { isolationRequested, effectiveIsolationMode };
}
