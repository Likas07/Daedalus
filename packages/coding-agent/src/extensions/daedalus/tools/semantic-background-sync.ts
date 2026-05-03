import {
	getSemanticWorkspaceStatus,
	type SemanticWorkspaceStatus,
	syncSemanticWorkspace,
} from "./semantic-workspace.js";

export const BACKGROUND_SYNC_COOLDOWN_MS = 20 * 60 * 1000;

type SearchableWorkspaceState = Pick<SemanticWorkspaceStatus, "state" | "initialized" | "ready">;

interface ControllerDeps {
	getStatus?: (cwd: string) => SearchableWorkspaceState;
	syncWorkspace?: (cwd: string, options?: { restartEmbeddingModel?: boolean }) => Promise<unknown>;
	onStateChange?: (cwd: string, phase: "queued" | "started" | "finished" | "failed", error?: unknown) => void;
}

export interface SemanticBackgroundSyncSnapshot {
	running: boolean;
	lastAttemptAt?: number;
}

interface WorkspaceRuntimeState {
	hasRunStartupSync: boolean;
	inFlight?: Promise<void>;
	lastAttemptAt?: number;
}

export function createSemanticBackgroundSyncController(deps: ControllerDeps = {}) {
	const states = new Map<string, WorkspaceRuntimeState>();
	const getStatus = deps.getStatus ?? ((cwd: string) => getSemanticWorkspaceStatus(cwd));
	const syncWorkspace =
		deps.syncWorkspace ??
		((cwd: string, options?: { restartEmbeddingModel?: boolean }) =>
			syncSemanticWorkspace(cwd, undefined, options).then(() => undefined));

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

	function start(cwd: string, options: { requireEligible?: boolean; restartEmbeddingModel?: boolean } = {}): boolean {
		const state = getWorkspaceState(cwd);
		if (state.inFlight) return false;
		if (options.requireEligible && !isEligible(cwd)) return false;
		state.lastAttemptAt = Date.now();
		deps.onStateChange?.(cwd, "queued");
		state.inFlight = (async () => {
			deps.onStateChange?.(cwd, "started");
			try {
				await syncWorkspace(cwd, { restartEmbeddingModel: options.restartEmbeddingModel });
				deps.onStateChange?.(cwd, "finished");
			} catch (error) {
				deps.onStateChange?.(cwd, "failed", error);
			} finally {
				state.inFlight = undefined;
			}
		})();
		void state.inFlight;
		return true;
	}

	return {
		maybeStartForSession(cwd: string): void {
			const state = getWorkspaceState(cwd);
			if (state.hasRunStartupSync) return;
			state.hasRunStartupSync = true;
			start(cwd, { requireEligible: true });
		},
		maybeStartAfterTurn(cwd: string): void {
			const state = getWorkspaceState(cwd);
			if (state.lastAttemptAt && Date.now() - state.lastAttemptAt < BACKGROUND_SYNC_COOLDOWN_MS) return;
			start(cwd, { requireEligible: true });
		},
		startExplicit(cwd: string, options: { restartEmbeddingModel?: boolean } = {}): boolean {
			return start(cwd, options);
		},
		getSnapshot(cwd: string): SemanticBackgroundSyncSnapshot {
			const state = getWorkspaceState(cwd);
			return { running: Boolean(state.inFlight), lastAttemptAt: state.lastAttemptAt };
		},
	};
}
