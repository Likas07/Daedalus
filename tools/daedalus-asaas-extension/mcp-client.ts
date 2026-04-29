import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const ASAAS_MCP_URL = "https://docs.asaas.com/mcp";

type MaybePromise<T> = T | Promise<T>;

export type McpCallResult = { content?: Array<{ type?: string; text?: string }> };

type McpClientLike = {
	connect(transport: unknown): Promise<void>;
	callTool(input: { name: string; arguments?: Record<string, unknown> }): Promise<McpCallResult>;
	close(): MaybePromise<void>;
};

type McpTransportLike = { close(): MaybePromise<void> };

export interface AsaasMcpSession {
	callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
	close(): Promise<void>;
}

export interface AsaasMcpDependencies {
	createClient?: () => McpClientLike;
	createTransport?: (url: URL) => McpTransportLike;
}

export async function createAsaasMcpSession(deps: AsaasMcpDependencies = {}): Promise<AsaasMcpSession> {
	const transport = deps.createTransport?.(new URL(ASAAS_MCP_URL)) ?? new StreamableHTTPClientTransport(new URL(ASAAS_MCP_URL));
	const client = (deps.createClient?.() ??
		new Client({ name: "daedalus-asaas-extension", version: "0.1.0" }, { capabilities: {} })) as McpClientLike;
	try {
		await client.connect(transport);
	} catch (error) {
		await safeClose(client);
		await safeClose(transport);
		throw error;
	}
	let closed = false;
	return {
		callTool: (name, args) => client.callTool({ name, arguments: args }),
		async close() {
			if (closed) return;
			closed = true;
			await safeClose(client);
			await safeClose(transport);
		},
	};
}

async function safeClose(resource: { close(): MaybePromise<void> }) {
	try {
		await resource.close();
	} catch {
		// Ignore cleanup errors.
	}
}

export function getTextContent(result: McpCallResult): string[] {
	return (result.content ?? [])
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text as string);
}
