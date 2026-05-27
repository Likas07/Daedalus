import { discoverViaWalker, type FdWalkerOptions } from "./fd-walker.js";
import { discoverViaGit } from "./git-file-discovery.js";

export interface FdDefaultOptions {
	walker?: FdWalkerOptions;
	discoverGit?: (cwd: string) => Promise<string[] | undefined>;
	discoverWalker?: (cwd: string, options?: FdWalkerOptions) => Promise<string[]>;
}

export async function discoverFdDefault(cwd: string, options: FdDefaultOptions = {}): Promise<string[]> {
	const git = options.discoverGit ?? discoverViaGit;
	const walker = options.discoverWalker ?? discoverViaWalker;
	try {
		const gitFiles = await git(cwd);
		if (gitFiles && gitFiles.length > 0) return gitFiles;
	} catch (error) {
		console.warn("git-based file discovery failed, falling back to walker", error);
	}
	return walker(cwd, options.walker);
}
