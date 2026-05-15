import type { ResponseError } from "@daedalus-pi/app-server-protocol";

export class AppServerProtocolError extends Error {
	readonly code: ResponseError["code"];
	readonly data?: unknown;

	constructor(code: ResponseError["code"], message: string, data?: unknown) {
		super(message);
		this.name = "AppServerProtocolError";
		this.code = code;
		this.data = data;
	}
}

export function responseErrorFromUnknown(error: unknown): ResponseError {
	if (error instanceof AppServerProtocolError) {
		return error.data === undefined
			? { code: error.code, message: error.message }
			: { code: error.code, message: error.message, data: error.data };
	}
	if (isObject(error) && isResponseErrorCode(error.code) && typeof error.message === "string") {
		return error.data === undefined
			? { code: error.code, message: error.message }
			: { code: error.code, message: error.message, data: error.data };
	}
	return { code: "internal_error", message: error instanceof Error ? error.message : String(error) };
}

export function protocolError(code: ResponseError["code"], message: string, data?: unknown): AppServerProtocolError {
	return new AppServerProtocolError(code, message, data);
}

function isResponseErrorCode(value: unknown): value is ResponseError["code"] {
	return (
		value === "cancelled" ||
		value === "conflict" ||
		value === "internal_error" ||
		value === "invalid_params" ||
		value === "invalid_request" ||
		value === "method_not_found" ||
		value === "not_initialized" ||
		value === "parse_error" ||
		value === "unsupported_capability"
	);
}
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
