import { describe, expect, test } from "bun:test";
import stripAnsi from "strip-ansi";
import { ReaderModeComponent } from "./reader-mode.js";

function renderPlain(component: ReaderModeComponent, width = 80): string {
	return stripAnsi(component.render(width).join("\n"));
}

describe("ReaderModeComponent", () => {
	test("renders title, status/help, and full content through viewport", () => {
		const component = new ReaderModeComponent({ title: "Full response", response: "# Heading\nline one\nline two" });
		const rendered = renderPlain(component);
		expect(rendered).toContain("Full response · 3 lines");
		expect(rendered).toContain("# Heading");
		expect(rendered).toContain("line two");
		expect(rendered).toContain("copy open dump export Esc");
	});

	test("supports page, home, and end scrolling", () => {
		const component = new ReaderModeComponent({
			response: Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n"),
		});
		component.render(80);
		component.handleInput("\x1b[6~");
		expect(component.getScrollOffset()).toBeGreaterThan(0);
		component.handleInput("\x1b[H");
		expect(component.getScrollOffset()).toBe(0);
		component.handleInput("\x1b[F");
		expect(component.getScrollOffset()).toBeGreaterThan(0);
	});

	test("supports slash search and n/N navigation", () => {
		const component = new ReaderModeComponent({ response: "alpha\nbeta\ngamma alpha", viewportHeight: 1 });
		component.render(80);
		component.handleInput("/");
		component.handleInput("a");
		component.handleInput("l");
		component.handleInput("p");
		component.handleInput("h");
		component.handleInput("a");
		expect(renderPlain(component)).toContain("/alpha (2)");
		component.handleInput("\r");
		expect(component.getScrollOffset()).toBe(2);
		component.handleInput("N");
		expect(component.getScrollOffset()).toBe(0);
	});

	test("jumps between headings and messages", () => {
		const component = new ReaderModeComponent({
			response: "# One\nbody\n## Two",
			messages: [{ role: "assistant", content: "message body" }],
			viewportHeight: 1,
		});
		component.render(80);
		component.handleInput("h");
		expect(component.getScrollOffset()).toBe(2);
		component.handleInput("m");
		expect(component.getScrollOffset()).toBeGreaterThanOrEqual(4);
	});

	test("toggles expand-all flag", () => {
		const component = new ReaderModeComponent({ response: "x" });
		expect(component.getModel().expandAll).toBe(false);
		component.handleInput("a");
		expect(component.getModel().expandAll).toBe(true);
		expect(renderPlain(component)).toContain("expand all");
	});

	test("invokes copy open dump export actions and close", () => {
		const calls: string[] = [];
		const component = new ReaderModeComponent({
			response: "payload",
			actions: {
				copy: (text) => calls.push(`copy:${text}`),
				open: (text) => calls.push(`open:${text}`),
				dump: (text) => calls.push(`dump:${text}`),
				export: (text) => calls.push(`export:${text}`),
				close: () => calls.push("close"),
			},
		});
		for (const key of ["c", "o", "d", "e", "\x1b"]) component.handleInput(key);
		expect(calls).toEqual(["copy:payload", "open:payload", "dump:payload", "export:payload", "close"]);
	});
});
