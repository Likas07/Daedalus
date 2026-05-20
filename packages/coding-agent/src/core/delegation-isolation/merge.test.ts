import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { captureDeltaPatch, createDelegationIsolation, mergeDelegationIsolation } from ".";

const repos: string[] = [];

async function makeRepo(): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "daedalus-merge-"));
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
		await rm(repo, { recursive: true, force: true });
	}
});

describe("delegation delta capture", () => {
	test("subtracts parent baseline staged, unstaged, and untracked state", async () => {
		const repo = await makeRepo();
		await writeFile(join(repo, "parent-staged.txt"), "parent staged\n");
		await $`git add parent-staged.txt`.cwd(repo).quiet();
		await writeFile(join(repo, "tracked.txt"), "base\nparent unstaged\n");
		await writeFile(join(repo, "parent-untracked.txt"), "parent untracked\n");

		const handle = await createDelegationIsolation({ repoRoot: repo, runId: "delta", mode: "rcopy" });
		await writeFile(join(handle.mergedDir, "tracked.txt"), "base\nparent unstaged\ntask change\n");
		await writeFile(join(handle.mergedDir, "task-only.txt"), "task only\n");

		const delta = await captureDeltaPatch(handle.mergedDir, handle.baseline);
		expect(delta.content).toContain("task change");
		expect(delta.content).toContain("task-only.txt");
		expect(delta.content).not.toContain("parent-staged.txt");
		expect(delta.content).not.toContain("parent untracked");
		expect(delta.files.sort()).toEqual(["task-only.txt", "tracked.txt"]);
		await handle.cleanup();
	});
});

describe("delegation merge", () => {
	test("patch mode applies clean deltas and cleans empty deltas", async () => {
		const repo = await makeRepo();
		const empty = await createDelegationIsolation({ repoRoot: repo, runId: "empty", mode: "rcopy" });
		expect((await mergeDelegationIsolation({ handle: empty, mode: "patch" })).status).toBe("empty");

		const handle = await createDelegationIsolation({ repoRoot: repo, runId: "patch", mode: "rcopy" });
		await writeFile(join(handle.mergedDir, "tracked.txt"), "base\npatched\n");
		const result = await mergeDelegationIsolation({ handle, mode: "patch" });
		expect(result.status).toBe("merged");
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("base\npatched\n");
	});

	test("patch mode blocks failed applies without mutating parent", async () => {
		const repo = await makeRepo();
		const handle = await createDelegationIsolation({ repoRoot: repo, runId: "conflict", mode: "rcopy" });
		await writeFile(join(handle.mergedDir, "tracked.txt"), "base\ntask\n");
		await writeFile(join(repo, "tracked.txt"), "base\nparent conflict\n");

		const result = await mergeDelegationIsolation({ handle, mode: "patch" });
		expect(result.status).toBe("blocked");
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("base\nparent conflict\n");
		await handle.cleanup();
	});

	test("branch mode commits to a subagent branch and cherry-picks into parent", async () => {
		const repo = await makeRepo();
		const handle = await createDelegationIsolation({ repoRoot: repo, runId: "branch", mode: "rcopy" });
		await writeFile(join(handle.mergedDir, "branch.txt"), "branch task\n");

		const result = await mergeDelegationIsolation({ handle, mode: "branch" });
		expect(result.status).toBe("merged");
		expect(result.branchName).toBe("daedalus/subagent/branch");
		expect(await readFile(join(repo, "branch.txt"), "utf8")).toBe("branch task\n");
		const branchCommit = (await $`git rev-parse daedalus/subagent/branch`.cwd(repo).quiet().text()).trim();
		if (result.commit === undefined) {
			throw new Error("Expected branch merge to return a commit");
		}
		expect(branchCommit).toBe(result.commit);
	});
});
