import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WorkspaceCleanupRisk, WorkspaceTarget } from "./types.js";

export type MergeBackOperationStatus = "clean" | "conflict" | "failed" | "applied" | "discarded" | "kept" | "skipped";

export interface MergeBackResult {
	status: MergeBackOperationStatus;
	message: string;
	stdout?: string;
	stderr?: string;
	patch?: string;
	artifactPath?: string;
	branchName?: string;
	files?: string[];
	conflicts?: string[];
	risk?: WorkspaceCleanupRisk;
}

export interface MergeBackInput {
	parent: WorkspaceTarget;
	child: WorkspaceTarget;
	baseRef?: string;
	artifactPath?: string;
	force?: boolean;
	branchName?: string;
	commitMessage?: string;
}

function runGit(
	cwd: string,
	args: string[],
	input?: string,
	env?: Record<string, string>,
): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		env: env ? { ...process.env, ...env } : undefined,
		stdin: input === undefined ? undefined : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		ok: result.exitCode === 0,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
		exitCode: result.exitCode,
	};
}

function base(input: MergeBackInput): string {
	return (
		input.baseRef ??
		input.child.baseCommit ??
		input.child.mergeBack?.baseCommit ??
		input.child.baseBranch ??
		input.parent.branch ??
		"HEAD"
	);
}

function filesFromNameStatus(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim().split(/\s+/).slice(1).join(" "))
		.filter(Boolean);
}

function filesFromPatch(text: string): string[] {
	const files = new Set<string>();
	for (const line of text.split("\n")) {
		const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
		if (!match) continue;
		files.add(match[2] || match[1]);
	}
	return [...files];
}

