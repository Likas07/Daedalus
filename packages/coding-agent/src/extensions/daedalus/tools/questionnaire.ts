import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth, visibleWidth } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { requireUI } from "../shared/ui.js";
import {
	clampScrollOffset,
	defaultScrollableRenderHeight,
	ensureRangeVisible,
	type LineRange,
	renderScrollPanel,
} from "./scroll-panel.js";

interface QuestionOption {
	value: string;
	label: string;
	description?: string;
}

type RenderOption = QuestionOption & { isOther?: boolean };

interface Question {
	id: string;
	label: string;
	prompt: string;
	options: QuestionOption[];
	allowOther: boolean;
}

interface Answer {
	id: string;
	value: string;
	label: string;
	wasCustom: boolean;
	index?: number;
}

interface QuestionnaireResult {
	questions: Question[];
	answers: Answer[];
	cancelled: boolean;
}

const QuestionOptionSchema = Type.Object({
	value: Type.String({ description: "The value returned when selected" }),
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({ description: "Unique identifier for this question" }),
	label: Type.Optional(
		Type.String({
			description: "Short contextual label for tab bar, e.g. 'Scope', 'Priority' (defaults to Q1, Q2)",
		}),
	),
	prompt: Type.String({ description: "The full question text to display" }),
	options: Type.Array(QuestionOptionSchema, { description: "Available options to choose from" }),
	allowOther: Type.Optional(Type.Boolean({ description: "Allow 'Type something' option (default: true)" })),
});

const QuestionnaireParams = Type.Object({
	questions: Type.Array(QuestionSchema, { description: "Questions to ask the user" }),
});

function errorResult(
	message: string,
	questions: Question[] = [],
): { content: { type: "text"; text: string }[]; details: QuestionnaireResult } {
	return {
		content: [{ type: "text", text: message }],
		details: { questions, answers: [], cancelled: true },
	};
}

function resultFromStructuredAnswers(
	questions: Question[],
	result: { answers: Record<string, { answers: readonly string[] }>; cancelled?: boolean },
): QuestionnaireResult {
	if (result.cancelled) return { questions, answers: [], cancelled: true };
	const answers = questions.flatMap((question) => {
		const selected = result.answers[question.id]?.answers ?? [];
		const value = selected[0];
		if (!value) return [];
		const optionIndex = question.options.findIndex((option) => option.value === value || option.label === value);
		const option = optionIndex >= 0 ? question.options[optionIndex] : undefined;
		return [
			{
				id: question.id,
				value: option?.value ?? value,
				label: option?.label ?? value,
				wasCustom: option === undefined,
				...(optionIndex >= 0 ? { index: optionIndex + 1 } : {}),
			},
		];
	});
	return { questions, answers, cancelled: answers.length === 0 };
}

