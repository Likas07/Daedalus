export type ConnectionState = "connecting" | "open" | "closing" | "closed" | "error";

export class AppServerConnectionError extends Error {
	readonly state: ConnectionState;
	readonly cause?: unknown;

	constructor(message: string, options: { state: ConnectionState; cause?: unknown }) {
		super(message);
		this.name = "AppServerConnectionError";
		this.state = options.state;
		this.cause = options.cause;
	}
}

export function describeCloseEvent(event: CloseEvent): string {
	const reason = event.reason ? `: ${event.reason}` : "";
	return `WebSocket closed (${event.code}${reason})`;
}
