import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

export interface ComposerFileSearchResult {
	readonly path: string;
	readonly label: string;
	readonly kind: "file" | "directory";
	readonly extension?: string;
}

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".svelte-kit",
	".next",
	"coverage",
	".daedalus",
]);

export class FileSearchService {
	async search(input: { cwd: string; query: string; limit: number }): Promise<ComposerFileSearchResult[]> {
		const root = resolve(input.cwd);
		const needle = input.query.trim().toLowerCase();
		const limit = Math.max(1, Math.min(input.limit, 50));
		const results: ComposerFileSearchResult[] = [];
		const walk = async (dir: string, depth: number): Promise<void> => {
			if (results.length >= limit || depth > 6) return;
			let entries: Array<{ name: string; isDirectory(): boolean }>;
			try {
				entries = await readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
				if (results.length >= limit) return;
				if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
				const absolute = join(dir, entry.name);
				const path = relative(root, absolute);
				const haystack = path.toLowerCase();
				if (!needle || haystack.includes(needle)) {
					results.push({
						path,
						label: entry.name,
						kind: entry.isDirectory() ? "directory" : "file",
						extension: entry.isDirectory() ? undefined : extname(entry.name).slice(1) || undefined,
					});
				}
				if (entry.isDirectory()) await walk(absolute, depth + 1);
			}
		};
		await walk(root, 0);
		return results;
	}
}
