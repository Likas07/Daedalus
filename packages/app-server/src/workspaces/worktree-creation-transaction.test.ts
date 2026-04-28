import { beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, listGitWorktrees } from "./git";
import { createWorktreeInTransaction } from "./worktree-creation-transaction";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "daedalus-worktree-transaction-"));
});

async function initRepo(): Promise<string> {
	const repo = join(root, "repo");
	await mkdir(repo);
	await git(repo, ["init"]);
	await git(repo, ["config", "user.email", "test@example.com"]);
	await git(repo, ["config", "user.name", "Test User"]);
	await writeFile(join(repo, "README.md"), "hello\n");
	await git(repo, ["add", "README.md"]);
	await git(repo, ["commit", "-m", "initial"]);
	return repo;
}

describe("worktree creation transaction", () => {
	test("rolls back created git worktree when injected post-git step fails", async () => {
		const repo = await initRepo();
		const path = join(root, "rollback-worktree");

		const result = await createWorktreeInTransaction({
			projectPath: repo,
			worktreePath: path,
			branch: "feature/rollback",
			afterGitCreate: () => {
				throw new Error("injected post-git failure");
			},
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rollback");
		expect(result.message).toContain("injected post-git failure");
		expect(result.rollbackPath).toBe(path);
		expect((await listGitWorktrees(repo)).map((entry) => entry.path)).not.toContain(path);
	});
});
