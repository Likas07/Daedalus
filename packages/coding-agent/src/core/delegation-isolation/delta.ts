import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import type { DelegationBaseline, DelegationDeltaPatch } from "./types";

async function git(repoRoot: string, args: string[]): Promise<string> {
	return await $`git ${args}`.cwd(repoRoot).quiet().text();
}

async function seedBaseline(repoRoot: string, baseline: DelegationBaseline): Promise<void> {
	if (baseline.stagedDiff.trim()) {
		const patchPath = join(repoRoot, ".daedalus-baseline-staged.patch");
		await writeFile(patchPath, baseline.stagedDiff);
		try {
			await $`git apply --index ${patchPath}`.cwd(repoRoot).quiet();
		} finally {
			await rm(patchPath, { force: true });
		}
	}
	if (baseline.unstagedDiff.trim()) {
		const patchPath = join(repoRoot, ".daedalus-baseline-unstaged.patch");
		await writeFile(patchPath, baseline.unstagedDiff);
		try {
			await $`git apply ${patchPath}`.cwd(repoRoot).quiet();
		} finally {
			await rm(patchPath, { force: true });
		}
	}
	for (const file of baseline.untrackedFiles) {
		await mkdir(dirname(join(repoRoot, file)), { recursive: true });
		await cp(join(baseline.repoRoot, file), join(repoRoot, file), { recursive: true, force: true });
	}
}

export async function captureDeltaPatch(
	isolationDir: string,
	baseline: DelegationBaseline,
): Promise<DelegationDeltaPatch> {
	const tempRoot = await mkdtemp(join(tmpdir(), "daedalus-delta-"));
	const baselineDir = join(tempRoot, "baseline");
	const taskDir = join(tempRoot, "task");
	try {
		await git(baseline.repoRoot, ["worktree", "add", "--detach", baselineDir, baseline.head]);
		try {
			await seedBaseline(baselineDir, baseline);
			await git(baselineDir, ["add", "-A"]);
			await mkdir(taskDir, { recursive: true });
			await $`rsync -a --delete --exclude .git ${isolationDir}/ ${taskDir}/`.quiet();
			await $`rsync -a --delete --exclude .git ${taskDir}/ ${baselineDir}/`.quiet();
			const content = await git(baselineDir, ["diff", "--binary"]);
			const files = (await git(baselineDir, ["diff", "--name-only"])).split("\n").filter(Boolean);
			const untracked = (await git(baselineDir, ["ls-files", "--others", "--exclude-standard"]))
				.split("\n")
				.filter(Boolean);
			let untrackedPatch = "";
			for (const file of untracked) {
				const result = await $`git diff --no-index --binary -- /dev/null ${file}`
					.cwd(baselineDir)
					.nothrow()
					.quiet()
					.text();
				untrackedPatch += result.replaceAll("a/dev/null", "/dev/null");
			}
			return { content: content + untrackedPatch, files: [...files, ...untracked] };
		} finally {
			await git(baseline.repoRoot, ["worktree", "remove", "--force", baselineDir]).catch(() => "");
		}
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}
