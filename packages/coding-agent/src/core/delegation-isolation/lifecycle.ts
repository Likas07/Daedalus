import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { captureDelegationBaseline } from "./baseline";
import { parseDelegationIsolationMode } from "./modes";
import { getDelegationIsolationPaths } from "./paths";
import type { CreateDelegationIsolationOptions, DelegationIsolationHandle } from "./types";

async function git(repoRoot: string, args: string[]): Promise<string> {
	return await $`git ${args}`.cwd(repoRoot).quiet().text();
}

export async function createDelegationIsolation(
	options: CreateDelegationIsolationOptions,
): Promise<DelegationIsolationHandle> {
	const mode = parseDelegationIsolationMode(options.mode);
	if (mode.backend === "none") {
		throw new Error("Delegation isolation mode 'none' does not create an isolation handle");
	}
	const paths = getDelegationIsolationPaths(options.repoRoot, options.runId);
	const baseline = await captureDelegationBaseline(paths.repoRoot);
	await rm(paths.baseDir, { recursive: true, force: true });
	await mkdir(paths.baseDir, { recursive: true });
	await git(paths.repoRoot, ["worktree", "add", "--detach", paths.mergedDir, baseline.head]);
	try {
		await seedDirtyState(paths.repoRoot, paths.mergedDir, baseline);
	} catch (error) {
		await cleanupDelegationIsolation(paths.repoRoot, paths.baseDir, paths.mergedDir);
		throw error;
	}
	let cleaned = false;
	return {
		repoRoot: paths.repoRoot,
		runId: paths.runId,
		mergedDir: paths.mergedDir,
		baseDir: paths.baseDir,
		backend: mode.backend,
		requestedMode: mode.requestedMode,
		displayedMode: mode.displayedMode,
		fallback: mode.fallback,
		baseline,
		cleanup: async () => {
			if (cleaned) return;
			cleaned = true;
			await cleanupDelegationIsolation(paths.repoRoot, paths.baseDir, paths.mergedDir);
		},
	};
}

async function seedDirtyState(
	repoRoot: string,
	mergedDir: string,
	baseline: Awaited<ReturnType<typeof captureDelegationBaseline>>,
): Promise<void> {
	if (baseline.stagedDiff.trim()) {
		const patchPath = join(mergedDir, ".daedalus-staged.patch");
		await writeFile(patchPath, baseline.stagedDiff);
		try {
			await $`git apply --index ${patchPath}`.cwd(mergedDir).quiet();
		} finally {
			await rm(patchPath, { force: true });
		}
	}
	if (baseline.unstagedDiff.trim()) {
		const patchPath = join(mergedDir, ".daedalus-unstaged.patch");
		await writeFile(patchPath, baseline.unstagedDiff);
		try {
			await $`git apply ${patchPath}`.cwd(mergedDir).quiet();
		} finally {
			await rm(patchPath, { force: true });
		}
	}
	for (const file of baseline.untrackedFiles) {
		await mkdir(dirname(join(mergedDir, file)), { recursive: true });
		await cp(join(repoRoot, file), join(mergedDir, file), { recursive: true, force: true });
	}
}

export async function cleanupDelegationIsolation(repoRoot: string, baseDir: string, mergedDir: string): Promise<void> {
	try {
		await git(repoRoot, ["worktree", "remove", "--force", mergedDir]);
	} catch {
		// Worktree registration may already be gone; cleanup must be idempotent.
	}
	await rm(baseDir, { recursive: true, force: true });
	try {
		await git(repoRoot, ["worktree", "prune"]);
	} catch {
		// Best effort only.
	}
}
