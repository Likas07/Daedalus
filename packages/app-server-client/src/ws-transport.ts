import type { AppServerTransport } from "./client";
import { AppServerConnectionError, type ConnectionState, describeCloseEvent } from "./connection-state";

export interface WebSocketTransportOptions {
	readonly url: string;
	readonly protocols?: string | string[];
	readonly WebSocketImpl?: typeof WebSocket;
}

export class WebSocketAppServerTransport implements AppServerTransport {
	readonly requiresInitialize = true;
	private readonly ws: WebSocket;
	private readonly listeners = new Set<(message: unknown) => void>();
	private readonly closeListeners = new Set<(error?: unknown) => void>();
	private openPromise: Promise<void> | undefined;
	private closeNotified = false;
	private state: ConnectionState = "connecting";

	constructor(options: WebSocketTransportOptions) {
		const WebSocketCtor = options.WebSocketImpl ?? WebSocket;
		this.ws = new WebSocketCtor(options.url, options.protocols);
		this.ws.addEventListener("message", (event) => {
			const raw = typeof event.data === "string" ? event.data : String(event.data);
			const message = JSON.parse(raw) as unknown;
			for (const listener of this.listeners) listener(message);
		});
		this.openPromise = new Promise((resolve, reject) => {
			this.ws.addEventListener(
				"open",
				() => {
					this.state = "open";
					resolve();
				},
				{ once: true },
			);
			this.ws.addEventListener(
				"error",
				(event) => {
					this.state = "error";
					const error = new AppServerConnectionError("WebSocket connection failed", {
						state: "error",
						cause: event,
					});
					reject(error);
					this.notifyClose(error);
				},
				{ once: true },
			);
		});
		this.ws.addEventListener("close", (event) => {
			this.state = "closed";
			this.notifyClose(new AppServerConnectionError(describeCloseEvent(event), { state: "closed", cause: event }));
		});
		this.ws.addEventListener("error", (event) => {
			this.state = "error";
			this.notifyClose(
				new AppServerConnectionError("WebSocket connection failed", { state: "error", cause: event }),
			);
		});
	}

	async send(message: unknown): Promise<void> {
		if (this.ws.readyState === WebSocket.CONNECTING) await this.openPromise;
		if (this.ws.readyState !== WebSocket.OPEN) {
			throw new AppServerConnectionError("WebSocket is not open", { state: this.state });
		}
		this.ws.send(JSON.stringify(message));
	}

	onMessage(listener: (message: unknown) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onClose(listener: (error?: unknown) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	close(): void {
		this.state = "closing";
		this.ws.close();
	}

	private notifyClose(error: Error): void {
		if (this.closeNotified) return;
		this.closeNotified = true;
		for (const listener of this.closeListeners) listener(error);
	}
}

export function createWebSocketTransport(options: WebSocketTransportOptions): WebSocketAppServerTransport {
	return new WebSocketAppServerTransport(options);
}
