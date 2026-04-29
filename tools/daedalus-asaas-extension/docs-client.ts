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

const MCP_URL = "https://docs.asaas.com/mcp";
const LLMS_URL = "https://docs.asaas.com/llms.txt";
const MAX_TEXT = 20_000;

export async function queryAsaasDocs(input: DocsQueryInput): Promise<DocsQueryResult> {
	try {
		const url = new URL(MCP_URL);
		if (input.branch) url.searchParams.set("branch", input.branch);
		url.searchParams.set("q", input.query);
		const response = await fetch(url, { signal: input.signal });
		if (response.ok) {
			const text = (await response.text()).slice(0, MAX_TEXT);
			if (!isNonDocsMcpHttpResponse(text)) {
				return { source: "mcp", results: [{ title: "Asaas MCP result", text }] };
			}
		}
	} catch {}
	const response = await fetch(LLMS_URL, { signal: input.signal });
	if (!response.ok) throw new Error(`Failed to fetch Asaas llms.txt: ${response.status}`);
	return searchLlmsText((await response.text()).slice(0, MAX_TEXT), input.query, input.limit ?? 5);
}

function isNonDocsMcpHttpResponse(text: string): boolean {
	return text.trim().toLowerCase() === "this url can only be accessed with a mcp client.";
}

export function searchLlmsText(text: string, query: string, limit: number): DocsQueryResult {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	const chunks = text.split(/\n(?=#+\s+)/g).map((chunk) => chunk.trim()).filter(Boolean);
	const results = chunks
		.map((chunk) => ({ chunk, score: terms.filter((term) => chunk.toLowerCase().includes(term)).length }))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ chunk }) => ({ title: chunk.split("\n")[0]?.replace(/^#+\s*/, "") || "Asaas docs", text: chunk }));
	return { source: "llms.txt", results };
}
