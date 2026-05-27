import { getSemanticWorkspaceStatus } from "./semantic-workspace.js";

export const SEMANTIC_LIFECYCLE_TOOL_NAMES = [
	"sem_workspace_init",
	"sem_workspace_sync",
	"sem_workspace_status",
	"sem_workspace_info",
] as const;

let desiredToolNames: string[] | undefined;

export function rememberSemanticDesiredTools(toolNames: string[]): void {
	desiredToolNames = [...toolNames];
}

export function getRememberedSemanticDesiredTools(fallback: string[]): string[] {
	return desiredToolNames ? [...desiredToolNames] : [...fallback];
}

export function applySemanticToolExposure(toolNames: string[], cwd: string): string[] {
	const status = getSemanticWorkspaceStatus(cwd);
	const desired = getRememberedSemanticDesiredTools(toolNames);
	const filtered = desired.filter(
		(name) => !SEMANTIC_LIFECYCLE_TOOL_NAMES.includes(name as any) && name !== "sem_search",
	);
	if ((status.state === "ready" || status.state === "stale_soft") && !filtered.includes("sem_search")) {
		filtered.push("sem_search");
	}
	return filtered;
}
