import { realpathSync } from "node:fs";

export interface GitWorktreeEntry {
	path: string;
	head?: string;
	branch?: string;
	detached?: boolean;
	bare?: boolean;
}

export interface GitStatusSummary {
	clean: boolean;
	porcelain: string;
}

export interface GitRunOptions {
	cwd: string;
	allowFailure?: boolean;
}

export class GitError extends Error {
	constructor(
		message: string,
		readonly command: string[],
		readonly cwd: string,
		readonly exitCode: number,
		readonly stderr: string,
	) {
		super(message);
		this.name = "GitError";
	}
}

function runGit(args: string[], options: GitRunOptions): string {
	const result = Bun.spawnSync(["git", ...args], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
	const stdout = result.stdout.toString().trimEnd();
	const stderr = result.stderr.toString().trimEnd();
	if (result.exitCode !== 0 && !options.allowFailure) {
		throw new GitError(
			stderr || `git ${args.join(" ")} failed`,
			["git", ...args],
			options.cwd,
			result.exitCode,
			stderr,
		);
	}
	return stdout;
}

function realpathIfExists(path: string): string {
	try {
		return realpathSync(path);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return path;
		}
		throw error;
	}
}

export function gitRevParse(cwd: string, ref: string): string {
	return runGit(["rev-parse", ref], { cwd });
}

export function gitRepositoryRoot(cwd: string): string {
	return realpathSync(runGit(["rev-parse", "--show-toplevel"], { cwd }));
}

export function gitCommonDir(cwd: string): string {
	return realpathSync(runGit(["rev-parse", "--git-common-dir"], { cwd }));
}

export function gitCurrentBranch(cwd: string): string | undefined {
	const branch = runGit(["branch", "--show-current"], { cwd });
	return branch || undefined;
}

export function gitStatus(cwd: string): GitStatusSummary {
	const porcelain = runGit(["status", "--porcelain"], { cwd });
	return { clean: porcelain.length === 0, porcelain };
}

export function gitDiff(cwd: string, args: string[] = []): string {
	return runGit(["diff", ...args], { cwd });
}

export function gitApply(cwd: string, patch: string): void {
	const result = Bun.spawnSync(["git", "apply"], {
		cwd,
		stdin: new TextEncoder().encode(patch),
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new GitError(
			result.stderr.toString().trimEnd() || "git apply failed",
			["git", "apply"],
			cwd,
			result.exitCode,
			result.stderr.toString().trimEnd(),
		);
	}
}

function realpathIfExists(path: string): string {
	try {
		return realpathSync(path);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return path;
		throw error;
	}
}

export function gitWorktreeList(cwd: string): GitWorktreeEntry[] {
	const output = runGit(["worktree", "list", "--porcelain"], { cwd });
	const entries: GitWorktreeEntry[] = [];
	let current: GitWorktreeEntry | undefined;
	for (const line of output.split("\n")) {
		if (!line) {
			if (current) entries.push(current);
			current = undefined;
			continue;
		}
		const [key, ...rest] = line.split(" ");
		const value = rest.join(" ");
		if (key === "worktree") current = { path: realpathIfExists(value) };
		else if (current && key === "HEAD") current.head = value;
		else if (current && key === "branch") current.branch = value.replace(/^refs\/heads\//, "");
		else if (current && key === "detached") current.detached = true;
		else if (current && key === "bare") current.bare = true;
	}
	if (current) entries.push(current);
	return entries;
}

export function gitWorktreeAdd(cwd: string, path: string, branch: string, baseRef = "HEAD"): void {
	runGit(["worktree", "add", "-b", branch, path, baseRef], { cwd });
}

export function gitWorktreeRemove(cwd: string, path: string, force = false): void {
	runGit(["worktree", "remove", ...(force ? ["--force"] : []), path], { cwd });
}
