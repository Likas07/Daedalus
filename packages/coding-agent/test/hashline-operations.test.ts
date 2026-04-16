import { describe, expect, test } from "vitest";
import {
	applyHashlineEditsToNormalizedContent,
	formatLineTag,
	type HashlineEditOperation,
	parseTag,
} from "../src/core/tools/hashline/index.js";

function tag(line: number, content: string) {
	return parseTag(formatLineTag(line, content));
}

describe("hashline edit operations", () => {
	test("replaces single line", () => {
		const result = applyHashlineEditsToNormalizedContent(
			"aaa\nbbb\nccc",
			[{ op: "replace_line", pos: tag(2, "bbb"), lines: ["BBB"] }],
			"file.txt",
		);
		expect(result.newContent).toBe("aaa\nBBB\nccc");
		expect(result.firstChangedLine).toBe(2);
	});

	test("replaces range and appends in one snapshot", () => {
		const edits: HashlineEditOperation[] = [
			{ op: "replace_range", pos: tag(2, "two"), end: tag(3, "three"), lines: ["TWO_THREE"] },
			{ op: "append_at", pos: tag(5, "five"), lines: ["after five"] },
		];
		const result = applyHashlineEditsToNormalizedContent("one\ntwo\nthree\nfour\nfive", edits, "file.txt");
		expect(result.newContent).toBe("one\nTWO_THREE\nfour\nfive\nafter five");
	});

	test("supports prepend and append at file boundaries", () => {
		const result = applyHashlineEditsToNormalizedContent(
			"aaa\nbbb",
			[
				{ op: "prepend_file", lines: ["start"] },
				{ op: "append_file", lines: ["end"] },
			],
			"file.txt",
		);
		expect(result.newContent).toBe("start\naaa\nbbb\nend");
	});

	test("rejects overlapping replaces", () => {
		expect(() =>
			applyHashlineEditsToNormalizedContent(
				"one\ntwo\nthree",
				[
					{ op: "replace_range", pos: tag(1, "one"), end: tag(2, "two"), lines: ["ONE", "TWO"] },
					{ op: "replace_range", pos: tag(2, "two"), end: tag(3, "three"), lines: ["TWO", "THREE"] },
				],
				"file.txt",
			),
		).toThrow(/overlap/);
	});

	test("rejects insert anchored inside replaced range", () => {
		expect(() =>
			applyHashlineEditsToNormalizedContent(
				"one\ntwo\nthree",
				[
					{ op: "replace_range", pos: tag(1, "one"), end: tag(2, "two"), lines: ["ONE_TWO"] },
					{ op: "append_at", pos: tag(2, "two"), lines: ["after two"] },
				],
				"file.txt",
			),
		).toThrow(/inside replacement range/);
	});

	test("warns on likely boundary duplication", () => {
		const result = applyHashlineEditsToNormalizedContent(
			"if (ok) {\n  run();\n}\nafter();",
			[
				{
					op: "replace_range",
					pos: tag(1, "if (ok) {"),
					end: tag(2, "  run();"),
					lines: ["if (ok) {", "  runSafe();", "}"],
				},
			],
			"file.txt",
		);
		expect(result.warnings?.[0]).toContain("Possible boundary duplication");
	});

	test("tracks no-op edits", () => {
		const result = applyHashlineEditsToNormalizedContent(
			"aaa\nbbb",
			[{ op: "replace_line", pos: tag(2, "bbb"), lines: ["bbb"] }],
			"file.txt",
		);
		expect(result.newContent).toBe("aaa\nbbb");
		expect(result.noopEdits).toHaveLength(1);
	});
});
