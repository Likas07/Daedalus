import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMergeBackPatch,
	assessCleanupRisk,
	captureMergeBackPatch,
	cherryPickMergeBack,
	cleanupTarget,
	createTaskBranchMergeBack,
	discardChildTarget,
	dryRunApplyMergeBack,
	inspectMergeBack,
	keepChildTarget,
	mergeBranchMergeBack,
} from "./merge-back.js";
import type { WorkspaceTarget } from "./types.js";

let dir: string;
const git = (cwd: string, args: string[]) => {
	const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(r.stderr.toString());
	return r.stdout.toString().trim();
};
const target = (cwd: string, branch?: string): WorkspaceTarget => ({
	cwd,
	branch,
	isolationMode: "dedicated_worktree",
	baseBranch: "main",
});

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "dae-merge-back-"));
	git(dir, ["init", "-b", "main"]);
	git(dir, ["config", "user.email", "test@example.com"]);
	git(dir, ["config", "user.name", "Test"]);
	await writeFile(join(dir, "a.txt"), "base\n");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-m", "base"]);
	await mkdir(join(dir, "worktrees"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("workspace merge-back operations", () => {
	test("inspects diff without mutating parent", async () => {
		const child = join(dir, "worktrees", "child-inspect");
		git(dir, ["worktree", "add", "-b", "child-inspect", child, "main"]);
		await writeFile(join(child, "a.txt"), "child\n");
		git(child, ["commit", "-am", "child"]);
		const before = await readFile(join(dir, "a.txt"), "utf8");
		const result = inspectMergeBack({
			parent: target(dir, "main"),
			child: target(child, "child-inspect"),
			baseRef: "main",
		});
		expect(result.status).toBe("clean");
		expect(result.files).toContain("a.txt");
		expect(await readFile(join(dir, "a.txt"), "utf8")).toBe(before);
	});

	test("exports binary patch artifacts", async () => {
		const child = join(dir, "worktrees", "child-binary");
		git(dir, ["worktree", "add", "-b", "child-binary", child, "main"]);
		await writeFile(join(child, "bin.dat"), new Uint8Array([0, 1, 2, 3]));
		git(child, ["add", "."]);
		git(child, ["commit", "-m", "binary"]);
		const patchPath = join(dir, "patches", "child.patch");
		const result = await captureMergeBackPatch({
			parent: target(dir),
			child: target(child, "child-binary"),
			baseRef: "main",
			artifactPath: patchPath,
		});
		expect(result.status).toBe("clean");
		expect(await readFile(patchPath, "utf8")).toContain("GIT binary patch");
	});

	test("dry-run and apply patch", async () => {
		const child = join(dir, "worktrees", "child-apply");
		git(dir, ["worktree", "add", "-b", "child-apply", child, "main"]);
		await writeFile(join(child, "a.txt"), "applied\n");
		git(child, ["commit", "-am", "change"]);
		expect(
			(await dryRunApplyMergeBack({ parent: target(dir), child: target(child, "child-apply"), baseRef: "main" }))
				.status,
		).toBe("clean");
		expect(
			(await applyMergeBackPatch({ parent: target(dir), child: target(child, "child-apply"), baseRef: "main" }))
				.status,
		).toBe("applied");
		expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("applied\n");
	});

	test("captures committed, staged, unstaged, untracked, and binary task deltas", async () => {
		const child = join(dir, "worktrees", "child-full-delta");
		git(dir, ["worktree", "add", "-b", "child-full-delta", child, "main"]);
		await writeFile(join(child, "a.txt"), "committed\n");
		git(child, ["commit", "-am", "committed"]);
		await writeFile(join(child, "a.txt"), "unstaged final\n");
		await writeFile(join(child, "staged.txt"), "staged\n");
		git(child, ["add", "staged.txt"]);
		await writeFile(join(child, "untracked.txt"), "untracked\n");
		await writeFile(join(child, "bin2.dat"), new Uint8Array([0, 255, 1, 254]));

		const patchPath = join(dir, "patches", "full-delta.patch");
		const captured = await captureMergeBackPatch({
			parent: target(dir),
			child: target(child, "child-full-delta"),
			baseRef: "main",
			artifactPath: patchPath,
		});
		expect(captured.status).toBe("clean");
		const patch = await readFile(patchPath, "utf8");
		expect(patch).toContain("unstaged final");
		expect(patch).toContain("staged.txt");
		expect(patch).toContain("untracked.txt");
		expect(patch).toContain("GIT binary patch");
		expect(
			(
				await applyMergeBackPatch({
					parent: target(dir),
					child: target(child),
					baseRef: "main",
					artifactPath: patchPath,
				})
			).status,
		).toBe("applied");
		expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("unstaged final\n");
		expect(await readFile(join(dir, "staged.txt"), "utf8")).toBe("staged\n");
		expect(await readFile(join(dir, "untracked.txt"), "utf8")).toBe("untracked\n");
	});

	test("branch mode creates a durable task branch and cherry-picks a parent commit", async () => {
		const child = join(dir, "worktrees", "child-branch-mode");
		git(dir, ["worktree", "add", "-b", "child-branch-mode", child, "main"]);
		await writeFile(join(child, "branch.txt"), "branch mode\n");
		const beforeHead = git(dir, ["rev-parse", "HEAD"]);
		const patchPath = join(dir, "patches", "branch-mode.patch");
		const result = await createTaskBranchMergeBack({
			parent: target(dir, "main"),
			child: target(child, "child-branch-mode"),
			baseRef: "main",
			artifactPath: patchPath,
			branchName: "daedalus/test/branch-mode",
			commitMessage: "branch mode",
		});
		expect(result.status).toBe("applied");
		expect(result.branchName).toBe("daedalus/test/branch-mode");
		expect(git(dir, ["rev-parse", "--verify", "daedalus/test/branch-mode"])).toBeTruthy();
		expect(git(dir, ["rev-parse", "HEAD"])).not.toBe(beforeHead);
		expect(git(dir, ["log", "-1", "--format=%s"])).toBe("branch mode");
		expect(git(dir, ["status", "--porcelain", "--", "branch.txt"])).toBe("");
		expect(git(dir, ["diff", "--name-only", "HEAD", "--", "branch.txt"])).toBe("");
		expect(await readFile(join(dir, "branch.txt"), "utf8")).toBe("branch mode\n");
		expect(await readFile(patchPath, "utf8")).toContain("branch.txt");
	});

	test("branch mode stashes dirty parent changes while replaying non-overlapping task commits", async () => {
		const child = join(dir, "worktrees", "child-branch-stash");
		git(dir, ["worktree", "add", "-b", "child-branch-stash", child, "main"]);
		await writeFile(join(dir, "a.txt"), "parent dirty\n");
		await writeFile(join(child, "branch-stash.txt"), "branch replay\n");
		const result = await createTaskBranchMergeBack({
			parent: target(dir, "main"),
			child: target(child, "child-branch-stash"),
			baseRef: "main",
			artifactPath: join(dir, "patches", "branch-stash.patch"),
			branchName: "daedalus/test/branch-stash",
			commitMessage: "branch stash",
		});
		expect(result.status).toBe("applied");
		expect(git(dir, ["log", "-1", "--format=%s"])).toBe("branch stash");
		expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("parent dirty\n");
		expect(await readFile(join(dir, "branch-stash.txt"), "utf8")).toBe("branch replay\n");
		expect(git(dir, ["status", "--porcelain", "--", "branch-stash.txt"])).toBe("");
		expect(git(dir, ["status", "--porcelain", "--", "a.txt"])).toContain("M a.txt");
	});

	test("detects merge and cherry-pick conflicts", async () => {
		const child = join(dir, "worktrees", "child-conflict");
		git(dir, ["worktree", "add", "-b", "child-conflict", child, "main"]);
		await writeFile(join(child, "a.txt"), "child\n");
		git(child, ["commit", "-am", "child"]);
		await writeFile(join(dir, "a.txt"), "parent\n");
		git(dir, ["commit", "-am", "parent"]);
		expect(
			mergeBranchMergeBack({ parent: target(dir, "main"), child: target(child, "child-conflict"), baseRef: "main" })
				.status,
		).toBe("conflict");
		git(dir, ["merge", "--abort"]);
		expect(
			cherryPickMergeBack({ parent: target(dir, "main"), child: target(child, "child-conflict"), baseRef: "main" })
				.status,
		).toBe("conflict");
		git(dir, ["cherry-pick", "--abort"]);
	});

	test("discard, keep, and cleanup risk", async () => {
		const child = join(dir, "worktrees", "child-discard");
		git(dir, ["worktree", "add", "-b", "child-discard", child, "main"]);
		expect(assessCleanupRisk(target(child, "child-discard")).safe).toBe(true);
		expect(keepChildTarget({ parent: target(dir), child: target(child, "child-discard") }).status).toBe("kept");
		await writeFile(join(child, "dirty.txt"), "dirty\n");
		expect(cleanupTarget({ parent: target(dir), child: target(child, "child-discard") }).status).toBe("failed");
		expect(
			discardChildTarget({ parent: target(dir), child: target(child, "child-discard"), force: true }).status,
		).toBe("discarded");
	});
});
