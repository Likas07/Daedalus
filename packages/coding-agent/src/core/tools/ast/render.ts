import { readFile as fsReadFile } from "fs/promises";
import path from "path";
import { formatLineTag } from "../hashline/index.js";
import type { AstEditChange, AstMatch } from "./types.js";

function rel(file: string): string {
	return file.replace(/\\/g, "/");
}

function trimEndEmpty(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end--;
	return lines.slice(0, end);
}

export async function summarizeAstMatches(matches: AstMatch[], cwd: string): Promise<Map<string, string[]>> {
	const grouped = new Map<string, string[]>();
	for (const match of matches) {
		const normalizedFile = rel(path.isAbsolute(match.file) ? path.relative(cwd, match.file) : match.file);
		if (!grouped.has(normalizedFile)) {
			const filePath = path.isAbsolute(match.file) ? match.file : path.join(cwd, match.file);
			const fileText = await fsReadFile(filePath, "utf-8");
			grouped.set(normalizedFile, fileText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n"));
		}
	}
	return grouped;
}

export async function formatAstSearchResults(matches: AstMatch[], cwd: string, context: number): Promise<string> {
	if (matches.length === 0) return "No matches found";
	const fileLines = await summarizeAstMatches(matches, cwd);
	const output: string[] = [];
	const byFile = new Map<string, AstMatch[]>();
	for (const match of matches) {
		const file = rel(path.isAbsolute(match.file) ? path.relative(cwd, match.file) : match.file);
		if (!byFile.has(file)) byFile.set(file, []);
		byFile.get(file)!.push(match);
	}
	for (const [file, fileMatches] of byFile) {
		if (output.length > 0) output.push("");
		output.push(`# ${file}`);
		const lines = fileLines.get(file) ?? [];
		for (const match of fileMatches) {
			const startLine = match.range.start.line + 1;
			const endLine = match.range.end.line + 1;
			const from = Math.max(1, startLine - context);
			const to = Math.min(lines.length, Math.max(startLine, endLine) + context);
			for (let lineNumber = from; lineNumber <= to; lineNumber++) {
				const line = lines[lineNumber - 1] ?? "";
				const prefix = lineNumber >= startLine && lineNumber <= Math.max(startLine, endLine) ? ":" : "-";
				output.push(`${formatLineTag(lineNumber, line)}${prefix}${line}`);
			}
			const singles = match.metaVariables?.single ? Object.entries(match.metaVariables.single) : [];
			if (singles.length > 0) {
				output.push(`  meta: ${singles.map(([key, value]) => `${key}=${value.text}`).join(", ")}`);
			}
		}
	}
	return trimEndEmpty(output).join("\n");
}

export function formatAstEditPreview(changes: AstEditChange[]): string {
	if (changes.length === 0) return "No replacements made";
	const output: string[] = [];
	for (const change of changes) {
		if (output.length > 0) output.push("");
		output.push(`# ${change.path} (${change.count} replacement${change.count === 1 ? "" : "s"})`);
		output.push(`-${change.startLine}:${change.before}`);
		output.push(`+${change.startLine}:${change.after}`);
	}
	return output.join("\n");
}
