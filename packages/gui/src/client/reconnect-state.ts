export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "replaying" | "failed";

export interface ReconnectState {
	status: ConnectionStatus;
	lastEventCursor?: string;
	seenEventCursors: Set<string>;
	attempt: number;
	nextDelayMs: number;
	lastError?: string;
}

export interface ReconnectStateOptions {
	readonly baseDelayMs?: number;
	readonly maxDelayMs?: number;
}

export const defaultReconnectStateOptions = {
	baseDelayMs: 100,
	maxDelayMs: 2_000,
} as const;

export function createReconnectState(options: ReconnectStateOptions = {}): ReconnectState {
	return {
		status: "connecting",
		seenEventCursors: new Set(),
		attempt: 0,
		nextDelayMs: options.baseDelayMs ?? defaultReconnectStateOptions.baseDelayMs,
	};
}

export function setConnected(state: ReconnectState, options: ReconnectStateOptions = {}): void {
	state.status = "connected";
	state.attempt = 0;
	state.nextDelayMs = options.baseDelayMs ?? defaultReconnectStateOptions.baseDelayMs;
	state.lastError = undefined;
}

export function setDisconnected(state: ReconnectState, error?: unknown): void {
	if (state.status === "failed") return;
	state.status = "disconnected";
	if (error) state.lastError = errorMessage(error);
}

export function setReplaying(state: ReconnectState): void {
	state.status = "replaying";
}

export function setFailed(state: ReconnectState, error: unknown): void {
	state.status = "failed";
	state.lastError = errorMessage(error);
}

export function nextReconnectDelay(state: ReconnectState, options: ReconnectStateOptions = {}): number {
	const base = options.baseDelayMs ?? defaultReconnectStateOptions.baseDelayMs;
	const max = options.maxDelayMs ?? defaultReconnectStateOptions.maxDelayMs;
	const delay = Math.min(state.nextDelayMs || base, max);
	state.attempt += 1;
	state.nextDelayMs = Math.min(delay * 2, max);
	return delay;
}

export function eventCursor(event: { id?: unknown; seq?: unknown } | undefined): string | undefined {
	if (!event) return undefined;
	if (typeof event.seq === "number" || typeof event.seq === "string") return String(event.seq);
	if (typeof event.id === "string") return event.id;
	return undefined;
}

export function shouldAcceptEvent(state: ReconnectState, event: { id?: unknown; seq?: unknown } | undefined): boolean {
	const cursor = eventCursor(event);
	if (!cursor) return true;
	if (state.seenEventCursors.has(cursor)) return false;
	state.seenEventCursors.add(cursor);
	state.lastEventCursor = cursor;
	return true;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
