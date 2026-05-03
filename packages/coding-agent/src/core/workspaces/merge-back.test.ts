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
