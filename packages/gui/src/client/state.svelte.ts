import type { GuiRuntime, GuiState } from "./runtime";

export interface GuiStateStore {
	readonly current: GuiState;
	subscribe(run: (state: GuiState) => void): () => void;
}

export function createGuiStateStore(runtime: GuiRuntime): GuiStateStore {
	let current = $state({ ...runtime.state });
	runtime.subscribe((state) => {
		current = { ...state };
	});
	return {
		get current() {
			return current;
		},
		subscribe: runtime.subscribe,
	};
}
