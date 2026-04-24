import { execSync } from "node:child_process";
import { type ExtensionAPI, formatVisiblePath } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	formatTruncationNotice,
	saveToTempFile,
	type TruncationResult,
	truncateHead,
} from "../shared/truncation.js";

const RgParams = Type.Object({
	pattern: Type.String({ description: "Search pattern (regex)" }),
	path: Type.Optional(Type.String({ description: "Directory to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "File glob pattern, e.g. '*.ts'" })),
});

interface RgDetails {
	pattern: string;
	path?: string;
	glob?: string;
	matchCount: number;
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

interface ExecSyncFailure extends Error {
	status?: number;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "rg",
		label: "ripgrep",
		description: `Search file contents using ripgrep. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first). If truncated, full output is saved to a temp file.`,
		parameters: RgParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { pattern, path: searchPath, glob } = params;

			const args = ["rg", "--line-number", "--color=never"];
			if (glob) args.push("--glob", glob);
			args.push(pattern);
			args.push(searchPath || ".");

			let output: string;
			try {
				output = execSync(args.join(" "), {
					cwd: ctx.cwd,
					encoding: "utf-8",
					maxBuffer: 100 * 1024 * 1024,
				});
			} catch (error) {
				const failure = error as ExecSyncFailure;
				if (failure.status === 1) {
					return {
						content: [{ type: "text", text: "No matches found" }],
						details: { pattern, path: searchPath, glob, matchCount: 0 } as RgDetails,
					};
				}
				throw new Error(`ripgrep failed: ${failure.message}`);
			}

			if (!output.trim()) {
				return {
					content: [{ type: "text", text: "No matches found" }],
					details: { pattern, path: searchPath, glob, matchCount: 0 } as RgDetails,
				};
			}

			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			const matchCount = output.split("\n").filter((line) => line.trim()).length;

			const details: RgDetails = {
				pattern,
				path: searchPath,
				glob,
				matchCount,
			};

			let resultText = truncation.content;

			if (truncation.truncated) {
				const tempFile = await saveToTempFile(output, "rg");
				details.truncation = truncation;
				details.fullOutputPath = tempFile;
				resultText += formatTruncationNotice(truncation, tempFile);
			}

			return {
				content: [{ type: "text", text: resultText }],
				details,
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("rg "));
			text += theme.fg("accent", `"${args.pattern}"`);
			if (args.path) {
				text += theme.fg("muted", ` in ${args.path}`);
			}
			if (args.glob) {
				text += theme.fg("dim", ` --glob ${args.glob}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			const details = result.details as RgDetails | undefined;

			if (isPartial) {
				return new Text(theme.fg("warning", "Searching..."), 0, 0);
			}

			if (!details || details.matchCount === 0) {
				return new Text(theme.fg("dim", "No matches found"), 0, 0);
			}

			let text = theme.fg("success", `${details.matchCount} matches`);

			if (details.truncation?.truncated) {
				text += theme.fg("warning", " (truncated)");
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 20);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line)}`;
					}
					if (content.text.split("\n").length > 20) {
						text += `\n${theme.fg("muted", "... (use read tool to see full output)")}`;
					}
				}

				if (details.fullOutputPath) {
					text += `\n${theme.fg("dim", `Full output: ${formatVisiblePath(details.fullOutputPath)}`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
