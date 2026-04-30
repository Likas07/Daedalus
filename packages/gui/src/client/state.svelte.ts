import type { GuiRuntime, GuiState } from "./runtime";

export interface GuiStateStore {
	readonly current: GuiState;
	subscribe(run: (state: GuiState) => void): () => void;
}

export function createGuiStateStore(runtime: GuiRuntime): GuiStateStore {
	let current = $state({ ...runtime.state });
	runtime.subscribe((state) => {
		current = {
			...state,
			diagnostics: [...state.diagnostics],
			events: [...state.events],
			sessions: [...state.sessions],
			worktrees: [...state.worktrees],
			terminals: [...state.terminals],
			models: [...state.models],
			projections: state.projections
				? {
						shell: { ...state.projections.shell, threads: [...state.projections.shell.threads], safetySignals: [...state.projections.shell.safetySignals] },
						thread: state.projections.thread
							? {
									...state.projections.thread,
									messages: [...state.projections.thread.messages],
									activity: [...state.projections.thread.activity],
									pendingActions: [...state.projections.thread.pendingActions],
									safetySignals: [...state.projections.thread.safetySignals],
									diffIds: [...state.projections.thread.diffIds],
									rows: [...state.projections.thread.rows],
								}
							: undefined,
					}
				: undefined,
		};
	});
	return {
		get current() {
			return current;
		},
		subscribe: runtime.subscribe,
	};
}
