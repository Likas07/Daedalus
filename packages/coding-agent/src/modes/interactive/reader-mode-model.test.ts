import { describe, expect, test } from "bun:test";
import {
	createReaderModel,
	findReaderSearchMatches,
	nextReaderAnchor,
	nextReaderSearchMatch,
} from "./reader-mode-model.js";

describe("reader mode model", () => {
	test("models transcript and response lines", () => {
		const model = createReaderModel({ transcript: "# Chat\nhello", response: "## Answer\nworld" });
		expect(model.lines.map((line) => line.text)).toEqual(["# Chat", "hello", "", "## Answer", "world"]);
		expect(model.headings.map((heading) => [heading.lineIndex, heading.level, heading.label])).toEqual([
			[0, 1, "Chat"],
			[3, 2, "Answer"],
		]);
	});

	test("extracts message-role jump anchors", () => {
		const model = createReaderModel({
			messages: [
				{ role: "user", content: "question" },
				{ role: "assistant", content: "answer" },
			],
		});
		expect(model.messageAnchors.map((anchor) => [anchor.lineIndex, anchor.role, anchor.label])).toEqual([
			[0, "user", "user"],
			[3, "assistant", "assistant"],
		]);
	});

	test("finds next and previous search results with wraparound", () => {
		const model = createReaderModel({ transcript: "alpha\nbeta\nAlpha again" });
		const matches = findReaderSearchMatches(model, "alpha");
		expect(matches.map((match) => match.lineIndex)).toEqual([0, 2]);
		expect(nextReaderSearchMatch(matches, 0, 1)?.lineIndex).toBe(2);
		expect(nextReaderSearchMatch(matches, 2, 1)?.lineIndex).toBe(0);
		expect(nextReaderSearchMatch(matches, 2, -1)?.lineIndex).toBe(0);
	});

	test("empty query returns no matches", () => {
		const model = createReaderModel({ transcript: "alpha" });
		expect(findReaderSearchMatches(model, "")).toEqual([]);
	});

	test("preserves expand all flag", () => {
		expect(createReaderModel({ transcript: "x", expandAll: true }).expandAll).toBe(true);
	});

	test("keeps stable indices when content changes", () => {
		const before = createReaderModel({ transcript: "one\ntwo" });
		const after = createReaderModel({ transcript: "zero\none\ntwo" });
		expect(before.lines.map((line) => line.index)).toEqual([0, 1]);
		expect(after.lines.map((line) => line.index)).toEqual([0, 1, 2]);
	});

	test("jumps headings forward and backward", () => {
		const model = createReaderModel({ transcript: "# A\nbody\n## B" });
		expect(nextReaderAnchor(model.headings, 0, 1)?.label).toBe("B");
		expect(nextReaderAnchor(model.headings, 2, 1)?.label).toBe("A");
		expect(nextReaderAnchor(model.headings, 2, -1)?.label).toBe("A");
	});
});
