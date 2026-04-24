import { describe, expect, test } from "vitest";
import { buildCompactHashlineDiffPreview } from "../src/core/tools/hashline/index.js";

describe("compact hashline diff preview", () => {
	test("counts additions and deletions and includes changed lines", () => {
		const preview = buildCompactHashlineDiffPreview("  1|alpha\n- 2|beta\n+ 2|BETA\n  3|gamma");
		expect(preview.addedLines).toBe(1);
		expect(preview.removedLines).toBe(1);
		expect(preview.preview).toContain("BETA");
	});

	test("caps long preview output", () => {
		const diff = Array.from({ length: 40 }, (_, i) => `+ ${i + 1}|line ${i + 1}`).join("\n");
		const preview = buildCompactHashlineDiffPreview(diff, { maxOutputLines: 8, maxAdditionRun: 3 });
		expect(preview.preview.split("\n").length).toBeLessThanOrEqual(9);
		expect(preview.preview).toContain("more");
	});
});
