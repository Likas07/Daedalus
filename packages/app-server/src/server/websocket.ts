import type { ServerResponse } from "@daedalus-pi/app-server-protocol";
import type { ServerWebSocket } from "bun";
import { ProtocolSession } from "./protocol-session";
import type { AppRouter, OutboundMessage } from "./router";

export type AppServerWebSocket = ServerWebSocket<{ client: WebSocketClient }>;
export type AppServerClientConnection = WebSocketClient | ProtocolSession;

const MAX_QUEUE = 128;

export class WebSocketClient {
	private readonly queue: string[] = [];
	private readonly session: ProtocolSession;
	constructor(
		readonly ws: AppServerWebSocket,
		router: AppRouter,
	) {
		this.session = new ProtocolSession(router, (message) => this.send(message));
	}

	send(message: OutboundMessage | ServerResponse): void {
		const encoded = JSON.stringify(message);
		if (this.ws.readyState === WebSocket.OPEN) {
			const backpressure = this.ws.send(encoded);
			if (backpressure >= 0) return;
		}
		if (this.queue.length >= MAX_QUEUE) this.queue.shift();
		this.queue.push(encoded);
	}

	flush(): void {
		while (this.queue.length > 0 && this.ws.readyState === WebSocket.OPEN) {
			const item = this.queue.shift();
			if (item) this.ws.send(item);
		}
	}

	receive(data: string | Buffer): Promise<void> {
		return this.session.receive(data);
	}
}

export function createWebSocketHandlers(router: AppRouter, clients: Set<AppServerClientConnection>) {
	return {
		open(ws: AppServerWebSocket) {
			const client = new WebSocketClient(ws, router);
			ws.data.client = client;
			clients.add(client);
		},
		async message(ws: AppServerWebSocket, data: string | Buffer) {
			await ws.data.client.receive(data);
		},
		drain(ws: AppServerWebSocket) {
			ws.data.client.flush();
		},
		close(ws: AppServerWebSocket) {
			clients.delete(ws.data.client);
		},
	};
}
