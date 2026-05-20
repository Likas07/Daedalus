import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
	captureDelegationBaseline,
	createDelegationIsolation,
	getDelegationIsolationPaths,
	parseDelegationIsolationMode,
} from ".";

const repos: string[] = [];

async function makeRepo(): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "daedalus-isolation-"));
	repos.push(repo);
	await $`git init`.cwd(repo).quiet();
	await $`git config user.email test@example.com`.cwd(repo).quiet();
	await $`git config user.name Test`.cwd(repo).quiet();
	await writeFile(join(repo, "tracked.txt"), "base\n");
	await $`git add tracked.txt`.cwd(repo).quiet();
	await $`git commit -m initial`.cwd(repo).quiet();
	return repo;
}

afterEach(async () => {
	for (const repo of repos.splice(0)) {
		try {
			await $`git worktree list --porcelain`.cwd(repo).quiet();
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	}
});

describe("delegation isolation modes", () => {
	test("parses displayed modes and falls native modes back to rcopy", () => {
		expect(parseDelegationIsolationMode("rcopy")).toMatchObject({ displayedMode: "rcopy", backend: "rcopy" });
		expect(parseDelegationIsolationMode("auto")).toMatchObject({ displayedMode: "auto", backend: "rcopy" });
		expect(parseDelegationIsolationMode("apfs").fallback).toMatchObject({ from: "apfs", to: "rcopy" });
		expect(parseDelegationIsolationMode("none")).toMatchObject({ displayedMode: "none", backend: "none" });
	});

	test("preserves legacy aliases at the parser layer", () => {
		expect(parseDelegationIsolationMode("worktree")).toMatchObject({
			requestedMode: "worktree",
			displayedMode: "rcopy",
		});
		expect(parseDelegationIsolationMode("fuse-overlay")).toMatchObject({
			displayedMode: "overlayfs",
			backend: "rcopy",
		});
		expect(parseDelegationIsolationMode("fuse-projfs")).toMatchObject({ displayedMode: "projfs", backend: "rcopy" });
	});
});

describe("delegation isolation paths", () => {
	test("uses deterministic repo-local merged paths", async () => {
		const repo = await makeRepo();
		const paths = getDelegationIsolationPaths(repo, "run_123");
		expect(paths.mergedDir).toBe(join(repo, ".daedalus", "isolation", paths.encodedRepoRoot, "run_123", "merged"));
	});

	test("rejects traversal run ids", async () => {
		const repo = await makeRepo();
		expect(() => getDelegationIsolationPaths(repo, "../escape")).toThrow();
		expect(() => getDelegationIsolationPaths(repo, "nested/run")).toThrow();
	});
});

describe("baseline and lifecycle", () => {
	test("captures head, staged diff, unstaged diff, and untracked files", async () => {
		const repo = await makeRepo();
		await writeFile(join(repo, "staged.txt"), "staged\n");
		await $`git add staged.txt`.cwd(repo).quiet();
		await writeFile(join(repo, "tracked.txt"), "base\nunstaged\n");
		await writeFile(join(repo, "untracked.txt"), "untracked\n");

		const baseline = await captureDelegationBaseline(repo);
		expect(baseline.head).toMatch(/^[0-9a-f]{40}$/);
		expect(baseline.stagedDiff).toContain("staged.txt");
		expect(baseline.unstagedDiff).toContain("unstaged");
		expect(baseline.untrackedFiles).toEqual(["untracked.txt"]);
		expect(baseline.untrackedPatch).toContain("untracked.txt");
	});

	test("creates detached worktree, seeds dirty state, and cleans up idempotently", async () => {
		const repo = await makeRepo();
		await writeFile(join(repo, "staged.txt"), "staged\n");
		await $`git add staged.txt`.cwd(repo).quiet();
		await writeFile(join(repo, "tracked.txt"), "base\nunstaged\n");
		await writeFile(join(repo, "untracked.txt"), "untracked\n");

		const handle = await createDelegationIsolation({ repoRoot: repo, runId: "run-cleanup", mode: "rcopy" });
		expect(await readFile(join(handle.mergedDir, "tracked.txt"), "utf8")).toBe("base\nunstaged\n");
		expect(await readFile(join(handle.mergedDir, "staged.txt"), "utf8")).toBe("staged\n");
		expect(await readFile(join(handle.mergedDir, "untracked.txt"), "utf8")).toBe("untracked\n");
		const branch = (await $`git branch --show-current`.cwd(handle.mergedDir).quiet().text()).trim();
		expect(branch).toBe("");

		await handle.cleanup();
		await handle.cleanup();
		const worktrees = await $`git worktree list --porcelain`.cwd(repo).quiet().text();
		expect(worktrees).not.toContain(handle.mergedDir);
	});
});
