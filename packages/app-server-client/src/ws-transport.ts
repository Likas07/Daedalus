import type { AppServerTransport } from "./client";

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

	constructor(options: WebSocketTransportOptions) {
		const WebSocketCtor = options.WebSocketImpl ?? WebSocket;
		this.ws = new WebSocketCtor(options.url, options.protocols);
		this.ws.addEventListener("message", (event) => {
			const raw = typeof event.data === "string" ? event.data : String(event.data);
			const message = JSON.parse(raw) as unknown;
			for (const listener of this.listeners) listener(message);
		});
		this.openPromise = new Promise((resolve, reject) => {
			this.ws.addEventListener("open", () => resolve(), { once: true });
			this.ws.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
		});
		this.ws.addEventListener("close", () => {
			for (const listener of this.closeListeners) listener(new Error("WebSocket connection closed"));
		});
		this.ws.addEventListener("error", () => {
			for (const listener of this.closeListeners) listener(new Error("WebSocket connection failed"));
		});
	}

	async send(message: unknown): Promise<void> {
		if (this.ws.readyState === WebSocket.CONNECTING) await this.openPromise;
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
		this.ws.close();
	}
}

export function createWebSocketTransport(options: WebSocketTransportOptions): WebSocketAppServerTransport {
	return new WebSocketAppServerTransport(options);
}
