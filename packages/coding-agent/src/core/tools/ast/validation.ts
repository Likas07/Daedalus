import { stat as fsStat } from "fs/promises";
import path from "path";
import { resolveToCwd } from "../path-utils.js";
import type { AstScope } from "./types.js";

export async function resolveAstScope(inputPath: string | undefined, cwd: string, glob?: string): Promise<AstScope> {
	const absolutePath = resolveToCwd(inputPath || ".", cwd);
	let stat;
	try {
		stat = await fsStat(absolutePath);
	} catch {
		throw new Error(`Path not found: ${absolutePath}`);
	}
	const isDirectory = stat.isDirectory();
	const displayRelative = path.relative(cwd, absolutePath).replace(/\\/g, "/");
	const displayPath = displayRelative.length === 0 ? "." : displayRelative;
	return {
		absolutePath,
		displayPath,
		cwd,
		isDirectory,
		commandCwd: isDirectory ? absolutePath : path.dirname(absolutePath),
		commandPaths: [isDirectory ? "." : path.basename(absolutePath)],
		glob: glob?.trim() || undefined,
	};
}

export function normalizePositiveInt(value: number | undefined, field: string, fallback: number): number {
	if (value === undefined) return fallback;
	const normalized = Math.floor(value);
	if (!Number.isFinite(normalized) || normalized < 1) {
		throw new Error(`${field} must be a positive number`);
	}
	return normalized;
}

export function normalizeNonNegativeInt(value: number | undefined, field: string, fallback: number): number {
	if (value === undefined) return fallback;
	const normalized = Math.floor(value);
	if (!Number.isFinite(normalized) || normalized < 0) {
		throw new Error(`${field} must be a non-negative number`);
	}
	return normalized;
}

export function normalizePatterns(patterns: string[]): string[] {
	const normalized = [...new Set(patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0))];
	if (normalized.length === 0) {
		throw new Error("`pat` must include at least one non-empty pattern");
	}
	return normalized;
}

export function normalizeRewriteOps(ops: Array<{ pat: string; out: string }>): Array<{ pat: string; out: string }> {
	if (ops.length === 0) throw new Error("`ops` must include at least one rewrite entry");
	const seen = new Set<string>();
	return ops.map((op, index) => {
		const pat = op.pat.trim();
		if (pat.length === 0) throw new Error(`ops[${index}].pat must be non-empty`);
		if (seen.has(pat)) throw new Error(`Duplicate rewrite pattern: ${pat}`);
		seen.add(pat);
		return { pat, out: op.out };
	});
}
