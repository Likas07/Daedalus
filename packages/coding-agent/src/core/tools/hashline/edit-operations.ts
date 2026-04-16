import { formatLineTag } from "./hash-computation.js";
import type { HashlineAnchor, HashlineApplyResult, HashlineEditOperation } from "./types.js";
import { validateTags } from "./validation.js";

interface AnnotatedEdit {
	edit: HashlineEditOperation;
	idx: number;
	sortLine: number;
	precedence: number;
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function getLocLabel(edit: HashlineEditOperation): string {
	switch (edit.op) {
		case "replace_line":
		case "append_at":
		case "prepend_at":
			return `${edit.pos.line}#${edit.pos.hash}`;
		case "replace_range":
			return `${edit.pos.line}#${edit.pos.hash}..${edit.end.line}#${edit.end.hash}`;
		case "append_file":
			return "EOF";
		case "prepend_file":
			return "BOF";
	}
}

function buildDedupeKey(edit: HashlineEditOperation): string {
	switch (edit.op) {
		case "replace_line":
			return `replace_line|${edit.pos.line}#${edit.pos.hash}|${edit.lines.join("\n")}`;
		case "replace_range":
			return `replace_range|${edit.pos.line}#${edit.pos.hash}|${edit.end.line}#${edit.end.hash}|${edit.lines.join("\n")}`;
		case "append_at":
			return `append_at|${edit.pos.line}#${edit.pos.hash}|${edit.lines.join("\n")}`;
		case "prepend_at":
			return `prepend_at|${edit.pos.line}#${edit.pos.hash}|${edit.lines.join("\n")}`;
		case "append_file":
			return `append_file|${edit.lines.join("\n")}`;
		case "prepend_file":
			return `prepend_file|${edit.lines.join("\n")}`;
	}
}

function dedupeEdits(edits: HashlineEditOperation[]): HashlineEditOperation[] {
	const seen = new Set<string>();
	const deduped: HashlineEditOperation[] = [];
	for (const edit of edits) {
		const key = buildDedupeKey(edit);
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(edit);
	}
	return deduped;
}

function detectConflicts(edits: HashlineEditOperation[], path: string): void {
	const consumedRanges: Array<{ start: number; end: number; idx: number }> = [];
	const anchoredInserts: Array<{ line: number; idx: number; kind: "append_at" | "prepend_at" }> = [];

	edits.forEach((edit, idx) => {
		switch (edit.op) {
			case "replace_line":
				consumedRanges.push({ start: edit.pos.line, end: edit.pos.line, idx });
				break;
			case "replace_range":
				consumedRanges.push({ start: edit.pos.line, end: edit.end.line, idx });
				break;
			case "append_at":
			case "prepend_at":
				anchoredInserts.push({ line: edit.pos.line, idx, kind: edit.op });
				break;
		}
	});

	consumedRanges.sort((a, b) => a.start - b.start || a.end - b.end);
	for (let i = 1; i < consumedRanges.length; i++) {
		const previous = consumedRanges[i - 1];
		const current = consumedRanges[i];
		if (current.start <= previous.end) {
			throw new Error(
				`edits[${previous.idx}] and edits[${current.idx}] overlap in ${path}. Merge them into one edit or target disjoint regions.`,
			);
		}
	}

	for (const insert of anchoredInserts) {
		for (const range of consumedRanges) {
			if (insert.line >= range.start && insert.line <= range.end) {
				throw new Error(
					`edits[${insert.idx}] targets line ${insert.line} inside replacement range edits[${range.idx}] in ${path}. Anchor inserts to surviving lines outside replaced ranges.`,
				);
			}
		}
	}
}

function collectRefs(edit: HashlineEditOperation): HashlineAnchor[] {
	switch (edit.op) {
		case "replace_line":
		case "append_at":
		case "prepend_at":
			return [edit.pos];
		case "replace_range":
			return [edit.pos, edit.end];
		case "append_file":
		case "prepend_file":
			return [];
	}
}

function getAnnotatedEdits(edits: HashlineEditOperation[], fileLineCount: number): AnnotatedEdit[] {
	return edits
		.map((edit, idx) => {
			switch (edit.op) {
				case "replace_line":
					return { edit, idx, sortLine: edit.pos.line, precedence: 0 };
				case "replace_range":
					return { edit, idx, sortLine: edit.end.line, precedence: 0 };
				case "append_at":
					return { edit, idx, sortLine: edit.pos.line, precedence: 1 };
				case "prepend_at":
					return { edit, idx, sortLine: edit.pos.line, precedence: 2 };
				case "append_file":
					return { edit, idx, sortLine: fileLineCount + 1, precedence: 1 };
				case "prepend_file":
					return { edit, idx, sortLine: 0, precedence: 2 };
				default:
					throw new Error(`Unsupported hashline edit operation: ${(edit as { op: string }).op}`);
			}
		})
		.sort((a, b) => b.sortLine - a.sortLine || a.precedence - b.precedence || a.idx - b.idx);
}

export function applyHashlineEditsToNormalizedContent(
	normalizedContent: string,
	edits: HashlineEditOperation[],
	path: string,
): HashlineApplyResult {
	const baseContent = normalizedContent;
	if (edits.length === 0) {
		return { baseContent, newContent: normalizedContent, firstChangedLine: undefined };
	}

	const fileLines = normalizedContent.split("\n");
	const originalFileLines = [...fileLines];
	const dedupedEdits = dedupeEdits(edits);
	const refs = dedupedEdits.flatMap((edit) => collectRefs(edit));
	validateTags(refs, originalFileLines);

	for (const edit of dedupedEdits) {
		if (edit.op === "replace_range" && edit.pos.line > edit.end.line) {
			throw new Error(`Range start line ${edit.pos.line} must be <= end line ${edit.end.line} in ${path}.`);
		}
		if (
			(edit.op === "append_at" ||
				edit.op === "prepend_at" ||
				edit.op === "append_file" ||
				edit.op === "prepend_file") &&
			edit.lines.length === 0
		) {
			throw new Error(`${edit.op} requires non-empty content in ${path}. Use [""] to insert a blank line.`);
		}
	}

	detectConflicts(dedupedEdits, path);

	const warnings: string[] = [];
	const noopEdits: Array<{ editIndex: number; loc: string; current: string }> = [];
	let firstChangedLine: number | undefined;

	for (const edit of dedupedEdits) {
		let endLine: number | undefined;
		switch (edit.op) {
			case "replace_line":
				endLine = edit.pos.line;
				break;
			case "replace_range":
				endLine = edit.end.line;
				break;
			default:
				break;
		}
		if (endLine === undefined || edit.lines.length === 0) continue;
		const nextSurviving = originalFileLines[endLine];
		const lastInserted = edit.lines[edit.lines.length - 1]?.trim();
		if (nextSurviving !== undefined && lastInserted && lastInserted === nextSurviving.trim()) {
			const nextTag = formatLineTag(endLine + 1, nextSurviving);
			warnings.push(
				`Possible boundary duplication: last replacement line \`${lastInserted}\` matches next surviving line ${nextTag}. If you meant to replace whole block, extend end to ${nextTag}.`,
			);
		}
	}

	const annotated = getAnnotatedEdits(dedupedEdits, fileLines.length);
	for (const { edit, idx } of annotated) {
		switch (edit.op) {
			case "replace_line": {
				const current = originalFileLines.slice(edit.pos.line - 1, edit.pos.line);
				if (arraysEqual(current, edit.lines)) {
					noopEdits.push({ editIndex: idx, loc: getLocLabel(edit), current: current.join("\n") });
					break;
				}
				fileLines.splice(edit.pos.line - 1, 1, ...edit.lines);
				if (firstChangedLine === undefined || edit.pos.line < firstChangedLine) firstChangedLine = edit.pos.line;
				break;
			}
			case "replace_range": {
				const current = originalFileLines.slice(edit.pos.line - 1, edit.end.line);
				if (arraysEqual(current, edit.lines)) {
					noopEdits.push({ editIndex: idx, loc: getLocLabel(edit), current: current.join("\n") });
					break;
				}
				fileLines.splice(edit.pos.line - 1, edit.end.line - edit.pos.line + 1, ...edit.lines);
				if (firstChangedLine === undefined || edit.pos.line < firstChangedLine) firstChangedLine = edit.pos.line;
				break;
			}
			case "append_at": {
				fileLines.splice(edit.pos.line, 0, ...edit.lines);
				const changedLine = edit.pos.line + 1;
				if (firstChangedLine === undefined || changedLine < firstChangedLine) firstChangedLine = changedLine;
				break;
			}
			case "prepend_at": {
				fileLines.splice(edit.pos.line - 1, 0, ...edit.lines);
				if (firstChangedLine === undefined || edit.pos.line < firstChangedLine) firstChangedLine = edit.pos.line;
				break;
			}
			case "append_file": {
				if (fileLines.length === 1 && fileLines[0] === "") {
					fileLines.splice(0, 1, ...edit.lines);
					if (firstChangedLine === undefined || 1 < firstChangedLine) firstChangedLine = 1;
				} else {
					fileLines.splice(fileLines.length, 0, ...edit.lines);
					const changedLine = fileLines.length - edit.lines.length + 1;
					if (firstChangedLine === undefined || changedLine < firstChangedLine) firstChangedLine = changedLine;
				}
				break;
			}
			case "prepend_file": {
				if (fileLines.length === 1 && fileLines[0] === "") {
					fileLines.splice(0, 1, ...edit.lines);
				} else {
					fileLines.splice(0, 0, ...edit.lines);
				}
				if (firstChangedLine === undefined || 1 < firstChangedLine) firstChangedLine = 1;
				break;
			}
		}
	}

	const newContent = fileLines.join("\n");
	return {
		baseContent,
		newContent,
		firstChangedLine,
		...(warnings.length > 0 ? { warnings } : {}),
		...(noopEdits.length > 0 ? { noopEdits } : {}),
	};
}

export { HashlineMismatchError } from "./validation.js";
