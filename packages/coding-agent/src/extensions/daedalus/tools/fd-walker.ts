import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, type Stats, statSync } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";

export interface FdWalkerOptions {
	maxDepth?: number;
	maxFiles?: number;
	maxTotalBytes?: number;
	maxBreadth?: number;
	maxFileSizeBytes?: number;
	respectGitignore?: boolean;
}

export const FD_WALKER_DEFAULTS = {
	maxDepth: 5,
	maxFiles: 100,
	maxTotalBytes: 10 * 1024 * 1024,
	maxBreadth: 10,
	maxFileSizeBytes: 1024 * 1024,
	respectGitignore: true,
} as const;

interface IgnoreMatcher {
	baseDir: string;
	matcher: Ignore;
}

function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}

function isHiddenName(name: string): boolean {
	return name.startsWith(".");
}

function loadGitignore(dir: string): IgnoreMatcher | undefined {
	const filePath = path.join(dir, ".gitignore");
	if (!existsSync(filePath)) return undefined;
	try {
		return { baseDir: dir, matcher: ignore().add(readFileSync(filePath, "utf8")) };
	} catch {
		return undefined;
	}
}

function isIgnored(filePath: string, isDirectory: boolean, matchers: IgnoreMatcher[]): boolean {
	let ignored = false;
	for (const matcher of matchers) {
		const relative = toPosix(path.relative(matcher.baseDir, filePath));
		if (relative === "" || relative.startsWith("../")) continue;
		const result = matcher.matcher.test(isDirectory ? `${relative}/` : relative);
		if (result.ignored) ignored = true;
		if (result.unignored) ignored = false;
	}
	return ignored;
}

function looksBinary(filePath: string): boolean {
	try {
		const sample = readFileSync(filePath).subarray(0, 8192);
		return sample.includes(0);
	} catch {
		return true;
	}
}

export async function discoverViaWalker(cwd: string, options: FdWalkerOptions = {}): Promise<string[]> {
	const maxDepth = options.maxDepth ?? FD_WALKER_DEFAULTS.maxDepth;
	const maxFiles = options.maxFiles ?? FD_WALKER_DEFAULTS.maxFiles;
	const maxTotalBytes = options.maxTotalBytes ?? FD_WALKER_DEFAULTS.maxTotalBytes;
	const maxBreadth = options.maxBreadth ?? FD_WALKER_DEFAULTS.maxBreadth;
	const maxFileSizeBytes = options.maxFileSizeBytes ?? FD_WALKER_DEFAULTS.maxFileSizeBytes;
	const respectGitignore = options.respectGitignore ?? FD_WALKER_DEFAULTS.respectGitignore;
	const root = path.resolve(cwd);
	const files: string[] = [];
	let totalBytes = 0;

	const visit = (dir: string, depth: number, inheritedMatchers: IgnoreMatcher[]): void => {
		if (files.length >= maxFiles || depth > maxDepth) return;
		const matchers = respectGitignore ? [...inheritedMatchers] : inheritedMatchers;
		if (respectGitignore) {
			const gitignore = loadGitignore(dir);
			if (gitignore) matchers.push(gitignore);
		}
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return;
		}
		for (const entry of entries.slice(0, maxBreadth)) {
			if (files.length >= maxFiles || totalBytes >= maxTotalBytes) return;
			if (entry.name === ".git" || isHiddenName(entry.name)) continue;
			const absolutePath = path.join(dir, entry.name);
			let lstats: Stats;
			try {
				lstats = lstatSync(absolutePath);
			} catch {
				continue;
			}
			if (lstats.isSymbolicLink()) continue;
			const isDirectory = entry.isDirectory();
			if (respectGitignore && isIgnored(absolutePath, isDirectory, matchers)) continue;
			if (isDirectory) {
				visit(absolutePath, depth + 1, matchers);
				continue;
			}
			if (!entry.isFile()) continue;
			let stats: Stats;
			try {
				stats = statSync(absolutePath);
			} catch {
				continue;
			}
			if (stats.size > maxFileSizeBytes) continue;
			if (totalBytes + stats.size > maxTotalBytes) return;
			if (looksBinary(absolutePath)) continue;
			totalBytes += stats.size;
			files.push(path.resolve(absolutePath));
		}
	};

	visit(root, 0, []);
	return files.sort((a, b) => a.localeCompare(b));
}
