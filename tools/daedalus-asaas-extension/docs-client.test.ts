import { describe, expect, test } from "bun:test";
import { queryAsaasDocs } from "./docs-client";

describe("asaas docs client", () => {
	test("queries Asaas MCP tools before fallback", async () => {
		const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
		let closed = false;
		const result = await queryAsaasDocs(
			{ query: "criar cliente", limit: 3 },
			{
				createMcpSession: async () => ({
					callTool: async (name, args) => {
						calls.push({ name, args });
						if (name === "list-specs") return { content: [{ type: "text", text: '[{"title":"Asaas"}]' }] };
						if (name === "search-endpoints") {
							return {
								content: [
									{
										type: "text",
										text: '[{"title":"Asaas","endpoints":[{"method":"POST","path":"/v3/customers","summary":"Criar novo cliente"}]}]',
									},
								],
							};
						}
						return {
							content: [{ type: "text", text: '[{"id":"guide-1","title":"Clientes","url":"https://docs.asaas.com"}]' }],
						};
					},
					close: async () => {
						closed = true;
					},
				}),
			},
		);
		expect(result.source).toBe("mcp");
		expect(calls).toEqual([
			{ name: "list-specs", args: {} },
			{ name: "search-endpoints", args: { title: "Asaas", pattern: "criar cliente" } },
			{ name: "search", args: { query: "criar cliente" } },
		]);
		expect(result.results.some((item) => item.text.includes("POST /v3/customers"))).toBe(true);
		expect(closed).toBe(true);
	});

	test("falls back to llms.txt only when MCP creation fails", async () => {
		const originalFetch = globalThis.fetch;
		const fetchedUrls: string[] = [];
		globalThis.fetch = async (url: string | URL | Request) => {
			fetchedUrls.push(String(url));
			return new Response("# Asaas API\n\n## Listar cobranças\nUse GET /payments.") as never;
		};
		try {
			const result = await queryAsaasDocs(
				{ query: "listar cobranças", limit: 3 },
				{
					createMcpSession: async () => {
						throw new Error("MCP unavailable");
					},
				},
			);
			expect(result.source).toBe("llms.txt");
			expect(result.results[0]?.text).toContain("GET /payments");
			expect(fetchedUrls).toEqual(["https://docs.asaas.com/llms.txt"]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("falls back to llms.txt when an MCP tool call fails", async () => {
		const originalFetch = globalThis.fetch;
		let closed = false;
		globalThis.fetch = async () => new Response("# Asaas API\n\n## Criar cliente\nUse POST /customers.") as never;
		try {
			const result = await queryAsaasDocs(
				{ query: "criar cliente", limit: 3 },
				{
					createMcpSession: async () => ({
						callTool: async () => {
							throw new Error("tool failed");
						},
						close: async () => {
							closed = true;
						},
					}),
				},
			);
			expect(result.source).toBe("llms.txt");
			expect(result.results[0]?.text).toContain("POST /customers");
			expect(closed).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
