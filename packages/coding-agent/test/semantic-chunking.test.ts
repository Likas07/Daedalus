import { describe, expect, it } from "vitest";
import { chunkDocument } from "../src/extensions/daedalus/tools/semantic-chunking.js";

describe("semantic chunking", () => {
	it("uses smaller overlap by default", () => {
		const content = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`).join("\n");
		const chunks = chunkDocument("src/app.ts", content);
		expect(chunks.length).toBeLessThanOrEqual(3);
	});

	it("uses no overlap for data-like files", () => {
		const content = Array.from({ length: 200 }, (_, index) => `{"line":${index + 1}}`).join("\n");
		const chunks = chunkDocument("src/data.json", content);
		expect(chunks[1]?.startLine).toBe(101);
	});
});
