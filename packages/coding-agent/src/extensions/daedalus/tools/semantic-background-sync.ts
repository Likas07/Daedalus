import { syncSemanticWorkspace } from "./semantic-workspace.js";

interface ControllerDeps {
	syncWorkspace?: (cwd: string, options?: { restartEmbeddingModel?: boolean }) => Promise<unknown>;
	onStateChange?: (cwd: string, phase: "queued" | "started" | "finished" | "failed", error?: unknown) => void;
}

export interface SemanticBackgroundSyncSnapshot {
	running: boolean;
	lastAttemptAt?: number;
}

interface WorkspaceRuntimeState {
	inFlight?: Promise<void>;
	lastAttemptAt?: number;
}

export function createSemanticBackgroundSyncController(deps: ControllerDeps = {}) {
	const states = new Map<string, WorkspaceRuntimeState>();
	const syncWorkspace =
		deps.syncWorkspace ??
		((cwd: string, options?: { restartEmbeddingModel?: boolean }) =>
			syncSemanticWorkspace(cwd, undefined, options).then(() => undefined));

	function getWorkspaceState(cwd: string): WorkspaceRuntimeState {
		const existing = states.get(cwd);
		if (existing) return existing;
		const created: WorkspaceRuntimeState = {};
		states.set(cwd, created);
		return created;
	}

	function start(cwd: string, options: { restartEmbeddingModel?: boolean } = {}): boolean {
		const state = getWorkspaceState(cwd);
		if (state.inFlight) return false;
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
		maybeStartForSession(_cwd: string): void {
			// Automatic semantic workspace sync is intentionally disabled; use /workspace-sync or startExplicit instead.
		},
		maybeStartAfterTurn(_cwd: string): void {
			// Automatic semantic workspace sync is intentionally disabled; use /workspace-sync or startExplicit instead.
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
