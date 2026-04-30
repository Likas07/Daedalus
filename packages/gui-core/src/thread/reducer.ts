import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

export interface ThreadLoopState {
	readonly thread?: protocolV1.Thread;
	readonly turnsById: Readonly<Record<string, protocolV1.Turn>>;
	readonly timelineById: Readonly<Record<string, protocolV1.TimelineEntry>>;
	readonly timelineOrder: readonly string[];
	readonly nextCursor?: protocolV1.ReplayCursor;
	readonly previousCursor?: protocolV1.ReplayCursor;
	readonly hasMoreAfter: boolean;
	readonly hasMoreBefore: boolean;
	readonly connectionStatus: "idle" | "replaying" | "live" | "error";
	readonly error?: string;
}

export type ThreadLoopAction =
	| { readonly type: "thread.loaded"; readonly thread: protocolV1.Thread; readonly turns?: readonly protocolV1.Turn[] }
	| { readonly type: "thread.replayStarted" }
	| { readonly type: "thread.replayApplied"; readonly window: protocolV1.TimelineWindowResult }
	| {
			readonly type: "thread.timelineEntryReceived";
			readonly entry: protocolV1.TimelineEntry;
			readonly nextCursor?: protocolV1.ReplayCursor;
	  }
	| { readonly type: "turn.started"; readonly turn: protocolV1.Turn }
	| { readonly type: "turn.cancelled"; readonly turn: protocolV1.Turn }
	| { readonly type: "thread.error"; readonly error: string };

export function createInitialThreadLoopState(): ThreadLoopState {
	return {
		turnsById: {},
		timelineById: {},
		timelineOrder: [],
		hasMoreAfter: false,
		hasMoreBefore: false,
		connectionStatus: "idle",
	};
}

export function threadLoopReducer(
	state: ThreadLoopState = createInitialThreadLoopState(),
	action: ThreadLoopAction,
): ThreadLoopState {
	switch (action.type) {
		case "thread.loaded":
			return {
				...state,
				thread: action.thread,
				turnsById: mergeTurns(state.turnsById, action.turns ?? []),
				error: undefined,
			};
		case "thread.replayStarted":
			return { ...state, connectionStatus: "replaying", error: undefined };
		case "thread.replayApplied":
			return applyReplayWindow(state, action.window);
		case "thread.timelineEntryReceived":
			return applyTimelineEntry(state, action.entry, action.nextCursor);
		case "turn.started":
		case "turn.cancelled":
			return {
				...state,
				turnsById: mergeTurns(state.turnsById, [action.turn]),
				thread: state.thread
					? {
							...state.thread,
							status: action.turn.status === "cancelled" ? "idle" : "running",
							lastTurnId: action.turn.turnId,
							updatedAt: action.turn.updatedAt,
						}
					: state.thread,
			};
		case "thread.error":
			return { ...state, connectionStatus: "error", error: action.error };
	}
}

export function applyReplayWindow(state: ThreadLoopState, window: protocolV1.TimelineWindowResult): ThreadLoopState {
	const withEntries = window.entries.reduce(
		(nextState, entry) => applyTimelineEntry(nextState, entry, undefined, "replaying"),
		state,
	);
	return {
		...withEntries,
		nextCursor: window.nextCursor ?? withEntries.nextCursor,
		previousCursor: window.previousCursor ?? withEntries.previousCursor,
		hasMoreAfter: window.hasMoreAfter,
		hasMoreBefore: window.hasMoreBefore,
		connectionStatus: "live",
		error: undefined,
	};
}

export function applyTimelineEntry(
	state: ThreadLoopState,
	entry: protocolV1.TimelineEntry,
	nextCursor?: protocolV1.ReplayCursor,
	connectionStatus: ThreadLoopState["connectionStatus"] = "live",
): ThreadLoopState {
	const existing = state.timelineById[entry.entryId];
	const timelineById = { ...state.timelineById, [entry.entryId]: entry };
	const timelineOrder = existing
		? state.timelineOrder
		: [...state.timelineOrder, entry.entryId].sort(
				(left, right) => timelineById[left]!.sequence - timelineById[right]!.sequence || left.localeCompare(right),
			);
	return {
		...state,
		timelineById,
		timelineOrder,
		nextCursor: maxCursor(state.nextCursor, nextCursor ?? { seq: entry.sequence }),
		previousCursor: minCursor(state.previousCursor, { seq: entry.sequence }),
		connectionStatus,
		error: undefined,
	};
}

function mergeTurns(
	current: Readonly<Record<string, protocolV1.Turn>>,
	turns: readonly protocolV1.Turn[],
): Readonly<Record<string, protocolV1.Turn>> {
	const next: Record<string, protocolV1.Turn> = { ...current };
	for (const turn of turns) next[turn.turnId] = turn;
	return next;
}

function maxCursor(
	left: protocolV1.ReplayCursor | undefined,
	right: protocolV1.ReplayCursor | undefined,
): protocolV1.ReplayCursor | undefined {
	if (!left) return right;
	if (!right) return left;
	return left.seq >= right.seq ? left : right;
}

function minCursor(
	left: protocolV1.ReplayCursor | undefined,
	right: protocolV1.ReplayCursor | undefined,
): protocolV1.ReplayCursor | undefined {
	if (!left) return right;
	if (!right) return left;
	return left.seq <= right.seq ? left : right;
}