export default function questionnaire(pi: ExtensionAPI) {
	pi.registerTool({
		name: "questionnaire",
		label: "Questionnaire",
		description:
			"Ask the user one or more questions. Use for clarifying requirements, getting preferences, or confirming decisions. For single questions, shows a simple option list. For multiple questions, shows a tab-based interface.",
		parameters: QuestionnaireParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!requireUI(ctx, "questionnaire tool")) {
				return errorResult("Error: UI not available (running in non-interactive mode)");
			}
			if (params.questions.length === 0) {
				return errorResult("Error: No questions provided");
			}

			const questions: Question[] = params.questions.map((q, i) => ({
				...q,
				label: q.label || `Q${i + 1}`,
				allowOther: q.allowOther !== false,
			}));

			const isMulti = questions.length > 1;
			const totalTabs = questions.length + 1;

			const result = ctx.ui.requestUserInput
				? resultFromStructuredAnswers(
						questions,
						await ctx.ui.requestUserInput({
							title: isMulti ? "Questionnaire" : questions[0]?.label,
							signal: _signal,
							questions: questions.map((question) => ({
								id: question.id,
								header: question.label,
								question: question.prompt,
								options: question.options.map((option) => ({
									value: option.value,
									label: option.label,
									description: option.description ?? option.label,
								})),
							})),
						}),
					)
				: await ctx.ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
				let currentTab = 0;
				let optionIndex = 0;
				let inputMode = false;
				let inputQuestionId: string | null = null;
				let scrollOffset = 0;
				let lastBodyViewportHeight = 0;
				let lastBodyLineCount = 0;
				let optionLineRanges: LineRange[] = [];
				let cachedLines: string[] | undefined;
				const answers = new Map<string, Answer>();

				const editorTheme: EditorTheme = {
					borderColor: (s) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function submit(cancelled: boolean) {
					done({ questions, answers: Array.from(answers.values()), cancelled });
				}

				function currentQuestion(): Question | undefined {
					return questions[currentTab];
				}

				function currentOptions(): RenderOption[] {
					const q = currentQuestion();
					if (!q) return [];
					const opts: RenderOption[] = [...q.options];
					if (q.allowOther) {
						opts.push({ value: "__other__", label: "Type something.", isOther: true });
					}
					return opts;
				}

				function allAnswered(): boolean {
					return questions.every((q) => answers.has(q.id));
				}

				function resetScroll() {
					scrollOffset = 0;
					optionLineRanges = [];
					lastBodyLineCount = 0;
				}

				function keepSelectedVisible() {
					if (lastBodyViewportHeight <= 0) return;
					scrollOffset = ensureRangeVisible(
						scrollOffset,
						lastBodyViewportHeight,
						optionLineRanges[optionIndex],
						lastBodyLineCount,
					);
				}

				function scrollBy(delta: number) {
					scrollOffset = clampScrollOffset(scrollOffset + delta, lastBodyLineCount, lastBodyViewportHeight);
				}

				function advanceAfterAnswer() {
					if (!isMulti) {
						submit(false);
						return;
					}
					if (currentTab < questions.length - 1) {
						currentTab++;
					} else {
						currentTab = questions.length;
					}
					optionIndex = 0;
					resetScroll();
					refresh();
				}

				function saveAnswer(questionId: string, value: string, label: string, wasCustom: boolean, index?: number) {
					answers.set(questionId, { id: questionId, value, label, wasCustom, index });
				}

				editor.onSubmit = (value) => {
					if (!inputQuestionId) return;
					const trimmed = value.trim() || "(no response)";
					saveAnswer(inputQuestionId, trimmed, trimmed, true);
					inputMode = false;
					inputQuestionId = null;
					editor.setText("");
					advanceAfterAnswer();
				};

				function handleInput(data: string) {
					if (inputMode) {
						if (matchesKey(data, Key.escape)) {
							inputMode = false;
							inputQuestionId = null;
							editor.setText("");
							keepSelectedVisible();
							refresh();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					const q = currentQuestion();
					const opts = currentOptions();

					if (isMulti) {
						if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
							currentTab = (currentTab + 1) % totalTabs;
							optionIndex = 0;
							resetScroll();
							refresh();
							return;
						}
						if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
							currentTab = (currentTab - 1 + totalTabs) % totalTabs;
							optionIndex = 0;
							resetScroll();
							refresh();
							return;
						}
					}

					if (matchesKey(data, Key.pageUp)) {
						scrollBy(-Math.max(1, lastBodyViewportHeight * 2));
						refresh();
						return;
					}

					if (matchesKey(data, Key.pageDown)) {
						scrollBy(Math.max(1, lastBodyViewportHeight * 2));
						refresh();
						return;
					}

					if (matchesKey(data, Key.home)) {
						scrollOffset = 0;
						refresh();
						return;
					}

					if (matchesKey(data, Key.end)) {
						scrollOffset = clampScrollOffset(Number.POSITIVE_INFINITY, lastBodyLineCount, lastBodyViewportHeight);
						refresh();
						return;
					}

					if (currentTab === questions.length) {
						if (matchesKey(data, Key.enter) && allAnswered()) {
							submit(false);
						} else if (matchesKey(data, Key.escape)) {
							submit(true);
						}
						return;
					}

					if (matchesKey(data, Key.up)) {
						optionIndex = Math.max(0, optionIndex - 1);
						keepSelectedVisible();
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						optionIndex = Math.min(opts.length - 1, optionIndex + 1);
						keepSelectedVisible();
						refresh();
						return;
					}

					if (matchesKey(data, Key.enter) && q) {
						const opt = opts[optionIndex];
						if (!opt) return;
						if (opt.isOther) {
							inputMode = true;
							inputQuestionId = q.id;
							editor.setText("");
							keepSelectedVisible();
							refresh();
							return;
						}
						saveAnswer(q.id, opt.value, opt.label, false, optionIndex + 1);
						advanceAfterAnswer();
						return;
					}

					if (matchesKey(data, Key.escape)) {
						submit(true);
					}
				}

				function addWrappedLine(
					target: string[],
					width: number,
					prefix: string,
					text: string,
					continuationPrefix = " ",
				) {
					const contentWidth = Math.max(1, width - visibleWidth(prefix));
					const wrapped = new Text(text, 0, 0).render(contentWidth);
					const continuation = " ".repeat(visibleWidth(prefix));
					for (let i = 0; i < wrapped.length; i++) {
						target.push(`${i === 0 ? prefix : continuationPrefix || continuation}${wrapped[i]}`);
					}
				}

				function buildTopChrome(width: number): string[] {
					const lines = [theme.fg("accent", "─".repeat(width))].map((line) => truncateToWidth(line, width));

					if (isMulti) {
						const tabs: string[] = ["← "];
						for (let i = 0; i < questions.length; i++) {
							const question = questions[i];
							if (!question) continue;
							const isActive = i === currentTab;
							const isAnswered = answers.has(question.id);
							const box = isAnswered ? "■" : "□";
							const color = isAnswered ? "success" : "muted";
							const text = ` ${box} ${question.label} `;
							const styled = isActive ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(color, text);
							tabs.push(`${styled} `);
						}
						const canSubmit = allAnswered();
						const isSubmitTab = currentTab === questions.length;
						const submitText = " ✓ Submit ";
						const submitStyled = isSubmitTab
							? theme.bg("selectedBg", theme.fg("text", submitText))
							: theme.fg(canSubmit ? "success" : "dim", submitText);
						tabs.push(`${submitStyled} →`);
						const tabRow = ` ${tabs.join("")}`;
						const suffix = visibleWidth(tabRow) > width ? theme.fg("dim", "…") : "";
						lines.push(truncateToWidth(tabRow, Math.max(1, width - visibleWidth(suffix))) + suffix);
					}

					return lines;
				}

				function buildBody(width: number): string[] {
					const body: string[] = [];
					const ranges: LineRange[] = [];
					const q = currentQuestion();
					const opts = currentOptions();
					const addChrome = (s: string) => body.push(truncateToWidth(s, width));
					const addWrapped = (prefix: string, text: string, continuationPrefix = " ") =>
						addWrappedLine(body, width, prefix, text, continuationPrefix);

					function renderOptions() {
						for (let i = 0; i < opts.length; i++) {
							const opt = opts[i];
							if (!opt) continue;
							const start = body.length;
							const selected = i === optionIndex;
							const isOther = opt.isOther === true;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							const label = `${i + 1}. ${opt.label}${isOther && inputMode ? " ✎" : ""}`;
							addWrapped(prefix, theme.fg(selected || (isOther && inputMode) ? "accent" : "text", label), "  ");
							if (opt.description) {
								addWrapped("     ", theme.fg("muted", opt.description), "     ");
							}
							ranges[i] = { start, end: body.length };
						}
					}

					if (inputMode && q) {
						addWrapped(" ", theme.fg("text", q.prompt));
						body.push("");
						renderOptions();
						body.push("");
						addChrome(theme.fg("muted", " Your answer:"));
						for (const line of editor.render(width - 2)) {
							addChrome(` ${line}`);
						}
					} else if (currentTab === questions.length) {
						addChrome(theme.fg("accent", theme.bold(" Ready to submit")));
						body.push("");
						for (const question of questions) {
							const answer = answers.get(question.id);
							if (answer) {
								const prefix = `${question.label}: ${answer.wasCustom ? "(wrote) " : ""}`;
								addWrapped(" ", theme.fg("muted", prefix) + theme.fg("text", answer.label));
							}
						}
						body.push("");
						if (allAnswered()) {
							addChrome(theme.fg("success", " Press Enter to submit"));
						} else {
							const missing = questions
								.filter((question) => !answers.has(question.id))
								.map((question) => question.label)
								.join(", ");
							addChrome(theme.fg("warning", ` Unanswered: ${missing}`));
						}
					} else if (q) {
						addWrapped(" ", theme.fg("text", q.prompt));
						body.push("");
						renderOptions();
					}

					optionLineRanges = ranges;
					lastBodyLineCount = body.length;
					return body;
				}

				function buildBottomChrome(width: number): string[] {
					const lines: string[] = [];
					if (!inputMode) {
						const help = isMulti
							? " Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel"
							: " ↑↓ navigate • Enter select • Esc cancel";
						lines.push(theme.fg("dim", help));
					} else {
						lines.push(theme.fg("dim", " Enter to submit • Esc to cancel"));
					}
					lines.push(theme.fg("accent", "─".repeat(width)));
					return lines.map((line) => truncateToWidth(line, width));
				}

				function render(width: number, height?: number): string[] {
					const effectiveHeight = height ?? defaultScrollableRenderHeight(tui.terminal?.rows);
					if (effectiveHeight === undefined && cachedLines) return cachedLines;

					const topChrome = buildTopChrome(width);
					const body = buildBody(width);
					const bottomChrome = buildBottomChrome(width);

					if (effectiveHeight === undefined) {
						const lines = [...topChrome, "", ...body, "", ...bottomChrome];
						cachedLines = lines;
						return lines;
					}

					lastBodyViewportHeight = Math.max(0, effectiveHeight - topChrome.length - bottomChrome.length);
					const panel = renderScrollPanel(body, lastBodyViewportHeight, scrollOffset, (direction) =>
						truncateToWidth(theme.fg("dim", direction === "up" ? " ↑ more" : " ↓ more"), width),
					);
					scrollOffset = panel.scrollOffset;

					return [...topChrome, ...panel.lines, ...bottomChrome].slice(0, effectiveHeight);
				}

				return {
					render,
					invalidate: () => {
						cachedLines = undefined;
					},
					handleInput,
				};
			});

			if (result.cancelled) {
				return {
					content: [{ type: "text", text: "User cancelled the questionnaire" }],
					details: result,
				};
			}

			const answerLines = result.answers.map((a) => {
				const qLabel = questions.find((q) => q.id === a.id)?.label || a.id;
				if (a.wasCustom) {
					return `${qLabel}: user wrote: ${a.label}`;
				}
				return `${qLabel}: user selected: ${a.index}. ${a.label}`;
			});

			return {
				content: [{ type: "text", text: answerLines.join("\n") }],
				details: result,
			};
		},

		renderCall(args, theme, _context) {
			const qs = (args.questions as Question[] | undefined) || [];
			const count = qs.length;
			const labels = qs.map((q) => q.label || q.id).join(", ");
			let text = theme.fg("toolTitle", theme.bold("questionnaire "));
			text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
			if (labels) {
				text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as QuestionnaireResult | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}
			const lines = details.answers.map((a) => {
				if (a.wasCustom) {
					return `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${theme.fg("muted", "(wrote) ")}${a.label}`;
				}
				const display = a.index ? `${a.index}. ${a.label}` : a.label;
				return `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${display}`;
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
