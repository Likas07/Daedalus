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

interface OptionWithDesc {
	label: string;
	description?: string;
}

type DisplayOption = OptionWithDesc & { isOther?: boolean };

interface QuestionDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

const QuestionParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	options: Type.Array(OptionSchema, { description: "Options for the user to choose from" }),
});

export default function question(pi: ExtensionAPI) {
	pi.registerTool({
		name: "question",
		label: "Question",
		description: "Ask the user a question and let them pick from options. Use when you need user input to proceed.",
		parameters: QuestionParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!requireUI(ctx, "question tool")) {
				return {
					content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
					details: {
						question: params.question,
						options: params.options.map((o) => o.label),
						answer: null,
					} as QuestionDetails,
				};
			}

			if (params.options.length === 0) {
				return {
					content: [{ type: "text", text: "Error: No options provided" }],
					details: { question: params.question, options: [], answer: null } as QuestionDetails,
				};
			}

			const allOptions: DisplayOption[] = [...params.options, { label: "Type something.", isOther: true }];

			const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean; index?: number } | null>(
				(tui, theme, _kb, done) => {
					let optionIndex = 0;
					let editMode = false;
					let scrollOffset = 0;
					let lastBodyViewportHeight = 0;
					let optionLineRanges: LineRange[] = [];
					let cachedLines: string[] | undefined;
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

					editor.onSubmit = (value) => {
						const trimmed = value.trim();
						if (trimmed) {
							done({ answer: trimmed, wasCustom: true });
						} else {
							editMode = false;
							editor.setText("");
							refresh();
						}
					};

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function keepSelectedVisible() {
						if (lastBodyViewportHeight <= 0) return;
						scrollOffset = ensureRangeVisible(
							scrollOffset,
							lastBodyViewportHeight,
							optionLineRanges[optionIndex],
							optionLineRanges.at(-1)?.end ?? 0,
						);
					}

					function handleInput(data: string) {
						if (editMode) {
							if (matchesKey(data, Key.escape)) {
								editMode = false;
								editor.setText("");
								keepSelectedVisible();
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}

						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							keepSelectedVisible();
							refresh();
							return;
						}

						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
							keepSelectedVisible();
							refresh();
							return;
						}

						if (matchesKey(data, Key.pageUp)) {
							scrollOffset = clampScrollOffset(
								scrollOffset - Math.max(1, lastBodyViewportHeight * 2),
								optionLineRanges.at(-1)?.end ?? 0,
								lastBodyViewportHeight,
							);
							refresh();
							return;
						}

						if (matchesKey(data, Key.pageDown)) {
							scrollOffset = clampScrollOffset(
								scrollOffset + Math.max(1, lastBodyViewportHeight * 2),
								optionLineRanges.at(-1)?.end ?? 0,
								lastBodyViewportHeight,
							);
							refresh();
							return;
						}

						if (matchesKey(data, Key.home)) {
							scrollOffset = 0;
							refresh();
							return;
						}

						if (matchesKey(data, Key.end)) {
							scrollOffset = clampScrollOffset(
								Number.POSITIVE_INFINITY,
								optionLineRanges.at(-1)?.end ?? 0,
								lastBodyViewportHeight,
							);
							refresh();
							return;
						}

						if (matchesKey(data, Key.enter)) {
							const selected = allOptions[optionIndex];
							if (!selected) return;
							if (selected.isOther) {
								editMode = true;
								keepSelectedVisible();
								refresh();
							} else {
								done({ answer: selected.label, wasCustom: false, index: optionIndex + 1 });
							}
							return;
						}

						if (matchesKey(data, Key.escape)) {
							done(null);
						}
					}

					function buildBody(width: number): string[] {
						const body: string[] = [];
						const ranges: LineRange[] = [];
						const addChrome = (s: string) => body.push(truncateToWidth(s, width));
						const addWrapped = (prefix: string, text: string, continuationPrefix = " ") => {
							const contentWidth = Math.max(1, width - visibleWidth(prefix));
							const wrapped = new Text(text, 0, 0).render(contentWidth);
							const continuation = " ".repeat(visibleWidth(prefix));
							for (let i = 0; i < wrapped.length; i++) {
								body.push(`${i === 0 ? prefix : continuationPrefix || continuation}${wrapped[i]}`);
							}
						};

						addWrapped(" ", theme.fg("text", params.question));
						body.push("");

						for (let i = 0; i < allOptions.length; i++) {
							const opt = allOptions[i];
							if (!opt) continue;
							const start = body.length;
							const selected = i === optionIndex;
							const isOther = opt.isOther === true;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";

							const label = `${i + 1}. ${opt.label}${isOther && editMode ? " ✎" : ""}`;
							addWrapped(prefix, theme.fg(selected || (isOther && editMode) ? "accent" : "text", label), "  ");

							if (opt.description) {
								addWrapped("     ", theme.fg("muted", opt.description), "     ");
							}
							ranges[i] = { start, end: body.length };
						}

						if (editMode) {
							body.push("");
							addChrome(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) {
								addChrome(` ${line}`);
							}
						}

						optionLineRanges = ranges;
						return body;
					}

					function render(width: number, height?: number): string[] {
						const effectiveHeight = height ?? defaultScrollableRenderHeight(tui.terminal?.rows);
						if (effectiveHeight === undefined && cachedLines) return cachedLines;

						const topChrome = [theme.fg("accent", "─".repeat(width))].map((line) => truncateToWidth(line, width));
						const body = buildBody(width);
						const helpChrome = [
							theme.fg(
								"dim",
								editMode
									? " Enter to submit • Esc to go back"
									: " ↑↓ navigate • Enter to select • Esc to cancel",
							),
							theme.fg("accent", "─".repeat(width)),
						].map((line) => truncateToWidth(line, width));

						if (effectiveHeight === undefined) {
							const lines = [...topChrome, ...body, "", ...helpChrome];
							cachedLines = lines;
							return lines;
						}

						lastBodyViewportHeight = Math.max(0, effectiveHeight - topChrome.length - helpChrome.length);

						const panel = renderScrollPanel(body, lastBodyViewportHeight, scrollOffset, (direction) =>
							truncateToWidth(theme.fg("dim", direction === "up" ? " ↑ more" : " ↓ more"), width),
						);
						scrollOffset = panel.scrollOffset;

						return [...topChrome, ...panel.lines, ...helpChrome].slice(0, effectiveHeight);
					}

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				},
			);

			const simpleOptions = params.options.map((o) => o.label);

			if (!result) {
				return {
					content: [{ type: "text", text: "User cancelled the selection" }],
					details: { question: params.question, options: simpleOptions, answer: null } as QuestionDetails,
				};
			}

			if (result.wasCustom) {
				return {
					content: [{ type: "text", text: `User wrote: ${result.answer}` }],
					details: {
						question: params.question,
						options: simpleOptions,
						answer: result.answer,
						wasCustom: true,
					} as QuestionDetails,
				};
			}

			return {
				content: [{ type: "text", text: `User selected: ${result.index}. ${result.answer}` }],
				details: {
					question: params.question,
					options: simpleOptions,
					answer: result.answer,
					wasCustom: false,
				} as QuestionDetails,
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("question ")) + theme.fg("muted", args.question);
			const opts = Array.isArray(args.options) ? (args.options as OptionWithDesc[]) : [];
			if (opts.length) {
				const labels = opts.map((o) => o.label);
				const numbered = [...labels, "Type something."].map((o, i) => `${i + 1}. ${o}`);
				text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as QuestionDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.answer === null) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			if (details.wasCustom) {
				return new Text(
					theme.fg("success", "✓ ") + theme.fg("muted", "(wrote) ") + theme.fg("accent", details.answer),
					0,
					0,
				);
			}

			const idx = details.options.indexOf(details.answer) + 1;
			const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer;
			return new Text(theme.fg("success", "✓ ") + theme.fg("accent", display), 0, 0);
		},
	});
}
