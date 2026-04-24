import {
	cp as fsCp,
	mkdtemp as fsMkdtemp,
	readdir as fsReaddir,
	readFile as fsReadFile,
	stat as fsStat,
} from "fs/promises";
import os from "os";
import path from "path";
import { detectLineEnding, generateDiffString, normalizeToLF, restoreLineEndings, stripBom } from "../edit-diff.js";
import type { AstEditChange, AstFileSnapshot, AstMatch, AstScope } from "./types.js";

export interface AstWorkspace {
	rootDir: string;
	scopePath: string;
	tempBasePath: string;
	files: Map<string, AstFileSnapshot>;
}

function byteOffsetToIndex(text: string, byteOffset: number): number {
	if (byteOffset <= 0) return 0;
	let bytes = 0;
	for (let index = 0; index < text.length; index++) {
		const code = text.codePointAt(index)!;
		const char = String.fromCodePoint(code);
		const size = Buffer.byteLength(char, "utf-8");
		if (bytes >= byteOffset) return index;
		bytes += size;
		if (bytes >= byteOffset) return index + char.length;
		if (char.length === 2) index++;
	}
	return text.length;
}

export function applyAstReplacementGroups(content: string, matches: AstMatch[]): string {
	const sorted = [...matches].sort((left, right) => right.range.byteOffset.start - left.range.byteOffset.start);
	let nextContent = content;
	for (const match of sorted) {
		const replacement = match.replacement ?? "";
		const start = byteOffsetToIndex(nextContent, match.range.byteOffset.start);
		const end = byteOffsetToIndex(nextContent, match.range.byteOffset.end);
		nextContent = nextContent.slice(0, start) + replacement + nextContent.slice(end);
	}
	return nextContent;
}

async function collectOriginalFilesRecursive(
	root: string,
	base: string,
	out: Map<string, AstFileSnapshot>,
): Promise<void> {
	const entries = await fsReaddir(root, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			await collectOriginalFilesRecursive(absolutePath, base, out);
			continue;
		}
		if (!entry.isFile()) continue;
		const raw = await fsReadFile(absolutePath, "utf-8");
		const { bom, text } = stripBom(raw);
		const relativePath = path.relative(base, absolutePath).replace(/\\/g, "/");
		out.set(relativePath, {
			absolutePath,
			relativePath,
			originalContent: raw,
			bom,
			originalEnding: detectLineEnding(text),
			normalizedContent: normalizeToLF(text),
		});
	}
}

export async function createTempAstWorkspace(scope: AstScope): Promise<AstWorkspace> {
	const rootDir = await fsMkdtemp(path.join(os.tmpdir(), "daedalus-ast-"));
	const scopeName = path.basename(scope.absolutePath) || "scope";
	const scopePath = path.join(rootDir, scopeName);
	await fsCp(scope.absolutePath, scopePath, { recursive: true, force: true });

	const files = new Map<string, AstFileSnapshot>();
	if (scope.isDirectory) {
		await collectOriginalFilesRecursive(scope.absolutePath, scope.absolutePath, files);
	} else {
		const raw = await fsReadFile(scope.absolutePath, "utf-8");
		const { bom, text } = stripBom(raw);
		const relativePath = path.basename(scope.absolutePath);
		files.set(relativePath, {
			absolutePath: scope.absolutePath,
			relativePath,
			originalContent: raw,
			bom,
			originalEnding: detectLineEnding(text),
			normalizedContent: normalizeToLF(text),
		});
	}

	const tempBasePath = scope.isDirectory ? scopePath : path.dirname(scopePath);
	for (const snapshot of files.values()) {
		const tempPath = path.join(tempBasePath, snapshot.relativePath);
		await Bun.write(tempPath, snapshot.normalizedContent);
	}

	return { rootDir, scopePath, tempBasePath, files };
}

export async function finalizeAstWorkspace(workspace: AstWorkspace): Promise<{
	changes: AstEditChange[];
	diff: string;
	firstChangedLine?: number;
	changedFiles: Array<{ absolutePath: string; content: string; originalContent: string }>;
}> {
	const changedFiles: Array<{ absolutePath: string; content: string; originalContent: string }> = [];
	const changes: AstEditChange[] = [];
	let combinedDiff = "";
	let firstChangedLine: number | undefined;

	for (const snapshot of workspace.files.values()) {
		const tempPath = path.join(workspace.tempBasePath, snapshot.relativePath);
		const newNormalized = await fsReadFile(tempPath, "utf-8").catch(() => snapshot.normalizedContent);
		if (newNormalized === snapshot.normalizedContent) continue;
		const finalContent = snapshot.bom + restoreLineEndings(newNormalized, snapshot.originalEnding);
		changedFiles.push({
			absolutePath: snapshot.absolutePath,
			content: finalContent,
			originalContent: snapshot.originalContent,
		});
		const diffResult = generateDiffString(snapshot.normalizedContent, newNormalized);
		if (
			firstChangedLine === undefined ||
			(diffResult.firstChangedLine ?? Number.MAX_SAFE_INTEGER) < firstChangedLine
		) {
			firstChangedLine = diffResult.firstChangedLine;
		}
		combinedDiff += (combinedDiff ? "\n" : "") + diffResult.diff;
		const changeLine = diffResult.firstChangedLine ?? 1;
		const beforeLine = snapshot.normalizedContent.split("\n")[Math.max(0, changeLine - 1)] ?? "";
		const afterLine = newNormalized.split("\n")[Math.max(0, changeLine - 1)] ?? "";
		const stats = await fsStat(tempPath).catch(() => null);
		changes.push({
			path: snapshot.relativePath,
			count: stats ? 1 : 1,
			before: beforeLine,
			after: afterLine,
			startLine: changeLine,
		});
	}

	return { changes, diff: combinedDiff, firstChangedLine, changedFiles };
}
