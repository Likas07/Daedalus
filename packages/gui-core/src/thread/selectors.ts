import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { ThreadLoopState } from "./reducer";
import { createThreadViewModel, type ThreadViewModel, type TimelineEntryViewModel } from "./view-model";

export function selectThread(state: ThreadLoopState): protocolV1.Thread | undefined {
	return state.thread;
}

export function selectTurns(state: ThreadLoopState): readonly protocolV1.Turn[] {
	return Object.values(state.turnsById).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectTimelineEntries(state: ThreadLoopState): readonly protocolV1.TimelineEntry[] {
	return state.timelineOrder.map((entryId) => state.timelineById[entryId]!).filter(Boolean);
}

export function selectTimelineViewModels(state: ThreadLoopState): readonly TimelineEntryViewModel[] {
	return createThreadViewModel(state).timeline;
}

export function selectThreadViewModel(state: ThreadLoopState): ThreadViewModel {
	return createThreadViewModel(state);
}

export function selectReplayCursor(state: ThreadLoopState): protocolV1.ReplayCursor | undefined {
	return state.nextCursor;
}
