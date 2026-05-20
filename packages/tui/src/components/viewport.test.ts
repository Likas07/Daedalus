import { describe, expect, it } from "bun:test";
import type { Component } from "../tui.js";
import { Viewport } from "./viewport.js";

class LinesComponent implements Component {
	constructor(private readonly lines: string[]) {}

	render(_width: number): string[] {
		return this.lines;
	}

	invalidate(): void {}
}

const lineNumbers = (count: number): string[] => Array.from({ length: count }, (_, index) => `line ${index}`);

describe("Viewport navigation", () => {
	it("scrolls by full pages and clamps at content boundaries", () => {
		const viewport = new Viewport(new LinesComponent(lineNumbers(10)), 4);

		expect(viewport.render(20)).toEqual(["line 6", "line 7", "line 8", "line 9"]);
		expect(viewport.getScrollOffset()).toBe(6);
		expect(viewport.isFollowingBottom()).toBe(true);

		viewport.pageUp();
		expect(viewport.getScrollOffset()).toBe(2);
		expect(viewport.isFollowingBottom()).toBe(false);
		expect(viewport.render(20)).toEqual(["line 2", "line 3", "line 4", "line 5"]);

		viewport.pageUp();
		expect(viewport.getScrollOffset()).toBe(0);
		expect(viewport.render(20)).toEqual(["line 0", "line 1", "line 2", "line 3"]);

		viewport.pageDown();
		expect(viewport.getScrollOffset()).toBe(4);
		expect(viewport.isFollowingBottom()).toBe(false);

		viewport.pageDown();
		expect(viewport.getScrollOffset()).toBe(6);
		expect(viewport.isFollowingBottom()).toBe(true);
		expect(viewport.render(20)).toEqual(["line 6", "line 7", "line 8", "line 9"]);
	});

	it("scrolls by half pages using at least one line", () => {
		const viewport = new Viewport(new LinesComponent(lineNumbers(8)), 4);
		viewport.render(20);

		viewport.halfPageUp();
		expect(viewport.getScrollOffset()).toBe(2);
		expect(viewport.isFollowingBottom()).toBe(false);
		expect(viewport.render(20)).toEqual(["line 2", "line 3", "line 4", "line 5"]);

		viewport.halfPageDown();
		expect(viewport.getScrollOffset()).toBe(4);
		expect(viewport.isFollowingBottom()).toBe(true);
		expect(viewport.render(20)).toEqual(["line 4", "line 5", "line 6", "line 7"]);

		viewport.setHeight(1);
		viewport.render(20);
		viewport.halfPageUp();
		expect(viewport.getScrollOffset()).toBe(6);
		expect(viewport.render(20)).toEqual(["line 6"]);
	});
});
