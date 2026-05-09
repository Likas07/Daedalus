import type { AppServerErrorCode, ServerResponse } from "@daedalus-pi/app-server-protocol";
import type { ServerWebSocket } from "bun";
import { isInitializeRequest, validateInboundMessage, validationFailed } from "./protocol-validation";
import { RequestSerializer } from "./request-serialization";
import type { AppRouter, OutboundMessage } from "./router";

export type AppServerWebSocket = ServerWebSocket<{ client: WebSocketClient }>;

const MAX_QUEUE = 128;

export class WebSocketClient {
	private readonly queue: string[] = [];
	private initialized = false;
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

	isInitialized(): boolean {
		return this.initialized;
	}

	markInitialized(): void {
		this.initialized = true;
	}
}

export function createWebSocketHandlers(router: AppRouter, clients: Set<WebSocketClient>) {
	const serializer = new RequestSerializer();
	return {
		open(ws: AppServerWebSocket) {
			const client = new WebSocketClient(ws);
			ws.data.client = client;
			clients.add(client);
		},
		async message(ws: AppServerWebSocket, data: string | Buffer) {
			const client = ws.data.client;
			let parsed: unknown;
			try {
				parsed = JSON.parse(typeof data === "string" ? data : data.toString());
			} catch (error) {
				client.send({
					kind: "response",
					id: "invalid",
					ok: false,
					error: { code: "parse_error", message: error instanceof Error ? error.message : String(error) },
				});
				return;
			}
			const validation = validateInboundMessage(parsed);
			if (validationFailed(validation)) {
				client.send(failedResponse(responseId(parsed), validation.code, validation.message, validation.data));
				return;
			}
			if (validation.kind === "request") {
				const message = validation.request;
				if (!client.isInitialized() && !isInitializeRequest(message)) {
					client.send(failedResponse(String(message.id), "not_initialized", "Call initialize before other requests"));
					return;
				}
				try {
					const result = await serializer.run(message, () => router.handle(message));
					if (message.method === "initialize") client.markInitialized();
					client.send({ kind: "response", id: String(message.id), ok: true, result });
				} catch (error) {
					client.send(
						failedResponse(
							String(message.id),
							errorCode(error),
							error instanceof Error ? error.message : String(error),
							errorData(error),
						),
					);
				}
				return;
			}
			router.handleNotification(validation.notification);
		},
		drain(ws: AppServerWebSocket) {
			ws.data.client.flush();
		},
		close(ws: AppServerWebSocket) {
			clients.delete(ws.data.client);
		},
	};
}

function failedResponse(
	id: string,
	code: AppServerErrorCode,
	message: string,
	data?: unknown,
): ServerResponse {
	return { kind: "response", id, ok: false, error: { code, message, data } };
}

function responseId(message: unknown): string {
	if (message && typeof message === "object" && typeof (message as { id?: unknown }).id === "string")
		return (message as { id: string }).id;
	return "invalid";
}

function errorCode(error: unknown): AppServerErrorCode {
	const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
	return isAppServerErrorCode(code) ? code : "internal_error";
}

function errorData(error: unknown): unknown {
	return error && typeof error === "object" && "data" in error ? (error as { data?: unknown }).data : undefined;
}

function isAppServerErrorCode(value: unknown): value is AppServerErrorCode {
	return (
		value === "parse_error" ||
		value === "invalid_request" ||
		value === "not_initialized" ||
		value === "method_not_found" ||
		value === "invalid_params" ||
		value === "conflict" ||
		value === "cancelled" ||
		value === "unsupported_capability" ||
		value === "internal_error"
	);
}
