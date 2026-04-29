import { describe, expect, test } from "bun:test";
import { createAsaasMcpSession } from "./mcp-client";

describe("asaas MCP client", () => {
	test("connects with Streamable HTTP and calls tools through MCP", async () => {
		const calls: Array<string> = [];
		const session = await createAsaasMcpSession({
			createTransport: (url) => {
				calls.push(`transport:${url.toString()}`);
				return { close: async () => calls.push("transport.close") };
			},
			createClient: () => ({
				connect: async () => calls.push("client.connect"),
				callTool: async ({ name }: { name: string }) => {
					calls.push(`tool:${name}`);
					return { content: [{ type: "text", text: name === "list-specs" ? '[{"title":"Asaas"}]' : "[]" }] };
				},
				close: async () => calls.push("client.close"),
			}),
		});
		await session.callTool("list-specs", {});
		await session.close();
		expect(calls).toEqual([
			"transport:https://docs.asaas.com/mcp",
			"client.connect",
			"tool:list-specs",
			"client.close",
			"transport.close",
		]);
	});

	test("closes resources if connect fails", async () => {
		const calls: Array<string> = [];
		await expect(
			createAsaasMcpSession({
				createTransport: () => ({ close: async () => calls.push("transport.close") }),
				createClient: () => ({
					connect: async () => {
						calls.push("client.connect");
						throw new Error("connect failed");
					},
					callTool: async () => ({ content: [] }),
					close: async () => calls.push("client.close"),
				}),
			}),
		).rejects.toThrow("connect failed");
		expect(calls).toEqual(["client.connect", "client.close", "transport.close"]);
	});
});
