import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, it } from "vitest";
import { bashExecutionToText } from "../src/core/messages.js";
import { createBashToolDefinition } from "../src/core/tools/bash.js";
import type { TruncationResult } from "../src/core/tools/truncate.js";
import { formatVisiblePath } from "../src/core/tools/visible-path.js";
import { formatTruncationNotice } from "../src/extensions/daedalus/shared/truncation.js";
import truncatedTool from "../src/extensions/daedalus/tools/truncated-tool.js";
import { BashExecutionComponent } from "../src/modes/interactive/components/bash-execution.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";

function createTuiStub(): any {
	return {
		terminal: { columns: 120, rows: 24 },
		addInterval: (_cb: () => void, _ms: number) => ({ dispose: () => {} }),
		removeInterval: () => {},
		requestRender: () => {},
	};
}

function renderText(component: { render: (width: number) => string[] }, width = 120): string {
	return stripAnsi(component.render(width).join("\n"));
}

function makeTruncation(): TruncationResult {
	return {
		content: "preview output",
		truncated: true,
		truncatedBy: "lines",
		totalLines: 40,
		totalBytes: 400,
		outputLines: 5,
		outputBytes: 50,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
		maxLines: 5,
		maxBytes: 100,
	};
}

describe("visible path sanitization", () => {
	beforeAll(() => {
		initTheme(undefined, false);
	});

	it("sanitizes bash tool render warnings", () => {
		const fullOutputPath = "/tmp/secret/nested/output.txt";
		const tool = createBashToolDefinition(process.cwd());
		const component = tool.renderResult(
			{
				content: [{ type: "text", text: "preview output" }],
				details: { fullOutputPath, truncation: makeTruncation() },
			} as any,
			{ expanded: true, isPartial: false },
			theme,
			{
				state: {},
				showImages: false,
				invalidate: () => {},
				lastComponent: undefined,
				isError: false,
			} as any,
		);

		const rendered = renderText(component);
		expect(rendered).toContain(`Full output: ${formatVisiblePath(fullOutputPath)}`);
		expect(rendered).not.toContain(fullOutputPath);
	});

	it("sanitizes bash execution message text", () => {
		const fullOutputPath = "/very/private/path/output.log";
		const text = bashExecutionToText({
			role: "bashExecution",
			command: "cat output.log",
			output: "preview output",
			exitCode: 0,
			cancelled: false,
			truncated: true,
			fullOutputPath,
			timestamp: Date.now(),
		});

		expect(text).toContain(`Full output: ${formatVisiblePath(fullOutputPath)}`);
		expect(text).not.toContain(fullOutputPath);
	});

	it("sanitizes bash execution component status text", () => {
		const fullOutputPath = "/tmp/deep/private/output.txt";
		const component = new BashExecutionComponent("echo test", createTuiStub());
		component.appendOutput("line 1\nline 2\n");
		component.setComplete(0, false, makeTruncation(), fullOutputPath);

		const rendered = renderText(component);
		expect(rendered).toContain(`Full output: ${formatVisiblePath(fullOutputPath)}`);
		expect(rendered).not.toContain(fullOutputPath);
	});

	it("sanitizes truncated-tool content notices", () => {
		const fullOutputPath = "/tmp/hidden/full-output.txt";
		const notice = formatTruncationNotice(makeTruncation(), fullOutputPath);

		expect(notice).toContain(`Full output saved to: ${formatVisiblePath(fullOutputPath)}`);
		expect(notice).not.toContain(fullOutputPath);
	});

	it("sanitizes truncated-tool rendered full output note", () => {
		let registeredTool: any;
		truncatedTool({ registerTool: (tool: unknown) => (registeredTool = tool) } as any);
		const fullOutputPath = "/tmp/very/secret/output.txt";
		const component = registeredTool.renderResult(
			{
				content: [{ type: "text", text: "preview output" }],
				details: { matchCount: 3, truncation: makeTruncation(), fullOutputPath },
			},
			{ expanded: true, isPartial: false },
			theme,
			{},
		);

		const rendered = renderText(component);
		expect(rendered).toContain(`Full output: ${formatVisiblePath(fullOutputPath)}`);
		expect(rendered).not.toContain(fullOutputPath);
	});
});
