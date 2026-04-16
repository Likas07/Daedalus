import type { AgentTool } from "@daedalus-pi/agent-core";
import { Text } from "@daedalus-pi/tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import {
	type AstBackend,
	createDefaultAstBackend,
	formatAstSearchResults,
	normalizeNonNegativeInt,
	normalizePatterns,
	normalizePositiveInt,
	resolveAstScope,
} from "./ast/index.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const astGrepSchema = Type.Object({
	pat: Type.Array(Type.String(), { minItems: 1, description: "AST patterns to match" }),
	lang: Type.Optional(Type.String({ description: "Language override" })),
	path: Type.Optional(Type.String({ description: "File or directory to search (default: cwd)" })),
	glob: Type.Optional(Type.String({ description: "Optional glob filter relative to path" })),
	sel: Type.Optional(Type.String({ description: "Optional selector for contextual pattern mode" })),
	limit: Type.Optional(Type.Number({ description: "Max matches (default: 50)" })),
	offset: Type.Optional(Type.Number({ description: "Skip first N matches (default: 0)" })),
	context: Type.Optional(Type.Number({ description: "Context lines around each match" })),
});

export type AstGrepToolInput = Static<typeof astGrepSchema>;
export interface AstGrepToolDetails {
	matchCount: number;
	fileCount: number;
	scopePath: string;
	stderr?: string;
}

export interface AstGrepToolOptions {
	backend?: AstBackend;
}

function formatAstGrepCall(
	args: { path?: string; lang?: string; glob?: string; pat?: string[] } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const rawPath = str(args?.path);
	const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const invalidArg = invalidArgText(theme);
	const patternDesc = args?.pat?.length === 1 ? args.pat[0] : `${args?.pat?.length ?? 0} patterns`;
	let text = `${theme.fg("toolTitle", theme.bold("ast_grep"))} ${theme.fg("accent", patternDesc)}`;
	text += theme.fg("toolOutput", ` in ${path === null ? invalidArg : path}`);
	if (args?.lang) text += theme.fg("toolOutput", ` lang:${args.lang}`);
	if (args?.glob) text += theme.fg("toolOutput", ` (${args.glob})`);
	return text;
}

function formatAstGrepResult(
	result: { content: Array<{ type: string; text?: string }>; details?: AstGrepToolDetails },
	options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	if (!output) return "";
	const lines = output.split("\n");
	const maxLines = options.expanded ? lines.length : 20;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) text += theme.fg("muted", `\n... (${remaining} more lines)`);
	return text;
}

export function createAstGrepToolDefinition(
	cwd: string,
	options?: AstGrepToolOptions,
): ToolDefinition<typeof astGrepSchema, AstGrepToolDetails | undefined> {
	const backend = options?.backend ?? createDefaultAstBackend();
	return {
		name: "ast_grep",
		label: "ast_grep",
		description: "Structural code search using AST matching. Use when syntax shape matters more than raw text.",
		promptSnippet: "Structural code search using AST matching",
		promptGuidelines: [
			"Use ast_grep when syntax shape matters more than plain text",
			"Keep ast_grep scope narrow with path, glob, and lang",
			"Use ast_grep to verify structural targets before ast_edit or hashline_edit",
		],
		parameters: astGrepSchema,
		async execute(_toolCallId, input: AstGrepToolInput, signal?: AbortSignal) {
			const patterns = normalizePatterns(input.pat);
			const limit = normalizePositiveInt(input.limit, "limit", 50);
			const offset = normalizeNonNegativeInt(input.offset, "offset", 0);
			const context = normalizeNonNegativeInt(input.context, "context", 0);
			const scope = await resolveAstScope(input.path, cwd, input.glob);
			const allMatches = [];
			let stderr = "";
			for (const pattern of patterns) {
				const result = await backend.run({
					pattern,
					lang: input.lang,
					selector: input.sel,
					cwd: scope.commandCwd,
					paths: scope.commandPaths,
					glob: scope.glob,
					signal,
				});
				allMatches.push(...result.matches);
				if (result.stderr) stderr = stderr ? `${stderr}\n${result.stderr}` : result.stderr;
			}
			const sliced = allMatches.slice(offset, offset + limit);
			const text = await formatAstSearchResults(sliced, scope.commandCwd, context);
			const files = new Set(sliced.map((match) => match.file));
			const stderrBlock = stderr ? `\n\nWarnings:\n${stderr}` : "";
			return {
				content: [{ type: "text", text: `${text}${stderrBlock}` }],
				details: {
					matchCount: allMatches.length,
					fileCount: files.size,
					scopePath: scope.displayPath,
					...(stderr ? { stderr } : {}),
				},
			};
		},
		renderCall: (args, theme, context) => {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstGrepCall(args, theme));
			return text;
		},
		renderResult: (result, options, theme, context) => {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstGrepResult(result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createAstGrepTool(cwd: string, options?: AstGrepToolOptions): AgentTool<typeof astGrepSchema> {
	return wrapToolDefinition(createAstGrepToolDefinition(cwd, options));
}

export const astGrepToolDefinition = createAstGrepToolDefinition(process.cwd());
export const astGrepTool = createAstGrepTool(process.cwd());
