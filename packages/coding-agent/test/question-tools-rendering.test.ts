import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, test } from "vitest";
import question from "../src/extensions/daedalus/tools/question.js";
import questionnaire from "../src/extensions/daedalus/tools/questionnaire.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";

interface CustomUIComponent {
	render: (width: number, height?: number) => string[];
	handleInput?: (data: string) => void;
	invalidate?: () => void;
}

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

async function captureCustomUI(
	tool: RegisteredTool,
	params: unknown,
	tui: any = { requestRender() {} },
): Promise<CustomUIComponent> {
	let component: CustomUIComponent | undefined;
	const ctx = {
		hasUI: true,
		ui: {
			notify() {},
			custom(
				factory: (
					tui: any,
					customTheme: typeof theme,
					kb: unknown,
					done: (value: unknown) => void,
				) => CustomUIComponent,
			) {
				component = factory(tui, theme, undefined, () => {});
				return Promise.resolve(
					tool.name === "questionnaire" ? { questions: [], answers: [], cancelled: true } : null,
				);
			},
		},
	};

	await tool.execute("tool-call", params, new AbortController().signal, () => {}, ctx);
	if (!component) throw new Error("custom UI did not render");
	return component;
}

async function renderCustomUI(tool: RegisteredTool, params: unknown, width: number): Promise<string> {
	const component = await captureCustomUI(tool, params);
	return stripAnsi(component.render(width).join("\n"));
}

function renderComponent(component: CustomUIComponent, width: number, height?: number): string {
	return stripAnsi(component.render(width, height).join("\n"));
}

function lineCount(rendered: string): number {
	return rendered.split("\n").length;
}

