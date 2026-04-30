import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

export interface TerminalDrawerState {
	readonly isOpen: boolean;
	readonly activeTerminalId?: string;
	readonly contextsById: Readonly<Record<string, protocolV1.TerminalContext>>;
	readonly terminalOrder: readonly string[];
	readonly outputByTerminalId: Readonly<Record<string, readonly protocolV1.TerminalReplayOutputChunk[]>>;
	readonly replayingTerminalId?: string;
	readonly failureByTerminalId: Readonly<Record<string, protocolV1.TerminalFailure>>;
	readonly error?: string;
}

export type TerminalDrawerAction =
	| { readonly type: "terminal.drawerOpened"; readonly terminalId?: string }
	| { readonly type: "terminal.drawerClosed" }
	| { readonly type: "terminal.contextChanged"; readonly context: protocolV1.TerminalContext }
	| { readonly type: "terminal.commandCompleted"; readonly result: protocolV1.TerminalContextSuccess }
	| { readonly type: "terminal.commandFailed"; readonly failure: protocolV1.TerminalFailure }
	| {
			readonly type: "terminal.outputAppended";
			readonly terminalId: string;
			readonly chunk: protocolV1.TerminalReplayOutputChunk;
	  }
	| { readonly type: "terminal.replayStarted"; readonly terminalId: string }
	| { readonly type: "terminal.replayLoaded"; readonly result: protocolV1.TerminalReplaySuccess }
	| { readonly type: "terminal.error"; readonly error: string };

export function createInitialTerminalDrawerState(): TerminalDrawerState {
	return {
		isOpen: false,
		contextsById: {},
		terminalOrder: [],
		outputByTerminalId: {},
		failureByTerminalId: {},
	};
}

export function terminalDrawerReducer(
	state: TerminalDrawerState = createInitialTerminalDrawerState(),
	action: TerminalDrawerAction,
): TerminalDrawerState {
	switch (action.type) {
		case "terminal.drawerOpened":
			return { ...state, isOpen: true, activeTerminalId: action.terminalId ?? state.activeTerminalId };
		case "terminal.drawerClosed":
			return { ...state, isOpen: false };
		case "terminal.contextChanged":
			return upsertContext(state, action.context);
		case "terminal.commandCompleted":
			return {
				...upsertContext(state, action.result.context),
				failureByTerminalId: omitKey(state.failureByTerminalId, action.result.context.terminalId),
			};
		case "terminal.commandFailed": {
			const terminalId = action.failure.terminalId ?? action.failure.context?.terminalId ?? "terminal-error";
			return {
				...state,
				failureByTerminalId: { ...state.failureByTerminalId, [terminalId]: action.failure },
				error: action.failure.message,
			};
		}
		case "terminal.outputAppended":
			return appendChunks(state, action.terminalId, [action.chunk]);
		case "terminal.replayStarted":
			return { ...state, replayingTerminalId: action.terminalId, error: undefined };
		case "terminal.replayLoaded":
			return {
				...appendChunks(
					upsertContext(state, action.result.context),
					action.result.context.terminalId,
					action.result.chunks,
				),
				replayingTerminalId: undefined,
				error: undefined,
			};
		case "terminal.error":
			return { ...state, replayingTerminalId: undefined, error: action.error };
	}
}

export function selectTerminalContexts(state: TerminalDrawerState): readonly protocolV1.TerminalContext[] {
	return state.terminalOrder.map((terminalId) => state.contextsById[terminalId]).filter(Boolean);
}

export function selectActiveTerminalContext(state: TerminalDrawerState): protocolV1.TerminalContext | undefined {
	return state.activeTerminalId ? state.contextsById[state.activeTerminalId] : selectTerminalContexts(state)[0];
}

export function selectActiveTerminalOutput(
	state: TerminalDrawerState,
): readonly protocolV1.TerminalReplayOutputChunk[] {
	const terminalId = state.activeTerminalId ?? selectActiveTerminalContext(state)?.terminalId;
	return terminalId ? (state.outputByTerminalId[terminalId] ?? []) : [];
}

function upsertContext(state: TerminalDrawerState, context: protocolV1.TerminalContext): TerminalDrawerState {
	const exists = state.terminalOrder.includes(context.terminalId);
	return {
		...state,
		isOpen: state.isOpen || context.status === "opening" || context.status === "open" || context.status === "running",
		activeTerminalId: state.activeTerminalId ?? context.terminalId,
		contextsById: { ...state.contextsById, [context.terminalId]: context },
		terminalOrder: exists ? state.terminalOrder : [...state.terminalOrder, context.terminalId],
	};
}

function appendChunks(
	state: TerminalDrawerState,
	terminalId: string,
	chunks: readonly protocolV1.TerminalReplayOutputChunk[],
): TerminalDrawerState {
	if (chunks.length === 0) return state;
	const previous = state.outputByTerminalId[terminalId] ?? [];
	const byCursor = new Map(previous.map((chunk) => [chunk.cursor.seq, chunk]));
	for (const chunk of chunks) byCursor.set(chunk.cursor.seq, chunk);
	return {
		...state,
		activeTerminalId: state.activeTerminalId ?? terminalId,
		outputByTerminalId: {
			...state.outputByTerminalId,
			[terminalId]: [...byCursor.values()].sort((left, right) => left.cursor.seq - right.cursor.seq),
		},
	};
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
	if (!(key in record)) return record;
	const next = { ...record };
	delete next[key];
	return next;
}
