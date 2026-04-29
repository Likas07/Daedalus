import { describe, expect, test } from "bun:test";
import { callAsaasApi } from "./api-client";

describe("asaas api client", () => {
	test("builds GET URL and redacts auth from details", async () => {
		const originalFetch = globalThis.fetch;
		let captured: { url?: string; init?: RequestInit } = {};
		globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
			captured = { url: String(url), init };
			return Response.json({ data: [{ id: "cus_123" }] });
		};
		try {
			const result = await callAsaasApi(
				{ baseUrl: "https://api.asaas.com/v3", accessToken: "secret-token" },
				{ method: "GET", path: "/customers", query: { limit: 1 } },
			);
			expect(captured.url).toBe("https://api.asaas.com/v3/customers?limit=1");
			expect((captured.init?.headers as Record<string, string>).access_token).toBe("secret-token");
			expect(JSON.stringify(result)).not.toContain("secret-token");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
