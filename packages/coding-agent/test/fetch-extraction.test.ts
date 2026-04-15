import { describe, expect, test } from "vitest";
import { extractFetchedText } from "../src/core/tools/fetch/index.js";

describe("fetch extraction", () => {
	test("extracts readable text from html", () => {
		const html = `<!doctype html><html><head><title>Docs</title></head><body><main><h1>Hello</h1><p>World <a href="https://example.com">link</a></p></main></body></html>`;
		const result = extractFetchedText(html, "text/html", { maxChars: 10_000 });
		expect(result.text).toContain("Docs");
		expect(result.text).toContain("Hello");
		expect(result.text).toContain("[link](https://example.com)");
	});

	test("truncates oversized output", () => {
		const result = extractFetchedText("x".repeat(2000), "text/plain", { maxChars: 500 });
		expect(result.truncated).toBe(true);
		expect(result.text).toContain("[Truncated: output exceeded 500 chars]");
	});
});
