import { describe, expect, test } from "bun:test";
import type { TUI } from "@daedalus-pi/tui";
import stripAnsi from "strip-ansi";
import { initTheme } from "../theme/theme.js";
import { BashExecutionComponent } from "./bash-execution.js";
import { ToolExecutionComponent } from "./tool-execution.js";

initTheme("default", false);

const ui = { requestRender() {} } as unknown as TUI;

function plainRender(component: { render(width: number): string[] }, width = 120): string {
	return stripAnsi(component.render(width).join("\n"));
}

function numberedLines(count: number): string {
	return Array.from({ length: count }, (_, index) => `line-${index + 1}`).join("\n");
}

describe("tool output head/tail folding", () => {
	test("collapsed generic tool output includes head, tail, and folded line count", () => {
		const component = new ToolExecutionComponent("custom_tool", "call-1", {}, {}, undefined, ui);
		component.updateResult({ content: [{ type: "text", text: numberedLines(30) }], isError: false });

		const rendered = plainRender(component);
		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-10");
		expect(rendered).toContain("+10 lines");
		expect(rendered).toContain("expand or open reader/export/editor for full content");
		expect(rendered).toContain("line-21");
		expect(rendered).toContain("line-30");
		expect(rendered).not.toContain("line-15");
	});

	test("expanded generic tool output shows all display lines", () => {
		const component = new ToolExecutionComponent("custom_tool", "call-1", {}, {}, undefined, ui);
		component.updateResult({ content: [{ type: "text", text: numberedLines(30) }], isError: false });
		component.setExpanded(true);

		const rendered = plainRender(component);
		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-15");
		expect(rendered).toContain("line-30");
		expect(rendered).not.toContain("+10 lines");
	});

	test("bash collapsed output includes head, tail, expand hint, and preserves raw output", () => {
		const component = new BashExecutionComponent("printf lines", ui);
		const output = numberedLines(30);
		component.appendOutput(output);
		component.setComplete(0, false);

		const rendered = plainRender(component);
		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-10");
		expect(rendered).toContain("+10 lines");
		expect(rendered).toContain("to expand");
		expect(rendered).toContain("line-21");
		expect(rendered).toContain("line-30");
		expect(rendered).not.toContain("line-15");
		expect(component.getOutput()).toBe(output);
	});

	test("bash expanded output shows all available display lines", () => {
		const component = new BashExecutionComponent("printf lines", ui);
		component.appendOutput(numberedLines(30));
		component.setComplete(0, false);
		component.setExpanded(true);

		const rendered = plainRender(component);
		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-15");
		expect(rendered).toContain("line-30");
		expect(rendered).not.toContain("+10 lines folded");
	});

	test("bash full-output-path warnings still render", () => {
		const component = new BashExecutionComponent("printf lines", ui);
		component.appendOutput(numberedLines(30));
		component.setComplete(
			0,
			false,
			{
				content: "",
				truncated: true,
				truncatedBy: "lines",
				totalLines: 30,
				totalBytes: 0,
				outputLines: 20,
				outputBytes: 0,
				lastLinePartial: false,
				firstLineExceedsLimit: false,
				maxLines: 20,
				maxBytes: 1024,
			},
			"/tmp/full-output.txt",
		);

		const rendered = plainRender(component);
		expect(rendered).toContain("Output truncated. Full output: full-output.txt");
	});
});
