import { describe, expect, test } from "bun:test";
import { queryAsaasDocs } from "./docs-client";

describe("asaas docs client", () => {
	test("falls back to llms.txt when MCP fetch fails", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: string | URL | Request) =>
			String(url).includes("/mcp")
				? new Response("bad gateway", { status: 502 })
				: new Response("# Asaas API\n\n## Criar cliente\nURL: https://docs.asaas.com/reference/criar-cliente\nUse POST /customers.") as never;
		try {
			const result = await queryAsaasDocs({ query: "criar cliente", limit: 3 });
			expect(result.source).toBe("llms.txt");
			expect(result.results[0]?.text).toContain("POST /customers");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("falls back to llms.txt when MCP returns the plain HTTP client message", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: string | URL | Request) =>
			String(url).includes("/mcp")
				? new Response("This URL can only be accessed with a MCP client.")
				: new Response("# Asaas API\n\n## Listar cobranças\nURL: https://docs.asaas.com/reference/listar-cobrancas\nUse GET /payments.") as never;
		try {
			const result = await queryAsaasDocs({ query: "listar cobranças", limit: 3 });
			expect(result.source).toBe("llms.txt");
			expect(result.results[0]?.text).toContain("GET /payments");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
