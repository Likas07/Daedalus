import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../persistence/migrations";
import { CheckpointService } from "./checkpoint-service";
import { DiffService } from "./diff-service";
import { git } from "./git";
import { ProjectService } from "./project-service";
import { WorktreeService } from "./worktree-service";

let db: Database;
let root: string;

beforeEach(async () => {
	db = new Database(":memory:", { strict: true });
	runMigrations(db);
	root = await mkdtemp(join(tmpdir(), "daedalus-workspaces-"));
});

afterEach(() => db.close());

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

describe("worktree service", () => {
	test("creates, lists, opens, and removes git worktrees", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const service = new WorktreeService({ database: db });
		const path = join(root, "feature-worktree");

		const worktree = await service.create({ projectId: project.projectId, branch: "feature/test", path });

		expect(worktree.path).toBe(path);
		expect(worktree.branch).toBe("feature/test");
		expect(service.open(worktree.id)?.path).toBe(path);
		expect((await service.gitList(project.projectId)).some((entry) => entry.path === path)).toBe(true);

		await service.remove(worktree.id, { force: true });
		expect((await service.gitList(project.projectId)).some((entry) => entry.path === path)).toBe(false);
	});
});

describe("checkpoint and diff services", () => {
	test("checkpoint refs capture working tree and diff returns hunks", async () => {
		const repo = await initRepo();
		await writeFile(join(repo, "README.md"), "hello\nchanged\n");

		const checkpoint = await new CheckpointService({ database: db }).create({
			cwd: repo,
			sessionId: "session-1",
			turnId: "turn-1",
		});
		expect(checkpoint.ref).toBe("refs/daedalus/checkpoints/session-1/turn-1");

		await writeFile(join(repo, "README.md"), "hello\nchanged\nagain\n");
		const diff = await new DiffService().get(repo, checkpoint.ref);

		expect(diff.files).toMatchObject([
			{ status: "modified", path: "README.md", staged: false, insertions: 1, deletions: 0, riskGroup: "docs" },
		]);
		expect(diff.stagedCount).toBe(0);
		expect(diff.unstagedCount).toBe(1);
		expect(diff.patch).toContain("@@");
		expect(diff.patch).toContain("+again");
	});
});
