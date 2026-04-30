import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { ThreadLoopState } from "./reducer";

export interface TimelineEntryViewModel {
	readonly id: string;
	readonly kind: protocolV1.TimelineEntry["kind"];
	readonly sequence: number;
	readonly role?: "user" | "assistant";
	readonly title: string;
	readonly body?: string;
	readonly placeholder?: string;
	readonly createdAt: string;
}

export interface ThreadViewModel {
	readonly thread?: protocolV1.Thread;
	readonly turns: readonly protocolV1.Turn[];
	readonly timeline: readonly TimelineEntryViewModel[];
	readonly isReplaying: boolean;
	readonly isLive: boolean;
	readonly error?: string;
}

export function createThreadViewModel(state: ThreadLoopState): ThreadViewModel {
	return {
		thread: state.thread,
		turns: Object.values(state.turnsById).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
		timeline: state.timelineOrder.map((entryId) => timelineEntryToViewModel(state.timelineById[entryId]!)),
		isReplaying: state.connectionStatus === "replaying",
		isLive: state.connectionStatus === "live",
		error: state.error,
	};
}

export function timelineEntryToViewModel(entry: protocolV1.TimelineEntry): TimelineEntryViewModel {
	switch (entry.kind) {
		case "user-message":
			return base(entry, { role: "user", title: "You", body: entry.content });
		case "assistant-message":
			return base(entry, { role: "assistant", title: "Daedalus", body: entry.content });
		case "activity":
			return base(entry, {
				title: entry.title,
				body: entry.description,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
		case "tool":
			return base(entry, {
				title: `Tool: ${entry.toolName}`,
				body: entry.summary,
				placeholder:
					payloadPlaceholder(entry.payloadRef) ??
					(entry.payloadRef ? "Tool output available on demand" : undefined),
			});
		case "terminal-output":
			return base(entry, {
				title: "Terminal output",
				body: entry.summary,
				placeholder: payloadPlaceholder(entry.payloadRef) ?? "Terminal output available on demand",
			});
		case "terminal":
			return base(entry, {
				title: entry.title ?? `Terminal: ${entry.status}`,
				body: entry.summary,
				placeholder: entry.contextRef ? "Terminal context available on demand" : undefined,
			});
		case "approval":
			return base(entry, {
				title: entry.title,
				body: entry.summary,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
		case "diff":
			return base(entry, {
				title: entry.title,
				body: `${entry.filesChanged} files changed`,
				placeholder: payloadPlaceholder(entry.payloadRef) ?? "Diff content available on demand",
			});
		case "plan":
			return base(entry, {
				title: entry.title,
				body: entry.summary,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
		case "safety":
			return base(entry, {
				title: `Safety: ${entry.level}`,
				body: entry.message,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
		case "system-event":
			return base(entry, {
				title: entry.eventType,
				body: entry.message,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
		case "recovery-event":
			return base(entry, {
				title: `Recovery: ${entry.status}`,
				body: entry.message,
				placeholder: payloadPlaceholder(entry.payloadRef),
			});
	}
	return assertNever(entry);
}

function base(
	entry: protocolV1.TimelineEntry,
	fields: Pick<TimelineEntryViewModel, "title"> &
		Partial<Omit<TimelineEntryViewModel, "id" | "kind" | "sequence" | "createdAt">>,
): TimelineEntryViewModel {
	return {
		id: entry.entryId,
		kind: entry.kind,
		sequence: entry.sequence,
		createdAt: entry.createdAt,
		...fields,
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled timeline entry: ${JSON.stringify(value)}`);
}

function payloadPlaceholder(payloadRef: protocolV1.PayloadReference | undefined): string | undefined {
	if (!payloadRef) return undefined;
	switch (payloadRef.kind) {
		case "terminal-output":
			return `Terminal output placeholder (${payloadRef.byteLength} bytes)`;
		case "diff-content":
			return `Diff placeholder (${payloadRef.byteLength} bytes)`;
		case "tool-output":
			return `Tool output placeholder (${payloadRef.byteLength} bytes)`;
		case "audit-detail":
			return `Audit detail placeholder (${payloadRef.byteLength} bytes)`;
	}
}
