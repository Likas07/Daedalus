import type { AppServerErrorCode, ServerResponse } from "@daedalus-pi/app-server-protocol";
import { isInitializeRequest, validateInboundMessage, validationFailed } from "./protocol-validation";
import { RequestSerializer } from "./request-serialization";
import type { AppRouter, OutboundMessage } from "./router";

export type ProtocolSessionSend = (message: OutboundMessage | ServerResponse) => void;

export class ProtocolSession {
	private readonly serializer = new RequestSerializer();
	private initialized = false;

	constructor(
		private readonly router: AppRouter,
		private readonly sendMessage: ProtocolSessionSend,
	) {}

	send(message: OutboundMessage | ServerResponse): void {
		this.sendMessage(message);
	}

	async receive(data: string | Buffer): Promise<void> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(typeof data === "string" ? data : data.toString());
		} catch (error) {
			this.send(failedResponse("invalid", "parse_error", error instanceof Error ? error.message : String(error)));
			return;
		}

		const validation = validateInboundMessage(parsed);
		if (validationFailed(validation)) {
			this.send(failedResponse(responseId(parsed), validation.code, validation.message, validation.data));
			return;
		}

		if (validation.kind === "notification") {
			this.router.handleNotification(validation.notification);
			return;
		}

		const request = validation.request;
		if (!this.initialized && !isInitializeRequest(request)) {
			this.send(failedResponse(String(request.id), "not_initialized", "Call initialize before other requests"));
			return;
		}

		try {
			const result = await this.serializer.run(request, () => this.router.handle(request));
			if (request.method === "initialize") this.initialized = true;
			this.send({ kind: "response", id: String(request.id), ok: true, result });
		} catch (error) {
			this.send(
				failedResponse(
					String(request.id),
					errorCode(error),
					error instanceof Error ? error.message : String(error),
					errorData(error),
				),
			);
		}
	}
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
