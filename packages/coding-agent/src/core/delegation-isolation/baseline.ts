import { spawnSync } from "node:child_process";
import { $ } from "bun";
import type { DelegationBaseline } from "./types";

async function git(repoRoot: string, args: string[]): Promise<string> {
	return await $`git ${args}`.cwd(repoRoot).quiet().text();
}

export async function captureDelegationBaseline(repoRoot: string): Promise<DelegationBaseline> {
	const head = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
	const stagedDiff = await git(repoRoot, ["diff", "--cached", "--binary"]);
	const unstagedDiff = await git(repoRoot, ["diff", "--binary"]);
	const untrackedFiles = (await git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]))
		.split("\0")
		.filter(Boolean);
	const untrackedPatch = await createUntrackedPatch(repoRoot, untrackedFiles);
	return { repoRoot, head, stagedDiff, unstagedDiff, untrackedFiles, untrackedPatch };
}

async function createUntrackedPatch(repoRoot: string, files: string[]): Promise<string> {
	const chunks: string[] = [];
	for (const file of files) {
		const result = spawnSync("git", ["diff", "--no-index", "--binary", "--", "/dev/null", file], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		// git diff --no-index exits 1 when differences are present.
		if (result.status !== 0 && result.status !== 1) {
			throw new Error(result.stderr || `Failed to create untracked patch for ${file}`);
		}
		chunks.push(result.stdout.replaceAll("a/dev/null", "/dev/null").replaceAll(`b/${file}`, `b/${file}`));
	}
	return chunks.join("");
}
