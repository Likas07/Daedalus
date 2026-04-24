import { getSemanticWorkspaceStatus, syncSemanticWorkspace, type SemanticWorkspaceStatus } from "./semantic-workspace.js";

export const BACKGROUND_SYNC_COOLDOWN_MS = 20 * 60 * 1000;

type SearchableWorkspaceState = Pick<SemanticWorkspaceStatus, "state" | "initialized" | "ready">;

interface ControllerDeps {
	getStatus?: (cwd: string) => SearchableWorkspaceState;
	syncWorkspace?: (cwd: string) => Promise<unknown>;
	onStateChange?: (cwd: string, phase: "queued" | "started" | "finished" | "failed", error?: unknown) => void;
}

interface WorkspaceRuntimeState {
	hasRunStartupSync: boolean;
	inFlight?: Promise<void>;
	lastAttemptAt?: number;
}

export function createSemanticBackgroundSyncController(deps: ControllerDeps = {}) {
	const states = new Map<string, WorkspaceRuntimeState>();
	const getStatus = deps.getStatus ?? ((cwd: string) => getSemanticWorkspaceStatus(cwd));
	const syncWorkspace = deps.syncWorkspace ?? ((cwd: string) => syncSemanticWorkspace(cwd).then(() => undefined));

	function getWorkspaceState(cwd: string): WorkspaceRuntimeState {
		const existing = states.get(cwd);
		if (existing) return existing;
		const created: WorkspaceRuntimeState = { hasRunStartupSync: false };
		states.set(cwd, created);
		return created;
	}

	function isEligible(cwd: string): boolean {
		const status = getStatus(cwd);
		return status.state === "ready" || status.state === "stale_soft";
	}

	async function run(cwd: string): Promise<void> {
		const state = getWorkspaceState(cwd);
		if (state.inFlight || !isEligible(cwd)) return;
		state.lastAttemptAt = Date.now();
		deps.onStateChange?.(cwd, "queued");
		state.inFlight = (async () => {
			deps.onStateChange?.(cwd, "started");
			try {
				await syncWorkspace(cwd);
				deps.onStateChange?.(cwd, "finished");
			} catch (error) {
				deps.onStateChange?.(cwd, "failed", error);
			} finally {
				state.inFlight = undefined;
			}
		})();
		await state.inFlight;
	}

	return {
		async maybeStartForSession(cwd: string): Promise<void> {
			const state = getWorkspaceState(cwd);
			if (state.hasRunStartupSync) return;
			state.hasRunStartupSync = true;
			await run(cwd);
		},
		async maybeStartAfterTurn(cwd: string): Promise<void> {
			const state = getWorkspaceState(cwd);
			if (state.lastAttemptAt && Date.now() - state.lastAttemptAt < BACKGROUND_SYNC_COOLDOWN_MS) return;
			await run(cwd);
		},
	};
}