function conflicts(cwd: string): string[] {
	const result = runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function branchSafe(value: string): string {
	return (
		value
			.replace(/^refs\/heads\//, "")
			.replace(/[^A-Za-z0-9._/-]+/g, "-")
			.replace(/\/+/g, "/")
			.replace(/^[/.-]+|[/.-]+$/g, "") || "subagent"
	);
}

async function captureFinalTreePatch(input: MergeBackInput): Promise<MergeBackResult> {
	const ref = base(input);
	const tempIndex = join(tmpdir(), `daedalus-merge-index-${randomUUID()}`);
	try {
		const readTree = runGit(input.child.cwd, ["read-tree", ref], undefined, { GIT_INDEX_FILE: tempIndex });
		if (!readTree.ok)
			return {
				status: "failed",
				message: readTree.stderr.trim() || "baseline read failed",
				stderr: readTree.stderr,
			};

		const baselinePatch = input.child.mergeBack?.parentBaselinePatch;
		if (baselinePatch?.trim()) {
			const applyBaseline = runGit(input.child.cwd, ["apply", "--cached", "--binary"], baselinePatch, {
				GIT_INDEX_FILE: tempIndex,
			});
			if (!applyBaseline.ok)
				return {
					status: "failed",
					message: applyBaseline.stderr.trim() || "parent baseline staging failed",
					stderr: applyBaseline.stderr,
				};
		}

		const baselineTree = runGit(input.child.cwd, ["write-tree"], undefined, { GIT_INDEX_FILE: tempIndex });
		if (!baselineTree.ok)
			return {
				status: "failed",
				message: baselineTree.stderr.trim() || "baseline tree write failed",
				stderr: baselineTree.stderr,
			};

		const add = runGit(input.child.cwd, ["add", "-A", "--", "."], undefined, { GIT_INDEX_FILE: tempIndex });
		if (!add.ok)
			return { status: "failed", message: add.stderr.trim() || "delta staging failed", stderr: add.stderr };

		const diff = runGit(
			input.child.cwd,
			["diff", "--cached", "--binary", baselineTree.stdout.trim(), "--"],
			undefined,
			{
				GIT_INDEX_FILE: tempIndex,
			},
		);
		if (!diff.ok)
			return { status: "failed", message: diff.stderr.trim() || "patch capture failed", stderr: diff.stderr };

		return {
			status: "clean",
			message: diff.stdout.trim() ? "Patch captured." : "No changes to merge back.",
			patch: diff.stdout,
			files: filesFromPatch(diff.stdout),
		};
	} finally {
		await fs.rm(tempIndex, { force: true });
	}
}

export function inspectMergeBack(input: MergeBackInput): MergeBackResult {
	const ref = base(input);
	const stat = runGit(input.child.cwd, ["diff", "--stat", ref, "HEAD"]);
	if (!stat.ok)
		return { status: "failed", message: stat.stderr.trim() || "diff inspection failed", stderr: stat.stderr };
	const names = runGit(input.child.cwd, ["diff", "--name-status", ref, "HEAD"]);
	return {
		status: "clean",
		message: stat.stdout.trim() || "No committed changes to merge back.",
		stdout: stat.stdout,
		files: filesFromNameStatus(names.stdout),
	};
}

export async function captureMergeBackPatch(input: MergeBackInput): Promise<MergeBackResult> {
	const result = await captureFinalTreePatch(input);
	if (result.status === "failed") return result;
	if (input.artifactPath) {
		await fs.mkdir(dirname(input.artifactPath), { recursive: true });
		await fs.writeFile(input.artifactPath, result.patch ?? "", "utf8");
	}
	return {
		...result,
		message: input.artifactPath ? `Patch written to ${input.artifactPath}` : result.message,
		artifactPath: input.artifactPath,
	};
}

async function patchFor(input: MergeBackInput): Promise<string> {
	if (input.artifactPath) {
		try {
			return await fs.readFile(input.artifactPath, "utf8");
		} catch {
			// Fall through and re-capture when a stored artifact was not created yet.
		}
	}
	return (await captureMergeBackPatch(input)).patch ?? "";
}

export async function dryRunApplyMergeBack(input: MergeBackInput): Promise<MergeBackResult> {
	const patch = await patchFor(input);
	if (!patch.trim()) return { status: "clean", message: "No changes to apply.", artifactPath: input.artifactPath };
	const result = runGit(input.parent.cwd, ["apply", "--check"], patch);
	if (result.ok)
		return {
			status: "clean",
			message: "Patch applies cleanly.",
			stdout: result.stdout,
			artifactPath: input.artifactPath,
			files: filesFromPatch(patch),
		};
	return {
		status: "conflict",
		message: result.stderr.trim() || "Patch does not apply cleanly.",
		stderr: result.stderr,
		artifactPath: input.artifactPath,
		files: filesFromPatch(patch),
	};
}

export async function applyMergeBackPatch(input: MergeBackInput): Promise<MergeBackResult> {
	const patch = await patchFor(input);
	if (!patch.trim()) return { status: "clean", message: "No changes to apply.", artifactPath: input.artifactPath };
	const result = runGit(input.parent.cwd, ["apply"], patch);
	if (result.ok)
		return {
			status: "applied",
			message: "Patch applied.",
			stdout: result.stdout,
			artifactPath: input.artifactPath,
			files: filesFromPatch(patch),
		};
	return {
		status: "conflict",
		message: result.stderr.trim() || "Patch apply failed.",
		stderr: result.stderr,
		artifactPath: input.artifactPath,
		files: filesFromPatch(patch),
	};
}

function defaultTaskBranch(input: MergeBackInput): string {
	const childPart = input.child.branch ? branchSafe(input.child.branch).split("/").slice(-1)[0] : "subagent";
	return `daedalus/subagent-results/${childPart}-${randomUUID().slice(0, 8)}`;
}

function parentHasLocalChanges(cwd: string): MergeBackResult | boolean {
	const status = runGit(cwd, ["status", "--porcelain"]);
	if (!status.ok) {
		return {
			status: "failed",
			message: status.stderr.trim() || "Failed to inspect parent working tree.",
			stderr: status.stderr,
		};
	}
	return Boolean(status.stdout.trim());
}

function stashParentChanges(cwd: string, message: string): MergeBackResult | boolean {
	const dirty = parentHasLocalChanges(cwd);
	if (typeof dirty !== "boolean") return dirty;
	if (!dirty) return false;
	const stash = runGit(cwd, ["stash", "push", "--include-untracked", "--message", message]);
	if (!stash.ok) {
		return {
			status: "conflict",
			message: stash.stderr.trim() || "Failed to stash dirty parent workspace before branch replay.",
			stderr: stash.stderr,
		};
	}
	return !/No local changes to save/i.test(stash.stdout);
}

function popParentStash(cwd: string): MergeBackResult | undefined {
	const pop = runGit(cwd, ["stash", "pop", "--index"]);
	if (pop.ok) return undefined;
	return {
		status: "conflict",
		message:
			pop.stderr.trim() ||
			"Stash pop conflicted after branch replay; task branch and patch artifact were preserved for recovery.",
		stderr: pop.stderr,
		stdout: pop.stdout,
		conflicts: conflicts(cwd),
	};
}

export async function createTaskBranchMergeBack(input: MergeBackInput): Promise<MergeBackResult> {
	const patchResult = await captureMergeBackPatch(input);
	if (patchResult.status === "failed") return patchResult;
	const patch = patchResult.patch ?? "";
	if (!patch.trim()) {
		return { ...patchResult, status: "clean", message: "No changes to merge back." };
	}

	const ref = base(input);
	const branchName = input.branchName ?? defaultTaskBranch(input);
	const createBranch = runGit(input.parent.cwd, ["branch", branchName, ref]);
	if (!createBranch.ok) {
		return {
			...patchResult,
			status: "failed",
			message: createBranch.stderr.trim() || `Failed to create merge-back branch ${branchName}.`,
			stderr: createBranch.stderr,
			branchName,
		};
	}

	const tempDir = await fs.mkdtemp(join(tmpdir(), "daedalus-merge-branch-"));
	let worktreeAdded = false;
	let commitStdout = "";
	try {
		const addWorktree = runGit(input.parent.cwd, ["worktree", "add", tempDir, branchName]);
		if (!addWorktree.ok) {
			return {
				...patchResult,
				status: "failed",
				message: addWorktree.stderr.trim() || "Failed to create temporary merge-back worktree.",
				stderr: addWorktree.stderr,
				branchName,
			};
		}
		worktreeAdded = true;

		const apply = runGit(tempDir, ["apply", "--binary"], patch);
		if (!apply.ok) {
			return {
				...patchResult,
				status: "conflict",
				message:
					apply.stderr.trim() ||
					`Task patch did not apply to clean branch ${branchName}; branch and patch artifact were preserved.`,
				stderr: apply.stderr,
				branchName,
			};
		}
		const add = runGit(tempDir, ["add", "-A", "--", "."]);
		if (!add.ok) {
			return {
				...patchResult,
				status: "failed",
				message: add.stderr.trim() || "Failed to stage merge-back branch changes.",
				stderr: add.stderr,
				branchName,
			};
		}
		const commit = runGit(tempDir, ["commit", "-m", input.commitMessage ?? "Apply subagent result"]);
		if (!commit.ok) {
			return {
				...patchResult,
				status: "failed",
				message: commit.stderr.trim() || "Failed to commit merge-back branch.",
				stderr: commit.stderr,
				branchName,
			};
		}
		commitStdout = commit.stdout;
	} finally {
		if (worktreeAdded) runGit(input.parent.cwd, ["worktree", "remove", "--force", tempDir]);
		await fs.rm(tempDir, { recursive: true, force: true });
	}

	const stashed = stashParentChanges(input.parent.cwd, `daedalus merge-back ${branchName}`);
	if (typeof stashed !== "boolean") return { ...patchResult, ...stashed, branchName };

	let replayResult: MergeBackResult | undefined;
	const cherryPick = runGit(input.parent.cwd, ["cherry-pick", branchName]);
	if (!cherryPick.ok) {
		const replayConflicts = conflicts(input.parent.cwd);
		runGit(input.parent.cwd, ["cherry-pick", "--abort"]);
		replayResult = {
			...patchResult,
			status: "conflict",
			message:
				cherryPick.stderr.trim() ||
				`Cherry-pick from task branch ${branchName} conflicted; branch and patch artifact were preserved.`,
			stderr: cherryPick.stderr,
			conflicts: replayConflicts,
			branchName,
		};
	}

	if (stashed) {
		const popConflict = popParentStash(input.parent.cwd);
		if (popConflict) {
			return {
				...patchResult,
				...popConflict,
				message: replayResult ? `${replayResult.message}\n${popConflict.message}` : popConflict.message,
				branchName,
			};
		}
	}

	if (replayResult) return replayResult;
	return {
		...patchResult,
		status: "applied",
		message: `Task branch ${branchName} created and cherry-picked into parent.`,
		stdout: [commitStdout, cherryPick.stdout].filter(Boolean).join("\n"),
		branchName,
	};
}

export function cherryPickMergeBack(input: MergeBackInput): MergeBackResult {
	const result = runGit(input.parent.cwd, ["cherry-pick", `${base(input)}..${input.child.branch ?? "HEAD"}`]);
	if (result.ok) return { status: "applied", message: "Cherry-pick applied.", stdout: result.stdout };
	return {
		status: "conflict",
		message: result.stderr.trim() || "Cherry-pick conflicted.",
		stderr: result.stderr,
		conflicts: conflicts(input.parent.cwd),
	};
}

export function mergeBranchMergeBack(input: MergeBackInput): MergeBackResult {
	if (!input.child.branch) return { status: "failed", message: "Child target has no branch to merge." };
	const result = runGit(input.parent.cwd, ["merge", "--no-ff", input.child.branch]);
	if (result.ok) return { status: "applied", message: "Branch merged.", stdout: result.stdout };
	return {
		status: "conflict",
		message: result.stderr.trim() || "Merge conflicted.",
		stderr: result.stderr,
		conflicts: conflicts(input.parent.cwd),
	};
}

export function assessCleanupRisk(target: WorkspaceTarget): WorkspaceCleanupRisk {
	if (target.isolationMode !== "dedicated_worktree")
		return { safe: false, level: "external", reasons: ["Target is not a dedicated child worktree."] };
	const status = runGit(target.cwd, ["status", "--porcelain"]);
	if (!status.ok) return { safe: false, level: "missing", reasons: ["Target is missing or not a git worktree."] };
	if (status.stdout.trim())
		return { safe: false, level: "dirty", reasons: ["Target has uncommitted changes."], dirtyStatus: status.stdout };
	return { safe: true, level: "safe", reasons: [] };
}

export function discardChildTarget(input: MergeBackInput): MergeBackResult {
	const risk = assessCleanupRisk(input.child);
	if (!risk.safe && !input.force)
		return { status: "failed", message: "Refusing to discard risky child target.", risk };
	const result = runGit(input.parent.cwd, [
		"worktree",
		"remove",
		...(input.force ? ["--force"] : []),
		input.child.cwd,
	]);
	return result.ok
		? { status: "discarded", message: "Child target discarded.", risk }
		: { status: "failed", message: result.stderr.trim() || "Discard failed.", stderr: result.stderr, risk };
}

export function keepChildTarget(_input: MergeBackInput): MergeBackResult {
	return { status: "kept", message: "Child target kept for manual follow-up." };
}

export function cleanupTarget(input: MergeBackInput): MergeBackResult {
	return discardChildTarget(input);
}
