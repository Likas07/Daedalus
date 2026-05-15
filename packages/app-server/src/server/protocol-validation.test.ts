import { describe, expect, test } from "bun:test";
import { validateInboundMessage, validationFailed } from "./protocol-validation";

describe("protocol validation", () => {
	test("rejects malformed envelopes as invalid_request", () => {
		const result = validateInboundMessage({ kind: "request", method: "project/list", params: {} });
		expect(validationFailed(result)).toBe(true);
		if (validationFailed(result)) expect(result.code).toBe("invalid_request");
	});

	test("rejects unknown request methods as method_not_found", () => {
		const result = validateInboundMessage({ kind: "request", id: "1", method: "missing.method", params: {} });
		expect(validationFailed(result)).toBe(true);
		if (validationFailed(result)) expect(result.code).toBe("method_not_found");
	});

	test("rejects known methods with invalid params as invalid_params", () => {
		const result = validateInboundMessage({ kind: "request", id: "1", method: "project/open", params: {} });
		expect(validationFailed(result)).toBe(true);
		if (validationFailed(result)) expect(result.code).toBe("invalid_params");
	});

	test("accepts v1 thread requests", () => {
		const result = validateInboundMessage({
			kind: "request",
			id: "1",
			method: "thread.get",
			params: { threadId: "thread-1" },
		});
		expect(validationFailed(result)).toBe(false);
	});
});
