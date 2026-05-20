import { describe, expect, test } from "bun:test";
import type { AssistantMessage } from "@daedalus-pi/ai";
import stripAnsi from "strip-ansi";
import { initTheme } from "../theme/theme.js";
import { AssistantMessageComponent } from "./assistant-message.js";

initTheme("default", false);

function messageWithContent(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "responses",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

function plainRender(component: { render(width: number): string[] }, width = 120): string {
	return stripAnsi(component.render(width).join("\n"));
}

function numberedLines(count: number): string {
	return Array.from({ length: count }, (_, index) => `line-${index + 1}`).join("\n");
}

describe("AssistantMessageComponent folding", () => {
	test("renders short assistant messages unchanged", () => {
		const component = new AssistantMessageComponent(messageWithContent([{ type: "text", text: "short answer" }]));

		expect(plainRender(component)).toContain("short answer");
		expect(plainRender(component)).not.toContain("full assistant response");
	});

	test("latest assistant message renders full text by default even when long", () => {
		const component = new AssistantMessageComponent(messageWithContent([{ type: "text", text: numberedLines(8) }]));
		const rendered = plainRender(component);

		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-4");
		expect(rendered).toContain("line-8");
		expect(rendered).not.toContain("full assistant response");
	});

	test("older long assistant messages can render a conservative collapsed preview", () => {
		const component = new AssistantMessageComponent(
			messageWithContent([{ type: "text", text: numberedLines(8) }]),
			false,
			undefined,
			"Thinking...",
			{ collapseLongText: true, collapsedLineBudget: 4 },
		);
		const rendered = plainRender(component);

		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-2");
		expect(rendered).toContain("+4 lines");
		expect(rendered).toContain("expand or open reader/export/editor for full assistant response");
		expect(rendered).toContain("line-7");
		expect(rendered).toContain("line-8");
		expect(rendered).not.toContain("line-4");
	});

	test("expanded older assistant messages render full text", () => {
		const component = new AssistantMessageComponent(
			messageWithContent([{ type: "text", text: numberedLines(8) }]),
			false,
			undefined,
			"Thinking...",
			{ collapseLongText: true, expanded: true, collapsedLineBudget: 4 },
		);
		const rendered = plainRender(component);

		expect(rendered).toContain("line-1");
		expect(rendered).toContain("line-4");
		expect(rendered).toContain("line-8");
		expect(rendered).not.toContain("full assistant response");
	});

	test("thinking-hide behavior remains unchanged", () => {
		const message = messageWithContent([
			{ type: "thinking", thinking: "private chain of thought" },
			{ type: "text", text: "visible answer" },
		]);
		const component = new AssistantMessageComponent(message, true, undefined, "Thinking hidden", {
			collapseLongText: true,
			collapsedLineBudget: 4,
		});
		const rendered = plainRender(component);

		expect(rendered).toContain("Thinking hidden");
		expect(rendered).not.toContain("private chain of thought");
		expect(rendered).toContain("visible answer");
	});
});
