import type {
	SafeCommitResult,
	WorkflowChangedFile,
	WorkflowFileStatus,
	WorkflowRiskGroup,
} from "@daedalus-pi/app-server-protocol";

export interface GitResult {
	readonly stdout: string;
	readonly stderr: string;
}

export interface GitStatusSummary {
	readonly branch: string | null;
	readonly upstream: string | null;
	readonly ahead: number;
	readonly behind: number;
	readonly stagedCount: number;
	readonly unstagedCount: number;
	readonly files: readonly WorkflowChangedFile[];
}

export async function git(
	cwd: string,
	args: readonly string[],
	options: { readonly env?: Record<string, string> } = {},
): Promise<GitResult> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		env: { ...process.env, ...options.env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${stderr.trim() || stdout.trim()}`);
	}
	return { stdout, stderr };
}

export async function gitStatus(cwd: string): Promise<GitStatusSummary> {
	const [branch, porcelain] = await Promise.all([
		git(cwd, ["status", "--porcelain=v2", "--branch"]),
		git(cwd, ["status", "--porcelain=v1", "--renames"]),
	]);
	return { ...parseBranchStatus(branch.stdout), ...parsePorcelainStatus(porcelain.stdout) };
}

export async function stageFiles(cwd: string, paths: readonly string[]): Promise<GitStatusSummary> {
	await git(cwd, ["add", "--", ...paths]);
	return gitStatus(cwd);
}

export async function unstageFiles(cwd: string, paths: readonly string[]): Promise<GitStatusSummary> {
	await git(cwd, ["restore", "--staged", "--", ...paths]);
	return gitStatus(cwd);
}

export async function discardFiles(cwd: string, paths: readonly string[]): Promise<GitStatusSummary> {
	await git(cwd, ["restore", "--worktree", "--", ...paths]);
	return gitStatus(cwd);
}

export async function safeCommit(input: {
	readonly cwd: string;
	readonly message: string;
	readonly allowWithActiveSessions?: boolean;
	readonly activeSessionCount?: number;
}): Promise<SafeCommitResult> {
	const warnings = input.activeSessionCount
		? [`${input.activeSessionCount} active session(s) may still be editing this worktree.`]
		: [];
	if (warnings.length > 0 && !input.allowWithActiveSessions) return { committed: false, warnings };
	const result = await git(input.cwd, ["commit", "-m", input.message]);
	const match = /\[[^\]]+ ([a-f0-9]+)\]/.exec(result.stdout);
	return { committed: true, commit: match?.[1], warnings };
}

export function parseBranchStatus(output: string): Pick<GitStatusSummary, "branch" | "upstream" | "ahead" | "behind"> {
	let branch: string | null = null;
	let upstream: string | null = null;
	let ahead = 0;
	let behind = 0;
	for (const line of output.split("\n")) {
		if (line.startsWith("# branch.head ")) branch = line.slice(14) === "(detached)" ? null : line.slice(14);
		else if (line.startsWith("# branch.upstream ")) upstream = line.slice(18);
		else if (line.startsWith("# branch.ab ")) {
			const [, aheadText, behindText] = /\+(\d+) -(\d+)/.exec(line) ?? [];
			ahead = Number(aheadText ?? 0);
			behind = Number(behindText ?? 0);
		}
	}
	return { branch, upstream, ahead, behind };
}

export function parsePorcelainStatus(
	output: string,
): Pick<GitStatusSummary, "stagedCount" | "unstagedCount" | "files"> {
	const files: WorkflowChangedFile[] = [];
	for (const line of output.split("\n").filter(Boolean)) {
		const x = line[0] ?? " ";
		const y = line[1] ?? " ";
		const rawPath = line.slice(3);
		const [previousPath, path] = rawPath.includes(" -> ") ? rawPath.split(" -> ") : [undefined, rawPath];
		const code = x !== " " && x !== "?" ? x : y;
		files.push({
			path: path ?? rawPath,
			previousPath,
			status: statusCodeToName(code),
			staged: x !== " " && x !== "?",
			insertions: 0,
			deletions: 0,
			riskGroup: riskGroupForPath(path ?? rawPath),
		});
	}
	return {
		stagedCount: files.filter((file) => file.staged).length,
		unstagedCount: files.filter((file) => !file.staged).length,
		files,
	};
}

function statusCodeToName(code: string): WorkflowFileStatus {
	switch (code) {
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		case "?":
			return "untracked";
		case "U":
			return "conflicted";
		default:
			return "modified";
	}
}

export function riskGroupForPath(path: string): WorkflowRiskGroup {
	if (/\.env|secret|credential|token/i.test(path)) return "secrets";
	if (/lock|bun\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock/i.test(path)) return "lockfiles";
	if (/\.config|config|tsconfig|biome|eslint|vite|svelte\.config/i.test(path)) return "config";
	if (/\.test\.|\.spec\.|__tests__|test\//i.test(path)) return "tests";
	if (/\.md$|docs\//i.test(path)) return "docs";
	if (/generated|dist\//i.test(path)) return "generated";
	if (/\.(ts|tsx|js|jsx|svelte|css|rs|go|py)$/i.test(path)) return "source";
	return "other";
}

export function sanitizeRefPart(value: string): string {
	const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
	if (!sanitized || sanitized === "." || sanitized === ".." || sanitized.includes("..")) {
		throw new Error(`Invalid ref component: ${value}`);
	}
	return sanitized;
}
