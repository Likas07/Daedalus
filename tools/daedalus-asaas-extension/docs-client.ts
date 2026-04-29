import { createAsaasMcpSession, getTextContent, type AsaasMcpSession, type McpCallResult } from "./mcp-client";

export interface DocsQueryInput {
	query: string;
	branch?: string;
	limit?: number;
	signal?: AbortSignal;
}
export interface DocsQueryResult {
	source: "mcp" | "llms.txt";
	results: Array<{ title: string; text: string; url?: string }>;
}

export interface DocsQueryDeps {
	createMcpSession?: () => Promise<AsaasMcpSession>;
}

const LLMS_URL = "https://docs.asaas.com/llms.txt";
const MAX_TEXT = 20_000;

export async function queryAsaasDocs(input: DocsQueryInput, deps: DocsQueryDeps = {}): Promise<DocsQueryResult> {
	try {
		return await queryAsaasMcp(input, deps.createMcpSession ?? createAsaasMcpSession);
	} catch {
		const response = await fetch(LLMS_URL, { signal: input.signal });
		if (!response.ok) throw new Error(`Failed to fetch Asaas llms.txt: ${response.status}`);
		return searchLlmsText((await response.text()).slice(0, MAX_TEXT), input.query, input.limit ?? 5);
	}
}

async function queryAsaasMcp(input: DocsQueryInput, createSession: () => Promise<AsaasMcpSession>): Promise<DocsQueryResult> {
	const session = await createSession();
	try {
		const specTitle = await selectAsaasSpecTitle(session);
		const endpointResult = await session.callTool("search-endpoints", { title: specTitle, pattern: input.query });
		const guideResult = await session.callTool("search", { query: input.query });
		const results = [...formatEndpointResults(endpointResult), ...formatGuideResults(guideResult)].slice(0, input.limit ?? 5);
		return { source: "mcp", results };
	} finally {
		await session.close();
	}
}

async function selectAsaasSpecTitle(session: AsaasMcpSession): Promise<string> {
	const specs = parseFirstJsonArray(await session.callTool("list-specs", {}));
	const preferred =
		findObjectWithString(specs, "title", "Asaas") ??
		specs.find((spec) => typeof spec?.title === "string" && spec.title.startsWith("Asaas"));
	return preferred?.title ?? "Asaas";
}

function findObjectWithString(items: Array<Record<string, unknown>>, key: string, value: string) {
	return items.find((item) => item[key] === value);
}

function formatEndpointResults(result: McpCallResult): DocsQueryResult["results"] {
	const parsed = parseJsonValues(result);
	const results: DocsQueryResult["results"] = [];
	for (const item of parsed) {
		if (!isRecord(item)) continue;
		const endpoints = Array.isArray(item.endpoints) ? item.endpoints : [item];
		for (const endpoint of endpoints) {
			if (!isRecord(endpoint)) continue;
			const method = stringValue(endpoint.method);
			const path = stringValue(endpoint.path);
			const summary = stringValue(endpoint.summary) ?? stringValue(endpoint.description) ?? stringValue(endpoint.title);
			const url = stringValue(endpoint.url);
			if (!method && !path && !summary) continue;
			const title = [method, path].filter(Boolean).join(" ") || summary || "Asaas endpoint";
			const lines = [[method, path].filter(Boolean).join(" "), summary].filter(Boolean);
			results.push({ title, text: lines.join("\n"), url });
		}
	}
	if (results.length > 0) return results;
	return getTextContent(result).map((text) => ({ title: "Asaas endpoint result", text }));
}

function formatGuideResults(result: McpCallResult): DocsQueryResult["results"] {
	const parsed = parseJsonValues(result);
	const results: DocsQueryResult["results"] = [];
	for (const item of parsed) {
		if (!isRecord(item)) continue;
		const title = stringValue(item.title) ?? stringValue(item.id) ?? "Asaas docs";
		const text = stringValue(item.text) ?? stringValue(item.content) ?? stringValue(item.summary) ?? stringValue(item.description) ?? title;
		results.push({ title, text, url: stringValue(item.url) });
	}
	if (results.length > 0) return results;
	return getTextContent(result).map((text) => ({ title: "Asaas docs", text }));
}

function parseFirstJsonArray(result: McpCallResult): Array<Record<string, unknown>> {
	return parseJsonValues(result).filter(isRecord);
}

function parseJsonValues(result: McpCallResult): unknown[] {
	const values: unknown[] = [];
	for (const text of getTextContent(result)) {
		try {
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed)) values.push(...parsed);
			else values.push(parsed);
		} catch {
			// Non-JSON MCP text content is formatted by the callers as plain text.
		}
	}
	return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function searchLlmsText(text: string, query: string, limit: number): DocsQueryResult {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	const chunks = text
		.split(/\n(?=#+\s+)/g)
		.map((chunk) => chunk.trim())
		.filter(Boolean);
	const results = chunks
		.map((chunk) => ({ chunk, score: terms.filter((term) => chunk.toLowerCase().includes(term)).length }))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ chunk }) => ({ title: chunk.split("\n")[0]?.replace(/^#+\s*/, "") || "Asaas docs", text: chunk }));
	return { source: "llms.txt", results };
}
