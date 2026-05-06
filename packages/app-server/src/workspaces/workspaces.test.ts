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

describe("project service", () => {
	test("returns stable project ids for the same normalized path", async () => {
		const repo = await initRepo();
		const service = new ProjectService({ database: db });

		const first = service.open({ path: repo });
		const second = service.open({ path: join(repo, ".") });

		expect(second.projectId).toBe(first.projectId);
		expect(service.list()).toHaveLength(1);
	});
});

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

	test("allocates unique branches and default paths for repeated creates", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const service = new WorktreeService({ database: db });

		const first = await service.create({ projectId: project.projectId, branch: "build/hello" });
		const second = await service.create({ projectId: project.projectId, branch: "build/hello" });

		expect(first.branch).toBe("build/hello");
		expect(second.branch).toBe("build/hello-2");
		expect(first.path).toBe(join(repo, ".daedalus", "worktrees", "build-hello"));
		expect(second.path).toBe(join(repo, ".daedalus", "worktrees", "build-hello-2"));
		expect(first.path).not.toBe(second.path);
		expect((await service.gitList(project.projectId)).map((entry) => entry.branch)).toContain("build/hello-2");
	});

	test("allocates unique branches and explicit paths for repeated creates", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const service = new WorktreeService({ database: db });
		const path = join(root, "explicit-worktree");

		const first = await service.create({ projectId: project.projectId, branch: "build/hello", path });
		const second = await service.create({ projectId: project.projectId, branch: "build/hello", path });

		expect(first.branch).toBe("build/hello");
		expect(second.branch).toBe("build/hello-2");
		expect(first.path).toBe(path);
		expect(second.path).toBe(`${path}-2`);
		expect(first.path).not.toBe(second.path);
		expect((await service.gitList(project.projectId)).map((entry) => entry.path)).toContain(`${path}-2`);
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
