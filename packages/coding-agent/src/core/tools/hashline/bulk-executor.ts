import { dirname } from "node:path";
import type { NormalizedHashlineFileBatch } from "./bulk-input.js";
import { applyHashlineEditsToNormalizedContent } from "./edit-operations.js";
import { detectLineEnding, generateDiffString, normalizeToLF, restoreLineEndings, stripBom } from "../edit-diff.js";

export interface HashlineBatchFileOps {
	readFile: (absolutePath: string) => Promise<Buffer>;
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	access: (absolutePath: string) => Promise<void>;
	unlink: (absolutePath: string) => Promise<void>;
	rename: (fromAbsolutePath: string, toAbsolutePath: string) => Promise<void>;
	mkdir: (absolutePath: string) => Promise<void>;
}

export interface ExecuteHashlineFileBatchInput {
	path: string;
	absolutePath: string;
	batch: NormalizedHashlineFileBatch;
	ops: HashlineBatchFileOps;
	resolvePath: (path: string) => string;
}

export interface HashlineFileBatchResult {
	path: string;
	text: string;
	diff: string;
	firstChangedLine?: number;
	op: "update" | "create" | "delete" | "move";
	warnings?: string[];
	noopEdits?: Array<{ editIndex: number; loc: string; current: string }>;
}

function buildNoChangeDiagnostic(path: string, noopEdits?: Array<{ editIndex: number; loc: string; current: string }>): string {
	let diagnostic = `No changes made to ${path}. The edits produced identical content.`;
	if (noopEdits && noopEdits.length > 0) {
		diagnostic += ` No-op edits: ${noopEdits.map((edit) => `edits[${edit.editIndex}] at ${edit.loc}`).join(", ")}.`;
	}
	return diagnostic;
}

function isMissingFileError(error: unknown): boolean {
	return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

export async function executeHashlineFileBatch(input: ExecuteHashlineFileBatchInput): Promise<HashlineFileBatchResult> {
	const { path, absolutePath, batch, ops, resolvePath } = input;
	const deleteOps = batch.fileOps.filter((op) => op.op === "delete");
	const moveOps = batch.fileOps.filter((op) => op.op === "move");

	if (deleteOps.length > 1 || moveOps.length > 1) {
		throw new Error(`Only one delete or move operation is allowed per file: ${path}`);
	}
	if (deleteOps.length && (moveOps.length || batch.contentEdits.length)) {
		throw new Error(`delete cannot be combined with move or content edits: ${path}`);
	}

	if (deleteOps.length) {
		await ops.access(absolutePath);
		await ops.unlink(absolutePath);
		return { path, text: `Deleted ${path}`, diff: "", op: "delete" };
	}

	const moveTo = moveOps[0]?.op === "move" ? moveOps[0].to : undefined;
	const moveAbsolutePath = moveTo ? resolvePath(moveTo) : undefined;
	if (moveAbsolutePath === absolutePath) throw new Error(`move destination is the same as source: ${path}`);

	let rawContent = "";
	let exists = true;
	try {
		rawContent = (await ops.readFile(absolutePath)).toString("utf-8");
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
		exists = false;
	}

	if (!exists) {
		if (!batch.contentEdits.every((edit) => edit.op === "append_file" || edit.op === "prepend_file")) {
			throw new Error(`File not found: ${path}`);
		}
		const created = applyHashlineEditsToNormalizedContent("", batch.contentEdits, path);
		const writePath = moveAbsolutePath ?? absolutePath;
		await ops.mkdir(dirname(writePath));
		await ops.writeFile(writePath, created.newContent);
		return {
			path: moveTo ?? path,
			text: `Created ${moveTo ?? path}`,
			diff: "",
			firstChangedLine: 1,
			op: "create",
			warnings: created.warnings,
			noopEdits: created.noopEdits,
		};
	}

	const { bom, text } = stripBom(rawContent);
	const originalEnding = detectLineEnding(text);
	const normalizedContent = normalizeToLF(text);
	const applyResult = applyHashlineEditsToNormalizedContent(normalizedContent, batch.contentEdits, path);
	if (applyResult.baseContent === applyResult.newContent && !moveTo) {
		throw new Error(buildNoChangeDiagnostic(path, applyResult.noopEdits));
	}

	const finalContent = bom + restoreLineEndings(applyResult.newContent, originalEnding);
	const writePath = moveAbsolutePath ?? absolutePath;
	await ops.mkdir(dirname(writePath));
	await ops.writeFile(writePath, finalContent);
	if (moveAbsolutePath && moveAbsolutePath !== absolutePath) await ops.unlink(absolutePath);

	const diffResult = generateDiffString(applyResult.baseContent, applyResult.newContent);
	return {
		path: moveTo ?? path,
		text: moveTo ? `Moved ${path} to ${moveTo}` : `Updated ${path}`,
		diff: diffResult.diff,
		firstChangedLine: applyResult.firstChangedLine ?? diffResult.firstChangedLine,
		op: moveTo ? "move" : "update",
		warnings: applyResult.warnings,
		noopEdits: applyResult.noopEdits,
	};
}
