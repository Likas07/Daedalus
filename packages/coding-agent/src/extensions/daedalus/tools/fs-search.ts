import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { StringEnum } from "@daedalus-pi/ai";
import { formatVisiblePath, type ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { globSync } from "glob";
import { resolveToCwd } from "../../../core/tools/path-utils.js";
import { ensureTool } from "../../../utils/tools-manager.js";
import {
	GREP_MAX_LINE_LENGTH,
	type TruncationResult,
	truncateHead,
	truncateLine,
} from "../../../core/tools/truncate.js";
import { formatTruncationNotice, saveToTempFile } from "../shared/truncation.js";

const FsSearchParams = Type.Object({
	pattern: Type.String({ description: "Regex pattern for content search, or glob pattern when target='files'" }),
	target: Type.Optional(StringEnum(["content", "files"] as const)),
	path: Type.Optional(Type.String({ description: "Directory or file to search in (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Restrict content search to files matching this glob" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results to return (default: 50)" })),
	offset: Type.Optional(Type.Number({ description: "Skip the first N results (default: 0)" })),
	output_mode: Type.Optional(StringEnum(["content", "files_only", "count"] as const)),
	context: Type.Optional(
		Type.Number({ description: "Context lines before and after each content match (default: 0)" }),
	),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern as a literal string instead of regex" })),
});

function rel(basePath: string, absolutePath: string): string {
	const relative = path.relative(basePath, absolutePath) || path.basename(absolutePath);
	return relative.split(path.sep).join("/");
}

function paginate<T>(items: T[], offset = 0, limit = 50): { page: T[]; total: number } {
	const safeOffset = Math.max(0, offset);
	const safeLimit = Math.max(1, limit);
	return { page: items.slice(safeOffset, safeOffset + safeLimit), total: items.length };
}

function formatPageNotice(offset: number, pageLength: number, total: number): string | undefined {
	if (offset + pageLength >= total) return undefined;
	return `[Showing ${offset + 1}-${offset + pageLength} of ${total}. Use offset=${offset + pageLength} for more.]`;
}

interface BoundedOutput {
	text: string;
	truncation?: TruncationResult;
	linesTruncated?: boolean;
	fullOutputPath?: string;
}

async function formatBoundedOutput(rawOutput: string, artifactPrefix: string): Promise<BoundedOutput> {
	const lineResults = rawOutput.split("\n").map((line) => truncateLine(line));
	const linesTruncated = lineResults.some((line) => line.wasTruncated);
	const compactOutput = lineResults.map((line) => line.text).join("\n");
	const truncation = truncateHead(compactOutput);
	let text = truncation.content;
	let fullOutputPath: string | undefined;

	if (truncation.truncated || linesTruncated) {
		fullOutputPath = await saveToTempFile(rawOutput, artifactPrefix);
	}
	if (truncation.truncated && fullOutputPath) {
		text += formatTruncationNotice(truncation, fullOutputPath);
	}
	if (linesTruncated && fullOutputPath) {
		text += `\n\n[Some rows truncated to ${GREP_MAX_LINE_LENGTH} chars. Full output saved to: ${formatVisiblePath(fullOutputPath)}]`;
	}

	return {
		text,
		...(truncation.truncated ? { truncation } : {}),
		...(linesTruncated ? { linesTruncated: true } : {}),
		...(fullOutputPath ? { fullOutputPath } : {}),
	};
}

async function runFileSearch(params: { pattern: string; path?: string; limit?: number; offset?: number; cwd: string }) {
	const searchPath = resolveToCwd(params.path || ".", params.cwd);
	const files = globSync(params.pattern, {
		cwd: searchPath,
		absolute: true,
		dot: true,
		nodir: false,
		ignore: ["**/node_modules/**", "**/.git/**"],
	})
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
		.map((entry) => rel(searchPath, entry));
	const { page, total } = paginate(files, params.offset, params.limit ?? 50);
	const notice = formatPageNotice(params.offset ?? 0, page.length, total);
	const bounded = page.length ? await formatBoundedOutput(page.join("\n"), "fs-search-files") : undefined;
	return {
		content: [
			{
				type: "text" as const,
				text: page.length
					? `${bounded!.text}${notice ? `\n\n${notice}` : ""}`
					: "No files found",
			},
		],
		details: {
			target: "files",
			total,
			offset: params.offset ?? 0,
			limit: params.limit ?? 50,
			results: page,
			...(bounded?.truncation ? { truncation: bounded.truncation } : {}),
			...(bounded?.linesTruncated ? { linesTruncated: true } : {}),
			...(bounded?.fullOutputPath ? { fullOutputPath: bounded.fullOutputPath } : {}),
		},
	};
}

async function runContentSearch(params: {
	pattern: string;
	path?: string;
	glob?: string;
	limit?: number;
	offset?: number;
	output_mode?: "content" | "files_only" | "count";
	context?: number;
	ignoreCase?: boolean;
	literal?: boolean;
	cwd: string;
}) {
	const rgPath = await ensureTool("rg", true);
	if (!rgPath) {
		throw new Error("ripgrep (rg) is not available and could not be downloaded");
	}
	const searchPath = resolveToCwd(params.path || ".", params.cwd);
	const outputMode = params.output_mode ?? "content";
	const args: string[] = ["--hidden", "--color=never"];
	if (params.ignoreCase) args.push("--ignore-case");
	if (params.literal) args.push("--fixed-strings");
	if (params.glob) args.push("--glob", params.glob);
	if (outputMode === "files_only") {
		args.push("-l");
	} else if (outputMode === "count") {
		args.push("--count-matches");
	} else {
		args.push("--line-number");
		if ((params.context ?? 0) > 0) {
			args.push("-C", String(params.context));
		}
	}
	args.push(params.pattern, searchPath);

	const result = spawnSync(rgPath, args, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
	const stdout = result.stdout?.trim() || "";
	if (result.error) {
		throw new Error(`Failed to run rg: ${result.error.message}`);
	}
	if (!stdout && (result.status === 1 || result.status === 0)) {
		return {
			content: [{ type: "text" as const, text: "No matches found" }],
			details: {
				target: "content",
				output_mode: outputMode,
				total: 0,
				offset: params.offset ?? 0,
				limit: params.limit ?? 50,
			},
		};
	}
	if (result.status !== 0 && result.status !== 1 && !stdout) {
		throw new Error(result.stderr?.trim() || `rg exited with code ${result.status}`);
	}

	let rows = stdout.split(/\r?\n/).filter(Boolean);
	if (outputMode === "files_only" || outputMode === "count") {
		rows = rows.map(
			(row) =>
				rel(
					searchPath,
					path.isAbsolute(row.split(":")[0] || row)
						? row.split(":")[0]
						: path.join(searchPath, row.split(":")[0] || row),
				) + (outputMode === "count" && row.includes(":") ? `:${row.split(":").slice(1).join(":")}` : ""),
		);
		if (outputMode === "files_only") {
			rows = rows.map((row) => row.replace(/:$/, ""));
		}
	}
	const { page, total } = paginate(rows, params.offset, params.limit ?? 50);
	const notice = formatPageNotice(params.offset ?? 0, page.length, total);
	const bounded = page.length ? await formatBoundedOutput(page.join("\n"), "fs-search-content") : undefined;
	return {
		content: [
			{
				type: "text" as const,
				text: page.length
					? `${bounded!.text}${notice ? `\n\n${notice}` : ""}`
					: "No matches found",
			},
		],
		details: {
			target: "content",
			output_mode: outputMode,
			total,
			offset: params.offset ?? 0,
			limit: params.limit ?? 50,
			...(bounded?.truncation ? { truncation: bounded.truncation } : {}),
			...(bounded?.linesTruncated ? { linesTruncated: true } : {}),
			...(bounded?.fullOutputPath ? { fullOutputPath: bounded.fullOutputPath } : {}),
		},
	};
}

export default function fsSearchExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "fs_search",
		label: "FS Search",
		description:
			"Search filesystem paths or file contents with one tool. Supports content search, file listing, count mode, pagination, and context.",
		promptSnippet:
			"Search files or contents with pagination; use target='files' for path discovery and target='content' for exact matching",
		promptGuidelines: [
			"Prefer fs_search over grep/find/ls for exact codebase discovery when fs_search is available.",
			"Use fs_search target='files' for path discovery and target='content' for exact matches.",
			"Regex Search: use fs_search for finding exact strings, symbols, TODOs, or regex patterns when you know what textual shape to match.",
		],
		parameters: FsSearchParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if ((params.target ?? "content") === "files") {
				return runFileSearch({ ...params, cwd: ctx.cwd });
			}
			return runContentSearch({ ...params, cwd: ctx.cwd });
		},
		renderCall(args, theme) {
			const target = args.target ?? "content";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("fs_search"))} ${theme.fg("accent", target)} ${theme.fg("muted", args.pattern)}`,
				0,
				0,
			);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});
}
