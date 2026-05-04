import { describe, expect, test } from "bun:test";
import { authenticateRequest, isSameOriginWebSocketRequest } from "./auth";

describe("app server auth", () => {
	test("allows same-origin websocket requests without token when explicitly enabled", () => {
		const request = new Request("http://127.0.0.1:49152/ws", { headers: { origin: "http://127.0.0.1:49152" } });

		expect(isSameOriginWebSocketRequest(request)).toBe(true);
		expect(authenticateRequest(request, { token: "secret", host: "127.0.0.1", allowSameOriginWebSocket: true })).toBe(
			true,
		);
	});

	test("does not apply same-origin websocket allowance outside /ws", () => {
		const request = new Request("http://127.0.0.1:49152/api/gui/bootstrap", {
			headers: { origin: "http://127.0.0.1:49152" },
		});

		expect(isSameOriginWebSocketRequest(request)).toBe(false);
		expect(authenticateRequest(request, { token: "secret", host: "127.0.0.1", allowSameOriginWebSocket: true })).toBe(
			false,
		);
	});

	test("denies cross-origin websocket requests without token", () => {
		const request = new Request("http://127.0.0.1:49152/ws", { headers: { origin: "http://127.0.0.1:49153" } });

		expect(isSameOriginWebSocketRequest(request)).toBe(false);
		expect(authenticateRequest(request, { token: "secret", host: "127.0.0.1", allowSameOriginWebSocket: true })).toBe(
			false,
		);
	});

	test("still accepts bearer token for websocket requests", () => {
		const request = new Request("http://127.0.0.1:49152/ws", {
			headers: { authorization: "Bearer secret" },
		});

		expect(authenticateRequest(request, { token: "secret", host: "127.0.0.1" })).toBe(true);
	});

	test("still accepts query token for websocket requests", () => {
		const request = new Request("http://127.0.0.1:49152/ws?token=secret");

		expect(authenticateRequest(request, { token: "secret", host: "127.0.0.1" })).toBe(true);
	});
});
