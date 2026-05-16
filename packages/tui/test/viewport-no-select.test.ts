import { describe, expect, it } from "bun:test";
import { Viewport } from "../src/components/viewport.js";
import type { RenderedLine } from "../src/render-metadata.js";
import { extractSelectedText } from "../src/selection.js";
import type { Component } from "../src/tui.js";

class LinesComponent implements Component {
	constructor(private readonly lines: string[]) {}

	render(_width: number): string[] {
		return this.lines;
	}

	invalidate(): void {}
}

class MetadataLinesComponent implements Component {
	constructor(private readonly lines: RenderedLine[]) {}

	render(_width: number): string[] {
		return this.lines.map((line) => line.text);
	}

	renderWithMetadata(_width: number): RenderedLine[] {
		return this.lines;
	}

	invalidate(): void {}
}

describe("Viewport noSelect metadata", () => {
	it("marks generated empty viewport rows as noSelect across the viewport width", () => {
		const viewport = new Viewport(new LinesComponent(["one"]), 3);

		const rendered = viewport.renderWithMetadata(5);

		expect(rendered.map((line) => line.text)).toEqual(viewport.render(5));
		expect(rendered[0]?.noSelect).toBeUndefined();
		expect(rendered[1]).toEqual({ text: "", noSelect: [true, true, true, true, true] });
		expect(rendered[2]).toEqual({ text: "", noSelect: [true, true, true, true, true] });
	});

	it("marks scrollbar padding and scrollbar cells as noSelect without changing rendered text", () => {
		const viewport = new Viewport(new LinesComponent(["a", "bc", "def", "ghij"]), 3);
		viewport.setShowScrollbar(true);
		viewport.scrollToTop();

		const rendered = viewport.renderWithMetadata(6);

		expect(rendered.map((line) => line.text)).toEqual(viewport.render(6));
		expect(rendered[0]?.noSelect).toEqual([false, true, true, true, true, true]);
		expect(rendered[1]?.noSelect).toEqual([false, false, true, true, true, true]);
		expect(rendered[2]?.noSelect).toEqual([false, false, false, true, true, true]);
	});

	it("preserves child noSelect metadata while adding viewport-generated noSelect cells", () => {
		const viewport = new Viewport(
			new MetadataLinesComponent([{ text: "abc", noSelect: [false, true, false] }, { text: "z" }]),
			3,
		);
		viewport.setShowScrollbar(true);

		const rendered = viewport.renderWithMetadata(5);

		expect(rendered.map((line) => line.text)).toEqual(viewport.render(5));
		expect(rendered[0]?.noSelect).toEqual([false, true, false, true, true]);
		expect(rendered[1]?.noSelect).toEqual([false, true, true, true, true]);
		expect(rendered[2]?.noSelect).toEqual([true, true, true, true, true]);
	});

	it("copies child text without generated padding or scrollbar glyphs when selected through the right edge", () => {
		const viewport = new Viewport(new LinesComponent(["abc", "def", "ghi", "jkl"]), 3);
		viewport.setShowScrollbar(true);
		viewport.scrollToTop();

		const rendered = viewport.renderWithMetadata(8);
		const copied = extractSelectedText(rendered, { start: { row: 0, col: 0 }, end: { row: 0, col: 8 } });

		expect(rendered[0]?.text).not.toBe("abc");
		expect(copied).toBe("abc");
	});
});