const key = {
	down: "\x1b[B",
	home: "\x1b[H",
	end: "\x1b[F",
	pageUp: "\x1b[5~",
	pageDown: "\x1b[6~",
};

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

	test("question custom UI caps long content to terminal height and scrolls with sticky chrome", async () => {
		const tool = register(question);
		const width = 44;
		const height = 10;
		const component = await captureCustomUI(tool, {
			question:
				"Which deployment strategy should Daedalus choose when the prompt itself is deliberately long enough to need multiple visible body rows?",
			options: [
				{
					label: "Option 1: Keep the simple rollout path visible near the top",
					description: "This first option description should remain reachable when Home returns to the top.",
				},
				{
					label: "Option 2: Add telemetry before changing behavior",
					description: "A medium-length description makes the option list taller than the viewport.",
				},
				{
					label: "Option 3: Stage the rollout behind a project setting",
					description: "Another wrapped description contributes enough lines to require scrolling.",
				},
				{
					label: "Option 4: Ask for explicit confirmation before proceeding",
					description: "The user should be able to reach this middle content with PageDown.",
				},
				{
					label: "Option 5: Document migration details before shipping",
					description: "Late content should appear without pushing the help text off screen.",
				},
				{
					label: "Option 6: Archive the sentinel fallback after the scroll jump",
					description: "This sentinel description proves the body moved down inside the fixed panel.",
				},
			],
		});

		const initial = renderComponent(component, width, height);
		expect(lineCount(initial)).toBeLessThanOrEqual(height);
		expect(initial).toContain("Which deployment strategy");
		expect(initial).toContain("↑↓ navigate");
		expect(initial).toContain("Enter to select");
		expect(initial).toMatch(/↓.*more/i);

		component.handleInput?.(key.pageDown);
		const afterPageDown = renderComponent(component, width, height);
		expect(lineCount(afterPageDown)).toBeLessThanOrEqual(height);
		expect(afterPageDown).toContain("Ask for explicit confirmation");
		expect(afterPageDown).toContain("↑↓ navigate");
		expect(afterPageDown).toMatch(/↑.*more/i);

		component.handleInput?.(key.home);
		const afterHome = renderComponent(component, width, height);
		expect(lineCount(afterHome)).toBeLessThanOrEqual(height);
		expect(afterHome).toContain("Which deployment strategy");
		expect(afterHome).toContain("simple rollout path");
		expect(afterHome).toContain("↑↓ navigate");
	});

	test("question and questionnaire derive a default cap from terminal rows", async () => {
		const options = Array.from({ length: 8 }, (_, index) => ({
			label: `Option ${index + 1}: keep this long runtime-rendered row scrollable`,
			description: "Description text makes the component taller than the default terminal-derived cap.",
		}));
		const tui = { requestRender() {}, terminal: { rows: 14 } };

		const questionComponent = await captureCustomUI(
			register(question),
			{
				question: "Which runtime question render path should be capped when Container calls render(width)?",
				options,
			},
			tui,
		);
		const defaultQuestionRender = renderComponent(questionComponent, 48);
		expect(lineCount(defaultQuestionRender)).toBeLessThanOrEqual(9);
		expect(defaultQuestionRender).toContain("Enter to select");
		expect(defaultQuestionRender).toMatch(/↓.*more/i);
		const explicitQuestionRender = renderComponent(questionComponent, 48, 12);
		expect(lineCount(explicitQuestionRender)).toBeLessThanOrEqual(12);

		const questionnaireComponent = await captureCustomUI(
			register(questionnaire),
			{
				questions: [
					{
						id: "runtime",
						label: "Runtime",
						prompt:
							"Which runtime questionnaire render path should be capped when Container calls render(width)?",
						options: options.map((option, index) => ({ value: String(index + 1), ...option })),
						allowOther: false,
					},
				],
			},
			tui,
		);
		const defaultQuestionnaireRender = renderComponent(questionnaireComponent, 48);
		expect(lineCount(defaultQuestionnaireRender)).toBeLessThanOrEqual(9);
		expect(defaultQuestionnaireRender).toContain("Enter select");
		expect(defaultQuestionnaireRender).toMatch(/↓.*more/i);
		const explicitQuestionnaireRender = renderComponent(questionnaireComponent, 48, 12);
		expect(lineCount(explicitQuestionnaireRender)).toBeLessThanOrEqual(12);
	});

	test("questionnaire custom UI caps long content and scrolls selected options without losing chrome", async () => {
		const tool = register(questionnaire);
		const width = 48;
		const height = 11;
		const component = await captureCustomUI(tool, {
			questions: [
				{
					id: "scope",
					label: "Scope",
					prompt:
						"Choose the implementation scope for the questionnaire scrolling regression when the prompt is long enough to wrap across several lines.",
					options: [
						{
							value: "baseline",
							label: "Option 1: Baseline coverage for the visible top rows",
							description: "The first description should be visible again after Home scrolls back to the top.",
						},
						{
							value: "metrics",
							label: "Option 2: Add metrics before implementation",
							description: "This description helps make the question body overflow the small viewport.",
						},
						{
							value: "docs",
							label: "Option 3: Write migration notes for operators",
							description: "The selected option should scroll into view as ArrowDown repeats.",
						},
						{
							value: "polish",
							label: "Option 4: Polish the sticky chrome behavior",
							description: "PageDown should move body content while leaving tabs and help visible.",
						},
						{
							value: "ship",
							label: "Option 5: Ship the late visible sentinel option",
							description: "This later option proves ArrowDown auto-scrolled selected content into view.",
						},
					],
					allowOther: false,
				},
				{
					id: "impact",
					label: "Impact",
					prompt:
						"Choose the expected impact once the scroll panel is height-aware and keeps questionnaire navigation usable.",
					options: [
						{ value: "low", label: "Low impact but safer rendering" },
						{ value: "high", label: "High impact because long questionnaires remain usable" },
					],
					allowOther: false,
				},
			],
		});

		const initial = renderComponent(component, width, height);
		expect(lineCount(initial)).toBeLessThanOrEqual(height);
		expect(initial).toContain("Scope");
		expect(initial).toContain("Impact");
		expect(initial).toContain("Submit");
		expect(initial).toContain("Tab/←→ navigate");
		expect(initial).toMatch(/↓.*more/i);

		for (let i = 0; i < 4; i++) component.handleInput?.(key.down);
		const afterArrowDown = renderComponent(component, width, height);
		expect(lineCount(afterArrowDown)).toBeLessThanOrEqual(height);
		expect(afterArrowDown).toContain("Ship the late visible sentinel");
		expect(afterArrowDown).toContain("Tab/←→ navigate");
		expect(afterArrowDown).toMatch(/↑.*more/i);

		component.handleInput?.(key.pageUp);
		const afterPageUp = renderComponent(component, width, height);
		expect(lineCount(afterPageUp)).toBeLessThanOrEqual(height);
		expect(afterPageUp).toContain("Scope");
		expect(afterPageUp).toContain("Tab/←→ navigate");
		expect(afterPageUp).not.toEqual(afterArrowDown);

		component.handleInput?.(key.pageDown);
		const afterPageDown = renderComponent(component, width, height);
		expect(lineCount(afterPageDown)).toBeLessThanOrEqual(height);
		expect(afterPageDown).toContain("Scope");
		expect(afterPageDown).toContain("Tab/←→ navigate");
		expect(afterPageDown).not.toEqual(afterPageUp);

		component.handleInput?.(key.end);
		const afterEnd = renderComponent(component, width, height);
		expect(lineCount(afterEnd)).toBeLessThanOrEqual(height);
		expect(afterEnd).toContain("Ship the late visible sentinel");
		expect(afterEnd).toContain("Tab/←→ navigate");
		expect(afterEnd).toMatch(/↑.*more/i);

		component.handleInput?.(key.home);
		const afterHome = renderComponent(component, width, height);
		expect(lineCount(afterHome)).toBeLessThanOrEqual(height);
		expect(afterHome).toContain("Choose the implementation scope");
		expect(afterHome).toContain("Baseline coverage");
		expect(afterHome).toContain("Tab/←→ navigate");
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
