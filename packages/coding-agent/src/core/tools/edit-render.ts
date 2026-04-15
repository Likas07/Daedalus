import { Container, Text } from "@daedalus-pi/tui";
import { renderDiff } from "../../modes/interactive/components/diff.js";
import { invalidArgText, shortenPath, str } from "./render-utils.js";

export interface DiffToolDetailsLike {
	diff: string;
	firstChangedLine?: number;
}

type RenderableArgs = {
	path?: string;
	file_path?: string;
};

export function formatPathEditCall(
	toolName: string,
	args: RenderableArgs | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const invalidArg = invalidArgText(theme);
	const rawPath = str(args?.file_path ?? args?.path);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const pathDisplay = path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
	return `${theme.fg("toolTitle", theme.bold(toolName))} ${pathDisplay}`;
}

export function formatPathEditResult(
	args: RenderableArgs | undefined,
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: DiffToolDetailsLike;
	},
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	isError: boolean,
): string | undefined {
	const rawPath = str(args?.file_path ?? args?.path);
	if (isError) {
		const errorText = result.content
			.filter((c) => c.type === "text")
			.map((c) => c.text || "")
			.join("\n");
		if (!errorText) return undefined;
		return `\n${theme.fg("error", errorText)}`;
	}

	const resultDiff = result.details?.diff;
	if (!resultDiff) return undefined;
	return `\n${renderDiff(resultDiff, { filePath: rawPath ?? undefined })}`;
}

export function createPathEditCallRenderer(toolName: string) {
	return function renderCall(
		args: RenderableArgs | undefined,
		theme: typeof import("../../modes/interactive/theme/theme.js").theme,
		context: { lastComponent?: unknown },
	): Text {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText(formatPathEditCall(toolName, args, theme));
		return text;
	};
}

export function createPathEditResultRenderer() {
	return function renderResult(
		result: {
			content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
			details?: DiffToolDetailsLike;
		},
		_options: unknown,
		theme: typeof import("../../modes/interactive/theme/theme.js").theme,
		context: { args?: RenderableArgs; isError: boolean; lastComponent?: unknown },
	): Text | Container {
		const output = formatPathEditResult(context.args, result, theme, context.isError);
		if (!output) {
			const component = (context.lastComponent as Container | undefined) ?? new Container();
			component.clear();
			return component;
		}
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText(output);
		return text;
	};
}
