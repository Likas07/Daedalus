import { createServer } from "http";
import { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFetchTool } from "../src/core/tools/fetch.js";

function getTextOutput(result: any): string {
	return result.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") || "";
}

describe("fetch tool", () => {
	let server: ReturnType<typeof createServer>;
	let baseUrl: string;

	beforeEach(async () => {
		server = createServer((req, res) => {
			if (req.url === "/html") {
				res.writeHead(200, { "content-type": "text/html" });
				res.end("<html><head><title>T</title></head><body><main><h1>Hello</h1><p>World</p></main></body></html>");
				return;
			}
			if (req.url === "/json") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end('{"ok":true}');
				return;
			}
			res.writeHead(200, { "content-type": "application/octet-stream" });
			res.end(Buffer.from([1, 2, 3]));
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterEach(async () => {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	});

	test("fetches html and returns cleaned text", async () => {
		const tool = createFetchTool(process.cwd());
		const result = await tool.execute("call-1", { url: `${baseUrl}/html` });
		expect(getTextOutput(result)).toContain("Hello");
		expect(result.details?.contentType).toBe("text/html");
	});

	test("rejects unsupported binary content", async () => {
		const tool = createFetchTool(process.cwd());
		await expect(tool.execute("call-2", { url: `${baseUrl}/bin` })).rejects.toThrow(/Unsupported content type/);
	});
});
