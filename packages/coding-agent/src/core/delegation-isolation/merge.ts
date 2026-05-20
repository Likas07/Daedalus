import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { captureDeltaPatch } from "./delta";
import type { DelegationMergeResult, MergeDelegationIsolationOptions } from "./types";

async function git(repoRoot: string, args: string[]): Promise<string> {
	return await $`git ${args}`.cwd(repoRoot).quiet().text();
}

export async function mergeDelegationIsolation(
	options: MergeDelegationIsolationOptions,
): Promise<DelegationMergeResult> {
	return options.mode === "branch" ? mergeWithBranch(options) : mergeWithPatch(options);
}

async function mergeWithPatch({ handle }: MergeDelegationIsolationOptions): Promise<DelegationMergeResult> {
	const delta = await captureDeltaPatch(handle.mergedDir, handle.baseline);
	const patchPath = join(handle.baseDir, `${handle.runId}.patch`);
	await writeFile(patchPath, delta.content);
	if (!delta.content.trim()) {
		await handle.cleanup();
		return { status: "empty", mode: "patch", runId: handle.runId, patchPath, files: [] };
	}
	const check = await $`git apply --check ${patchPath}`.cwd(handle.repoRoot).quiet().nothrow();
	if (check.exitCode !== 0) {
		return {
			status: "blocked",
			mode: "patch",
			runId: handle.runId,
			patchPath,
			files: delta.files,
			message: check.stderr.toString() || "Patch did not apply cleanly",
		};
	}
	await $`git apply ${patchPath}`.cwd(handle.repoRoot).quiet();
	await handle.cleanup();
	return { status: "merged", mode: "patch", runId: handle.runId, patchPath, files: delta.files };
}

async function mergeWithBranch({ handle }: MergeDelegationIsolationOptions): Promise<DelegationMergeResult> {
	const delta = await captureDeltaPatch(handle.mergedDir, handle.baseline);
	const patchPath = join(handle.baseDir, `${handle.runId}.patch`);
	await writeFile(patchPath, delta.content);
	if (!delta.content.trim()) {
		await handle.cleanup();
		return { status: "empty", mode: "branch", runId: handle.runId, patchPath, files: [] };
	}

	const branchName = `daedalus/subagent/${handle.runId}`;
	const tempRoot = await mkdtemp(join(tmpdir(), "daedalus-merge-"));
	const worktreeDir = join(tempRoot, "worktree");
	try {
		await git(handle.repoRoot, ["branch", "-f", branchName, handle.baseline.head]);
		await git(handle.repoRoot, ["worktree", "add", worktreeDir, branchName]);
		await $`git apply ${patchPath}`.cwd(worktreeDir).quiet();
		await git(worktreeDir, ["add", "-A"]);
		await git(worktreeDir, ["commit", "-m", `subagent ${handle.runId}`]);
		const commit = (await git(worktreeDir, ["rev-parse", "HEAD"])).trim();
		const pick = await $`git cherry-pick --no-commit ${commit}`.cwd(handle.repoRoot).quiet().nothrow();
		if (pick.exitCode !== 0) {
			await $`git cherry-pick --abort`.cwd(handle.repoRoot).quiet().nothrow();
			return {
				status: "blocked",
				mode: "branch",
				runId: handle.runId,
				patchPath,
				branchName,
				commit,
				files: delta.files,
				message: pick.stderr.toString() || "Cherry-pick did not apply cleanly",
			};
		}
		await handle.cleanup();
		return {
			status: "merged",
			mode: "branch",
			runId: handle.runId,
			patchPath,
			branchName,
			commit,
			files: delta.files,
		};
	} finally {
		await git(handle.repoRoot, ["worktree", "remove", "--force", worktreeDir]).catch(() => "");
		await rm(tempRoot, { recursive: true, force: true });
	}
}
