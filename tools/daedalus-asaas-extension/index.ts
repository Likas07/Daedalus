import { defineTool, type ExtensionAPI } from "@daedalus-pi/coding-agent";
import { callAsaasApi } from "./api-client";
import { resolveAsaasConfig, requireAsaasToken } from "./config";
import { queryAsaasDocs } from "./docs-client";
import { confirmAsaasMutation, normalizeAsaasPath } from "./guards";
import { redactSensitive } from "./redact";
import { asaasApiGetSchema, asaasApiMutateSchema, asaasDocsQuerySchema } from "./schemas";

function renderDocs(results: Awaited<ReturnType<typeof queryAsaasDocs>>) {
	if (results.results.length === 0) return `No Asaas docs results found from ${results.source}.`;
	return results.results
		.map((result, index) => `## ${index + 1}. ${result.title}\n${result.url ? `${result.url}\n` : ""}${result.text}`)
		.join("\n\n")
		.slice(0, 20_000);
}

interface RegisterAsaasExtensionDeps {
	queryDocs?: typeof queryAsaasDocs;
}

function createDocsTool(queryDocs: typeof queryAsaasDocs) {
	return defineTool({
		name: "mcp_asaas_docs_query",
		label: "Asaas Docs Query",
		description: "Search Asaas docs using the Asaas MCP server with llms.txt degraded fallback.",
		parameters: asaasDocsQuerySchema,
		async execute(_id, params, signal) {
			const result = await queryDocs({ ...params, signal });
			return { content: [{ type: "text", text: renderDocs(result) }], details: { source: result.source, count: result.results.length } };
		},
	});
}

const getTool = defineTool({
	name: "asaas_api_get",
	label: "Asaas API GET",
	description: "Perform a guarded authenticated GET request to a relative Asaas API path.",
	parameters: asaasApiGetSchema,
	async execute(_id, params, signal) {
		const config = resolveAsaasConfig();
		const result = await callAsaasApi(
			{ baseUrl: config.baseUrl, accessToken: requireAsaasToken(config) },
			{ method: "GET", path: params.path, query: params.query, signal },
		);
		return { content: [{ type: "text", text: JSON.stringify(redactSensitive(result.content), null, 2) }], details: result.details };
	},
});

const mutateTool = defineTool({
	name: "asaas_api_mutate",
	label: "Asaas API Mutate",
	description: "Prepare or execute a guarded Asaas mutation. Defaults to dry run.",
	parameters: asaasApiMutateSchema,
	async execute(_id, params, signal, _onUpdate, ctx) {
		const config = resolveAsaasConfig();
		const path = normalizeAsaasPath(params.path);
		const plan = redactSensitive({ method: params.method, path, query: params.query, body: params.body, dryRun: params.dryRun ?? true });
		const confirmation = await confirmAsaasMutation(ctx, {
			method: params.method,
			path,
			dryRun: params.dryRun,
			baseUrl: config.baseUrl,
		});
		if (confirmation.dryRun) {
			return { content: [{ type: "text", text: `Asaas mutation dry run:\n${JSON.stringify(plan, null, 2)}` }], details: plan };
		}
		const result = await callAsaasApi(
			{ baseUrl: config.baseUrl, accessToken: requireAsaasToken(config) },
			{ method: params.method, path, query: params.query, body: params.body, signal },
		);
		return { content: [{ type: "text", text: JSON.stringify(redactSensitive(result.content), null, 2) }], details: result.details };
	},
});

export default function registerAsaasExtension(pi: ExtensionAPI, deps: RegisterAsaasExtensionDeps = {}) {
	pi.registerTool(createDocsTool(deps.queryDocs ?? queryAsaasDocs));
	pi.registerTool(getTool);
	pi.registerTool(mutateTool);
	pi.on("resources_discover", async () => ({ skillPaths: [new URL("./asaas.md", import.meta.url).pathname] }));
	pi.registerCommand("asaas-status", {
		description: "Show Asaas extension configuration status without secrets.",
		handler: async (_args, ctx) => {
			const config = resolveAsaasConfig();
			ctx.ui.notify(
				`Asaas base URL: ${config.safeStatus.baseUrl}; token present: ${config.safeStatus.tokenPresent ? "yes" : "no"}`,
				"info",
			);
		},
	});
	pi.registerCommand("asaas-docs-refresh", {
		description: "Clear Asaas docs cache.",
		handler: async (_args, ctx) => ctx.ui.notify("Asaas docs cache cleared or will refresh on next request.", "info"),
	});
}
