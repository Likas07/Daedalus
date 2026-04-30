import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, test } from "vitest";
import question from "../src/extensions/daedalus/tools/question.js";
import questionnaire from "../src/extensions/daedalus/tools/questionnaire.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";

interface RegisteredTool {
	name: string;
	execute: (...args: any[]) => Promise<any>;
	renderCall?: (...args: any[]) => { render: (width: number) => string[] };
}

function register(factory: (pi: any) => void): RegisteredTool {
	let tool: RegisteredTool | undefined;
	factory({
		registerTool(registered: RegisteredTool) {
			tool = registered;
		},
	});
	if (!tool) throw new Error("tool was not registered");
	return tool;
}

async function renderCustomUI(tool: RegisteredTool, params: unknown, width: number): Promise<string> {
	let rendered: string[] | undefined;
	const ctx = {
		hasUI: true,
		ui: {
			notify() {},
			custom(factory: (tui: any, customTheme: typeof theme, kb: unknown, done: (value: unknown) => void) => any) {
				const component = factory({ requestRender() {} }, theme, undefined, () => {});
				rendered = component.render(width);
				return Promise.resolve(
					tool.name === "questionnaire" ? { questions: [], answers: [], cancelled: true } : null,
				);
			},
		},
	};

	await tool.execute("tool-call", params, new AbortController().signal, () => {}, ctx);
	if (!rendered) throw new Error("custom UI did not render");
	return stripAnsi(rendered.join("\n"));
}

function renderPassiveCall(tool: RegisteredTool, params: unknown, width: number): string {
	const component = tool.renderCall?.(params, theme, { state: {} });
	if (!component) throw new Error("tool did not return a renderCall component");
	return stripAnsi(component.render(width).join("\n"));
}

describe("question/questionnaire tool rendering", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("question custom UI wraps narrow prompts, options, and descriptions without dropping text", async () => {
		const tool = register(question);
		const prompt =
			"Which extremely detailed implementation direction should Daedalus take for the wrapping regression scenario?";
		const option = "Keep every long option label visible even when the terminal is narrow";
		const description =
			"This description explains the tradeoff in enough detail that it must wrap across multiple rows.";

		const rendered = await renderCustomUI(
			tool,
			{
				question: prompt,
				options: [{ label: option, description }],
			},
			28,
		);

		expect(rendered).toContain("Which extremely detailed");
		expect(rendered).toContain("scenario?");
		expect(rendered).toContain("Keep every long option");
		expect(rendered).toContain("terminal is narrow");
		expect(rendered).toContain("explains the tradeoff");
		expect(rendered).toContain("multiple rows.");
	});

	test("questionnaire custom UI wraps narrow prompts, options, descriptions, and submit summary", async () => {
		const tool = register(questionnaire);
		const prompt = "Choose the questionnaire path that preserves all detailed prompt text at narrow widths.";
		const option = "Ship the wrapped questionnaire rendering regression coverage";
		const description = "A long questionnaire option description should remain readable after wrapping.";
		const params = {
			questions: [
				{
					id: "scope",
					label: "Scope",
					prompt,
					options: [{ value: "wrap", label: option, description }],
					allowOther: false,
				},
				{
					id: "confirm",
					label: "Confirm",
					prompt: "Confirm the wrapped questionnaire summary path.",
					options: [{ value: "yes", label: "Yes, keep the submit summary visible" }],
					allowOther: false,
				},
			],
		};

		const renderedQuestion = await renderCustomUI(tool, params, 30);
		expect(renderedQuestion).toContain("preserves all detailed");
		expect(renderedQuestion).toContain("at narrow widths.");
		expect(renderedQuestion).toContain("questionnaire rendering");
		expect(renderedQuestion).toContain("regression coverage");
		expect(renderedQuestion).toContain("option description should");
		expect(renderedQuestion).toContain("wrapping.");

		let renderedSubmit: string[] | undefined;
		const ctx = {
			hasUI: true,
			ui: {
				notify() {},
				custom(factory: (tui: any, customTheme: typeof theme, kb: unknown, done: (value: unknown) => void) => any) {
					const component = factory({ requestRender() {} }, theme, undefined, () => {});
					component.handleInput("\r");
					component.handleInput("\r");
					renderedSubmit = component.render(30);
					return Promise.resolve({
						questions: params.questions,
						answers: [{ id: "scope", value: "wrap", label: option, wasCustom: false, index: 1 }],
						cancelled: false,
					});
				},
			},
		};
		await tool.execute("tool-call", params, new AbortController().signal, () => {}, ctx);
		const submitText = stripAnsi((renderedSubmit ?? []).join("\n"));
		expect(submitText).toContain("Ready to submit");
		expect(submitText).toContain("Scope:");
		expect(submitText).toContain("questionnaire rendering");
		expect(submitText).toContain("regression coverage");
	});

	test("passive renderCall summaries stay compact", () => {
		const questionTool = register(question);
		const questionnaireTool = register(questionnaire);
		const longDescription =
			"Description text is intentionally verbose and should not be echoed in passive summaries.";

		const questionSummary = renderPassiveCall(
			questionTool,
			{
				question: "A long passive question summary can wrap, but should stay concise and omit descriptions.",
				options: [{ label: "First compact option label", description: longDescription }],
			},
			32,
		);
		const questionnaireSummary = renderPassiveCall(
			questionnaireTool,
			{
				questions: [
					{ id: "one", label: "First very long label", prompt: "Prompt", options: [] },
					{ id: "two", label: "Second very long label", prompt: "Prompt", options: [] },
				],
			},
			32,
		);

		expect(questionSummary).toContain("question");
		expect(questionSummary).toContain("Options:");
		expect(questionSummary).not.toContain("Description text");
		expect(questionSummary.split("\n").length).toBeLessThanOrEqual(6);
		expect(questionnaireSummary).toContain("questionnaire");
		expect(questionnaireSummary).toContain("2 questions");
		expect(questionnaireSummary.split("\n").length).toBeLessThanOrEqual(3);
	});
});
