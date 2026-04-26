import type { ClientNotification, ClientRequest, ServerResponse } from "@daedalus-pi/app-server-protocol";
import type { ServerWebSocket } from "bun";
import type { AppRouter, OutboundMessage } from "./router";

export type AppServerWebSocket = ServerWebSocket<{ client: WebSocketClient }>;

const MAX_QUEUE = 128;

export class WebSocketClient {
	private readonly queue: string[] = [];
	constructor(readonly ws: AppServerWebSocket) {}

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
}

export function createWebSocketHandlers(router: AppRouter, clients: Set<WebSocketClient>) {
	return {
		open(ws: AppServerWebSocket) {
			const client = new WebSocketClient(ws);
			ws.data.client = client;
			clients.add(client);
		},
		async message(ws: AppServerWebSocket, data: string | Buffer) {
			const client = ws.data.client;
			try {
				const message = JSON.parse(typeof data === "string" ? data : data.toString()) as
					| ClientRequest
					| ClientNotification;
				if (message.kind === "request") {
					try {
						const result = await router.handle(message);
						client.send({ kind: "response", id: message.id, ok: true, result });
					} catch (error) {
						client.send({
							kind: "response",
							id: message.id,
							ok: false,
							error: { code: "internal_error", message: error instanceof Error ? error.message : String(error) },
						});
					}
				}
				if (message.kind === "notification") router.handleNotification(message as ClientNotification);
			} catch (error) {
				client.send({
					kind: "response",
					id: "invalid",
					ok: false,
					error: { code: "invalid_json", message: error instanceof Error ? error.message : String(error) },
				});
			}
		},
		drain(ws: AppServerWebSocket) {
			ws.data.client.flush();
		},
		close(ws: AppServerWebSocket) {
			clients.delete(ws.data.client);
		},
	};
}
