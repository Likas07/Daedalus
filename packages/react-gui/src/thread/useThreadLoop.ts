import {
	cancelTurn,
	getThread,
	startTurn,
	subscribeThreadV1,
	type ThreadV1NotificationClient,
} from "@daedalus-pi/app-server-client";
import {
	createInitialThreadLoopState,
	selectReplayCursor,
	selectThreadViewModel,
	type ThreadLoopState,
	type ThreadViewModel,
	threadLoopReducer,
} from "@daedalus-pi/gui-core";
import React from "react";

interface ReactHookRuntime {
	useRef<T>(initial: T): { current: T };
	useState<T>(initial: T | (() => T)): [T, (value: T) => void];
	useEffect(effect: () => undefined | (() => void), dependencies: readonly unknown[]): void;
}

const ReactHooks = React as unknown as ReactHookRuntime;

export interface ThreadLoopSnapshot {
	readonly state: ThreadLoopState;
	readonly viewModel: ThreadViewModel;
	readonly isLoading: boolean;
	readonly isSubmitting: boolean;
	readonly activeTurnId?: string;
}

export interface ThreadLoopControllerOptions {
	readonly client: ThreadV1NotificationClient;
	readonly threadId: string;
	readonly limit?: number;
}

export interface ThreadLoopController extends ThreadLoopSnapshot {
	readonly load: () => Promise<void>;
	readonly reconnect: () => Promise<void>;
	readonly submitTurn: (prompt: string) => Promise<void>;
	readonly cancelActiveTurn: () => Promise<void>;
	readonly dispose: () => void;
	readonly subscribe: (listener: (snapshot: ThreadLoopSnapshot) => void) => () => void;
}

export interface UseThreadLoopResult extends ThreadLoopSnapshot {
	readonly submitTurn: (prompt: string) => Promise<void>;
	readonly cancelActiveTurn: () => Promise<void>;
	readonly reconnect: () => Promise<void>;
}

type InternalSnapshot = ThreadLoopSnapshot & { readonly disposed: boolean };

export function createThreadLoopController(options: ThreadLoopControllerOptions): ThreadLoopController {
	let state = createInitialThreadLoopState();
	let isLoading = false;
	let isSubmitting = false;
	let activeTurnId: string | undefined;
	let disposed = false;
	let unsubscribeLive: (() => void) | undefined;
	const listeners = new Set<(snapshot: ThreadLoopSnapshot) => void>();

	const snapshot = (): InternalSnapshot => ({
		state,
		viewModel: selectThreadViewModel(state),
		isLoading,
		isSubmitting,
		activeTurnId,
		disposed,
	});
	const emit = () => {
		if (disposed) return;
		const next = snapshot();
		for (const listener of listeners) listener(next);
	};
	const dispatch = (action: Parameters<typeof threadLoopReducer>[1]) => {
		state = threadLoopReducer(state, action);
		emit();
	};
	const handleError = (error: unknown) => {
		dispatch({ type: "thread.error", error: error instanceof Error ? error.message : String(error) });
	};
	const startLive = async () => {
		unsubscribeLive?.();
		const subscription = subscribeThreadV1({
			client: options.client,
			threadId: options.threadId,
			after: selectReplayCursor(state),
			limit: options.limit ?? 100,
			onReplay: (window) => dispatch({ type: "thread.replayApplied", window }),
			onEntry: (entry, notification) =>
				dispatch({ type: "thread.timelineEntryReceived", entry, nextCursor: notification.nextCursor }),
			onError: handleError,
		});
		unsubscribeLive = () => subscription.unsubscribe();
		await subscription.ready;
	};

	const controller = {
		get state() {
			return state;
		},
		get viewModel() {
			return selectThreadViewModel(state);
		},
		get isLoading() {
			return isLoading;
		},
		get isSubmitting() {
			return isSubmitting;
		},
		get activeTurnId() {
			return activeTurnId;
		},
		async load() {
			isLoading = true;
			dispatch({ type: "thread.replayStarted" });
			try {
				const result = await getThread(options.client, { threadId: options.threadId });
				dispatch({ type: "thread.loaded", thread: result.thread, turns: result.turns });
				dispatch({ type: "thread.replayApplied", window: result.timeline });
				await startLive();
			} catch (error) {
				handleError(error);
			} finally {
				isLoading = false;
				emit();
			}
		},
		async reconnect() {
			await this.load();
		},
		async submitTurn(prompt: string) {
			const trimmed = prompt.trim();
			if (!trimmed) return;
			isSubmitting = true;
			emit();
			try {
				const result = await startTurn(options.client, { threadId: options.threadId, prompt: trimmed });
				activeTurnId = result.turn.turnId;
				dispatch({ type: "turn.started", turn: result.turn });
			} catch (error) {
				handleError(error);
			} finally {
				isSubmitting = false;
				emit();
			}
		},
		async cancelActiveTurn() {
			const turnId = activeTurnId ?? findCancellableTurnId(state);
			if (!turnId) return;
			try {
				const result = await cancelTurn(options.client, { threadId: options.threadId, turnId });
				activeTurnId = undefined;
				dispatch({ type: "turn.cancelled", turn: result.turn });
			} catch (error) {
				handleError(error);
			}
		},
		dispose() {
			disposed = true;
			unsubscribeLive?.();
			listeners.clear();
		},
		subscribe(listener: (snapshot: ThreadLoopSnapshot) => void) {
			listeners.add(listener);
			listener(snapshot());
			return () => listeners.delete(listener);
		},
	} satisfies ThreadLoopController;

	return controller;
}

export function useThreadLoop(options: ThreadLoopControllerOptions): UseThreadLoopResult {
	const controllerRef = ReactHooks.useRef<ThreadLoopController | undefined>(undefined);
	const [snapshot, setSnapshot] = ReactHooks.useState<ThreadLoopSnapshot>(() => {
		const state = createInitialThreadLoopState();
		return { state, viewModel: selectThreadViewModel(state), isLoading: true, isSubmitting: false };
	});

	ReactHooks.useEffect(() => {
		const controller = createThreadLoopController(options);
		controllerRef.current = controller;
		const unsubscribe = controller.subscribe(setSnapshot);
		void controller.load();
		return () => {
			unsubscribe();
			controller.dispose();
			if (controllerRef.current === controller) controllerRef.current = undefined;
		};
	}, [options.client, options.threadId, options.limit]);

	return {
		...snapshot,
		submitTurn: async (prompt: string) => controllerRef.current?.submitTurn(prompt),
		cancelActiveTurn: async () => controllerRef.current?.cancelActiveTurn(),
		reconnect: async () => controllerRef.current?.reconnect(),
	};
}

function findCancellableTurnId(state: ThreadLoopState): string | undefined {
	return Object.values(state.turnsById)
		.filter((turn) => turn.status === "queued" || turn.status === "running" || turn.status === "waiting")
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
		.at(0)?.turnId;
}
