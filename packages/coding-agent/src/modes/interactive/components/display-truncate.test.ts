import { describe, expect, test } from "bun:test";
import { truncateDisplayText, truncateForDisplayOnly } from "./display-truncate.js";

const defaultOptions = {
	collapsedLines: 3,
	expandedLines: 10,
};

describe("truncateForDisplayOnly", () => {
	test("returns unmodified display text and metadata when within collapsed limit", () => {
		const result = truncateForDisplayOnly("alpha\nbeta", defaultOptions);

		expect(result).toEqual({
			text: "alpha\nbeta",
			truncated: false,
			omittedLines: 0,
			limit: 3,
		});
	});

	test("truncates deterministically by newline-separated lines in collapsed state", () => {
		const result = truncateForDisplayOnly("one\ntwo\nthree\nfour", {
			collapsedLines: 2,
			expandedLines: 4,
		});

		expect(result.text).toBe(
			"one\ntwo\n[Display-only truncation: 2 lines omitted. Full content remains available to the model/tool result.]",
		);
		expect(result.omittedLines).toBe(2);
		expect(result.limit).toBe(2);
		expect(result.truncated).toBe(true);
	});

	test("uses expanded limit when expanded", () => {
		const result = truncateForDisplayOnly("one\ntwo\nthree\nfour", {
			collapsedLines: 1,
			expandedLines: 3,
			expanded: true,
		});

		expect(result.limit).toBe(3);
		expect(result.text).toBe(
			"one\ntwo\nthree\n[Display-only truncation: 1 lines omitted. Full content remains available to the model/tool result.]",
		);
		expect(result.omittedLines).toBe(1);
		expect(result.truncated).toBe(true);
	});

	test("preserves empty newline-separated lines", () => {
		const result = truncateForDisplayOnly("first\n\nthird\n", {
			collapsedLines: 4,
			expandedLines: 4,
		});

		expect(result.text).toBe("first\n\nthird\n");
		expect(result.omittedLines).toBe(0);
		expect(result.truncated).toBe(false);
	});

	test("normalizes invalid and fractional limits without mutating source text", () => {
		const text = "one\ntwo\nthree";
		const zeroLimit = truncateForDisplayOnly(text, {
			collapsedLines: -1,
			expandedLines: 10,
		});
		const fractionalLimit = truncateForDisplayOnly(text, {
			collapsedLines: 10,
			expandedLines: 2.8,
			expanded: true,
		});

		expect(zeroLimit.limit).toBe(0);
		expect(zeroLimit.text).toBe(
			"[Display-only truncation: 3 lines omitted. Full content remains available to the model/tool result.]",
		);
		expect(zeroLimit.omittedLines).toBe(3);
		expect(zeroLimit.truncated).toBe(true);

		expect(fractionalLimit.limit).toBe(2);
		expect(fractionalLimit.text).toBe(
			"one\ntwo\n[Display-only truncation: 1 lines omitted. Full content remains available to the model/tool result.]",
		);
		expect(text).toBe("one\ntwo\nthree");
	});

	test("treats empty text as no display lines", () => {
		const result = truncateForDisplayOnly("", defaultOptions);

		expect(result).toEqual({
			text: "",
			truncated: false,
			omittedLines: 0,
			limit: 3,
		});
	});

	test("uses custom label and omitted label in the display-only notice", () => {
		const result = truncateForDisplayOnly("a\nb\nc", {
			collapsedLines: 1,
			expandedLines: 3,
			label: "tool output",
			omittedLabel: "hidden display lines",
		});

		expect(result.text).toBe(
			"a\n[Display-only truncation: tool output: 2 hidden display lines. Full content remains available to the model/tool result.]",
		);
	});
});

describe("truncateDisplayText", () => {
	test("keeps compatibility metadata while using display-only notice text", () => {
		const result = truncateDisplayText({
			text: "one\ntwo\nthree",
			collapsedLineBudget: 2,
			expandedLineBudget: 10,
		});

		expect(result.state).toBe("collapsed");
		expect(result.lineBudget).toBe(2);
		expect(result.lines).toEqual(["one", "two"]);
		expect(result.text).toBe(
			"one\ntwo\n[Display-only truncation: 1 lines omitted. Full content remains available to the model/tool result.]",
		);
		expect(result.totalLineCount).toBe(3);
		expect(result.displayedLineCount).toBe(2);
		expect(result.hiddenLineCount).toBe(1);
		expect(result.truncated).toBe(true);
	});
});

describe("foldHeadTailForDisplayOnly", () => {
	test("keeps short content unchanged", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const result = foldHeadTailForDisplayOnly("one\ntwo", { lineBudget: 3 });

		expect(result.text).toBe("one\ntwo");
		expect(result.truncated).toBe(false);
		expect(result.hiddenLineCount).toBe(0);
	});

	test("keeps exact budget content unchanged", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const result = foldHeadTailForDisplayOnly("one\ntwo\nthree", { lineBudget: 3 });

		expect(result.text).toBe("one\ntwo\nthree");
		expect(result.truncated).toBe(false);
	});

	test("folds middle content with head and tail context", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const result = foldHeadTailForDisplayOnly("one\ntwo\nthree\nfour\nfive", { lineBudget: 4 });

		expect(result.text).toBe(
			"one\ntwo\n… +1 lines (expand or open reader/export/editor for full content)\nfour\nfive",
		);
		expect(result.hiddenLineCount).toBe(1);
		expect(result.displayedLineCount).toBe(4);
		expect(result.truncated).toBe(true);
	});

	test("allocates odd budgets toward the head by default", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const result = foldHeadTailForDisplayOnly("one\ntwo\nthree\nfour\nfive\nsix", { lineBudget: 3 });

		expect(result.text).toBe("one\ntwo\n… +3 lines (expand or open reader/export/editor for full content)\nsix");
	});

	test("treats empty text as no display lines", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const result = foldHeadTailForDisplayOnly("", { lineBudget: 3 });

		expect(result.text).toBe("");
		expect(result.totalLineCount).toBe(0);
		expect(result.truncated).toBe(false);
	});

	test("does not mutate source text", async () => {
		const { foldHeadTailForDisplayOnly } = await import("./display-truncate.js");
		const text = "one\ntwo\nthree\nfour";
		foldHeadTailForDisplayOnly(text, { lineBudget: 2 });

		expect(text).toBe("one\ntwo\nthree\nfour");
	});
});
