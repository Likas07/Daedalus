import { describe, expect, it } from "bun:test";
import type { RenderedLine } from "../src/render-metadata.js";
import { extractSelectedText, parseSgrMouse, SelectionState } from "../src/selection.js";

describe("selection", () => {
	it("parses SGR mouse button, drag, release, and wheel events", () => {
		expect(parseSgrMouse("\x1b[<0;3;2M")).toEqual({ button: 0, col: 2, row: 1, type: "press", wheel: null });
		expect(parseSgrMouse("\x1b[<32;5;4M")?.button).toBe(32);
		expect(parseSgrMouse("\x1b[<0;5;4m")?.type).toBe("release");
		expect(parseSgrMouse("\x1b[<64;1;1M")?.wheel).toBe("up");
		expect(parseSgrMouse("not mouse")).toBeNull();
	});

	it("normalizes reversed drag ranges", () => {
		const state = new SelectionState();
		state.start({ row: 2, col: 5 });
		state.update({ row: 1, col: 3 });
		expect(state.range).toEqual({ start: { row: 1, col: 3 }, end: { row: 2, col: 5 } });
	});

	it("extracts selected text while skipping noSelect columns", () => {
		const lines: RenderedLine[] = [
			{ text: "alpha" },
			{ text: "012345", noSelect: [false, true, true, false, false, false] },
			{ text: "omega" },
		];
		const text = extractSelectedText(lines, { start: { row: 0, col: 2 }, end: { row: 2, col: 2 } });
		expect(text).toBe("pha\n0345\nom");
	});

	it("joins soft-wrapped visual rows while preserving real line breaks", () => {
		const lines = [
			{ text: "first visual " },
			{ text: "continuation", softWrap: true },
			{ text: "second logical" },
		] as RenderedLine[];

		const text = extractSelectedText(lines, { start: { row: 0, col: 0 }, end: { row: 2, col: 14 } });

		expect(text).toBe("first visual continuation\nsecond logical");
	});
});
