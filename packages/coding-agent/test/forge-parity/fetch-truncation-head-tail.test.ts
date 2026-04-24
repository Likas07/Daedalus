import { describe, expect, it } from "vitest";
import { createFetchToolDefinition } from "../../src/core/tools/fetch.js";

function response(body: string, contentType = "text/plain"): Response {
	return new Response(body, {
		status: 200,
		headers: { "content-type": contentType },
	});
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((entry) => entry.text ?? "").join("\n");
}

describe("fetch prefix+suffix truncation", () => {
	it("shows the beginning and end of long fetched content with a middle marker", async () => {
		const body = Array.from({ length: 120 }, (_, index) => `Line ${index + 1}: ${"x".repeat(8)}`).join("\n");
		const tool = createFetchToolDefinition(process.cwd(), {
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response(body) },
		});

		const result = await tool.execute("fetch-lines", { url: "https://example.com" }, undefined, undefined, {} as any);
		const output = text(result);

		expect(result.details?.truncated).toBe(true);
		expect(output).toContain("Line 1");
		expect(output).toContain("Line 120");
		expect(output).toContain("[...");
		expect(output).toContain("truncated");
		expect(output).not.toContain("Line 60");
	});
});
