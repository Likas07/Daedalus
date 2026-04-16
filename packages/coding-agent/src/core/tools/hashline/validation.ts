import { HASHLINE_REF_RE } from "./constants.js";
import { computeLineHash } from "./hash-computation.js";
import type { HashlineAnchor, HashlineMismatch } from "./types.js";

const MISMATCH_CONTEXT = 2;

export function parseTag(ref: string): HashlineAnchor {
	const normalized = normalizeTag(ref);
	const match = normalized.match(HASHLINE_REF_RE);
	if (!match) {
		throw new Error(`Invalid line reference "${ref}". Expected format "LINE#ID".`);
	}
	const line = Number.parseInt(match[1], 10);
	if (line < 1) {
		throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`);
	}
	return { line, hash: match[2] };
}

export function normalizeTag(ref: string): string {
	const original = ref.trim();
	let normalized = original.replace(/^(?:>>>|>>|[>+-])\s*/, "");
	normalized = normalized.replace(/\s*#\s*/, "#");
	normalized = normalized.replace(/[:|].*$/, "").trim();
	const extracted = normalized.match(/(\d+\s*#\s*[ZPMQVRWSNKTXJBYH]{2})/);
	if (extracted) {
		return extracted[1].replace(/\s*#\s*/, "#");
	}
	return normalized;
}

export class HashlineMismatchError extends Error {
	readonly remaps: ReadonlyMap<string, string>;

	constructor(
		public readonly mismatches: HashlineMismatch[],
		public readonly fileLines: string[],
	) {
		super(HashlineMismatchError.formatMessage(mismatches, fileLines));
		this.name = "HashlineMismatchError";
		const remaps = new Map<string, string>();
		for (const mismatch of mismatches) {
			const actual = computeLineHash(mismatch.line, fileLines[mismatch.line - 1] ?? "");
			remaps.set(`${mismatch.line}#${mismatch.expected}`, `${mismatch.line}#${actual}`);
		}
		this.remaps = remaps;
	}

	static formatMessage(mismatches: HashlineMismatch[], fileLines: string[]): string {
		const mismatchByLine = new Map<number, HashlineMismatch>();
		for (const mismatch of mismatches) mismatchByLine.set(mismatch.line, mismatch);

		const displayLines = new Set<number>();
		for (const mismatch of mismatches) {
			const low = Math.max(1, mismatch.line - MISMATCH_CONTEXT);
			const high = Math.min(fileLines.length, mismatch.line + MISMATCH_CONTEXT);
			for (let line = low; line <= high; line++) displayLines.add(line);
		}

		const output: string[] = [];
		output.push(
			`${mismatches.length} line${mismatches.length === 1 ? " has" : "s have"} changed since last read. Use updated LINE#ID references shown below (>>> marks changed lines).`,
		);
		output.push("");

		let previousLine = -1;
		for (const line of [...displayLines].sort((a, b) => a - b)) {
			if (previousLine !== -1 && line > previousLine + 1) {
				output.push("    ...");
			}
			previousLine = line;

			const content = fileLines[line - 1] ?? "";
			const prefix = `${line}#${computeLineHash(line, content)}`;
			output.push(`${mismatchByLine.has(line) ? ">>>" : "   "} ${prefix}:${content}`);
		}

		return output.join("\n");
	}
}

export function validateTag(ref: HashlineAnchor, fileLines: string[]): void {
	if (ref.line < 1 || ref.line > fileLines.length) {
		throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`);
	}
	const actualHash = computeLineHash(ref.line, fileLines[ref.line - 1]);
	if (actualHash !== ref.hash) {
		throw new HashlineMismatchError([{ line: ref.line, expected: ref.hash, actual: actualHash }], fileLines);
	}
}

export function validateTags(refs: HashlineAnchor[], fileLines: string[]): void {
	const mismatches: HashlineMismatch[] = [];
	for (const ref of refs) {
		if (ref.line < 1 || ref.line > fileLines.length) {
			throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`);
		}
		const actualHash = computeLineHash(ref.line, fileLines[ref.line - 1]);
		if (actualHash !== ref.hash) {
			mismatches.push({ line: ref.line, expected: ref.hash, actual: actualHash });
		}
	}
	if (mismatches.length > 0) {
		throw new HashlineMismatchError(mismatches, fileLines);
	}
}
