import { describe, expect, it } from "bun:test";
import {
	cloneRenderedLine,
	ensureNoSelectWidth,
	markNoSelectColumns,
	type RenderedLine,
	renderComponentWithMetadata,
	renderedLineText,
	toRenderedLine,
} from "../src/render-metadata.js";
import type { Component } from "../src/tui.js";
import { Container } from "../src/tui.js";

class StringComponent implements Component {
	render(width: number): string[] {
		return [`plain:${width}`];
	}

	invalidate(): void {}
}

class MetadataComponent implements Component {
	render(_width: number): string[] {
		return ["fallback"];
	}

	renderWithMetadata(width: number): RenderedLine[] {
		return [{ text: `metadata:${width}`, noSelect: [true, false] }];
	}

	invalidate(): void {}
}

describe("render metadata primitives", () => {
	it("converts strings to rendered lines without changing text", () => {
		expect(toRenderedLine("hello")).toEqual({ text: "hello" });
		expect(renderedLineText({ text: "hello", noSelect: [true] })).toBe("hello");
	});

	it("clones rendered line metadata defensively", () => {
		const original: RenderedLine = { text: "abc", noSelect: [true, false, true] };
		const clone = cloneRenderedLine(original);
		clone.noSelect?.fill(false);

		expect(original.noSelect).toEqual([true, false, true]);
		expect(clone).toEqual({ text: "abc", noSelect: [false, false, false] });
	});

	it("ensures and marks no-select metadata by display columns", () => {
		const line = toRenderedLine("abcdef");
		ensureNoSelectWidth(line, 3);
		markNoSelectColumns(line, 1, 4);

		expect(line.noSelect).toEqual([false, true, true, true]);
	});

	it("prefers renderWithMetadata while preserving string render fallback", () => {
		expect(renderComponentWithMetadata(new StringComponent(), 7)).toEqual([{ text: "plain:7" }]);
		expect(renderComponentWithMetadata(new MetadataComponent(), 8)).toEqual([
			{ text: "metadata:8", noSelect: [true, false] },
		]);
	});

	it("container renders child metadata without changing string render behavior", () => {
		const container = new Container();
		container.addChild(new StringComponent());
		container.addChild(new MetadataComponent());

		expect(container.render(5)).toEqual(["plain:5", "fallback"]);
		expect(container.renderWithMetadata(5)).toEqual([
			{ text: "plain:5" },
			{ text: "metadata:5", noSelect: [true, false] },
		]);
	});
});
