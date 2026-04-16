import { describe, expect, test } from "vitest";
import { computeFileLists, createFileOps, extractFileOpsFromMessage } from "../src/core/compaction/utils.js";
import { TEMPLATE_JS } from "../src/core/export-html/template.generated.js";

describe("hashline integration gaps", () => {
	test("tracks hashline_edit as a modified file for compaction summaries", () => {
		const fileOps = createFileOps();
		extractFileOpsFromMessage(
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tool-1",
						name: "hashline_edit",
						arguments: { path: "src/file.ts", edits: [] },
					},
				],
			} as any,
			fileOps,
		);

		const { readFiles, modifiedFiles } = computeFileLists(fileOps);
		expect(readFiles).toEqual([]);
		expect(modifiedFiles).toEqual(["src/file.ts"]);
	});

	test("generated export template includes hashline_edit rendering", () => {
		expect(TEMPLATE_JS).toContain("case 'hashline_edit':");
		expect(TEMPLATE_JS).toContain("[${name}:");
	});
});
