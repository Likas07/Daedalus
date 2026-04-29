import { describe, expect, test } from "bun:test";
import registerAsaasExtension from "./index";

export function createFakePi() {
	const tools: Array<{ name: string; execute?: Function }> = [];
	const commands: Array<{ name: string; description?: string }> = [];
	const handlers: Record<string, Function> = {};
	return {
		tools,
		commands,
		handlers,
		pi: {
			registerTool(tool: { name: string; execute?: Function }) {
				tools.push(tool);
			},
			registerCommand(name: string, command: { description?: string }) {
				commands.push({ name, description: command.description });
			},
			on(name: string, handler: Function) {
				handlers[name] = handler;
			},
		},
	};
}

describe("asaas extension registration", () => {
	test("registers docs, get, mutate tools and status commands", () => {
		const fake = createFakePi();
		registerAsaasExtension(fake.pi as never);
		expect(fake.tools.map((tool) => tool.name).sort()).toEqual([
			"asaas_api_get",
			"asaas_api_mutate",
			"mcp_asaas_docs_query",
		]);
		expect(fake.commands.map((command) => command.name).sort()).toEqual(["asaas-docs-refresh", "asaas-status"]);
	});

	test("docs tool reports MCP source and renders MCP results", async () => {
		const fake = createFakePi();
		registerAsaasExtension(fake.pi as never, {
			queryDocs: async () => ({
				source: "mcp",
				results: [{ title: "POST /v3/customers", text: "POST /v3/customers\nCriar novo cliente" }],
			}),
		});
		const docs = fake.tools.find((tool) => tool.name === "mcp_asaas_docs_query") as any;
		const result = await docs.execute("tool-call", { query: "criar cliente", limit: 3 });
		expect(result.details.source).toBe("mcp");
		expect(result.details.count).toBe(1);
		expect(result.content[0].text).toContain("POST /v3/customers");
	});

	test("mutate tool defaults to dry run and does not call fetch", async () => {
		const fake = createFakePi();
		registerAsaasExtension(fake.pi as never);
		const mutate = fake.tools.find((tool) => tool.name === "asaas_api_mutate") as any;
		let fetchCalled = false;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			fetchCalled = true;
			return Response.json({});
		};
		try {
			const result = await mutate.execute(
				"tool-call",
				{ method: "POST", path: "/customers", body: { name: "Test" } },
				undefined,
				undefined,
				{ hasUI: false, ui: {} },
			);
			expect(fetchCalled).toBe(false);
			expect(JSON.stringify(result.details)).toContain("dryRun");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("discovers Asaas guidance resource", async () => {
		const fake = createFakePi();
		registerAsaasExtension(fake.pi as never);
		const result = await fake.handlers.resources_discover?.({ type: "resources_discover", cwd: process.cwd(), reason: "startup" }, {});
		expect(result.skillPaths[0]).toContain("tools/daedalus-asaas-extension/asaas.md");
	});
});
