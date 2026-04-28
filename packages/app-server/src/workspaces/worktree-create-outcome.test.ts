import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../persistence/migrations";
import { git } from "./git";
import { ProjectService } from "./project-service";
import { WorktreeService } from "./worktree-service";

let db: Database;
let root: string;

beforeEach(async () => {
	db = new Database(":memory:", { strict: true });
	runMigrations(db);
	root = await mkdtemp(join(tmpdir(), "daedalus-worktree-outcome-"));
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

async function openProject(): Promise<{ readonly projectId: string; readonly repo: string }> {
	const repo = await initRepo();
	const { projectId } = new ProjectService({ database: db }).open({ path: repo });
	return { projectId, repo };
}

describe("worktree create outcomes", () => {
	test("returns created outcome", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const path = join(root, "created-worktree");

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/created",
			path,
			operationId: "op-created",
		});

		expect(outcome.outcome).toBe("created");
		if (outcome.outcome !== "created") throw new Error("expected created");
		expect(outcome.operationId).toBe("op-created");
		expect(outcome.worktree.path).toBe(path);
		expect(outcome.worktree.branch).toBe("feature/created");
	});

	test("adopts exact existing canonical path, branch, and project", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const path = join(root, "adopt-worktree");
		const created = await service.create({ projectId, branch: "feature/adopt", path });

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/adopt",
			path: join(path, "."),
			operationId: "op-adopt",
		});

		expect(outcome.outcome).toBe("adopted-existing");
		if (outcome.outcome !== "adopted-existing") throw new Error("expected adopted-existing");
		expect(outcome.worktree.id).toBe(created.id);
		expect(outcome.worktree.path).toBe(path);
	});

	test("returns typed branch conflict for unsafe explicit branch mismatch", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const existingPath = join(root, "branch-owner");
		await service.create({ projectId, branch: "feature/conflict", path: existingPath });

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/conflict",
			path: join(root, "different-path"),
			operationId: "op-branch-conflict",
		});

		expect(outcome.outcome).toBe("conflict");
		if (outcome.outcome !== "conflict") throw new Error("expected conflict");
		expect(outcome.reason).toBe("branch-exists");
		expect(outcome.existingPath).toBe(existingPath);
		expect(outcome.existingBranch).toBe("feature/conflict");
	});

	test("returns typed path conflict for unsafe explicit path mismatch", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const path = join(root, "path-owner");
		await service.create({ projectId, branch: "feature/path-owner", path });

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/path-mismatch",
			path,
			operationId: "op-path-conflict",
		});

		expect(outcome.outcome).toBe("conflict");
		if (outcome.outcome !== "conflict") throw new Error("expected conflict");
		expect(outcome.reason).toBe("path-exists");
		expect(outcome.existingPath).toBe(path);
		expect(outcome.existingBranch).toBe("feature/path-owner");
	});

	test("keeps deterministic suffixing for repeated prompt/new-build creates", async () => {
		const { projectId, repo } = await openProject();
		const service = new WorktreeService({ database: db });

		const first = await service.createOrAdoptWorktree({
			projectId,
			branch: "build/hello",
			operationId: "op-build-1",
		});
		const second = await service.createOrAdoptWorktree({
			projectId,
			branch: "build/hello",
			operationId: "op-build-2",
		});

		expect(first.outcome).toBe("created");
		expect(second.outcome).toBe("created");
		if (first.outcome !== "created" || second.outcome !== "created") throw new Error("expected created outcomes");
		expect(first.worktree.branch).toBe("build/hello");
		expect(second.worktree.branch).toBe("build/hello-2");
		expect(first.worktree.path).toBe(`${repo}-build-hello`);
		expect(second.worktree.path).toBe(`${repo}-build-hello-2`);
	});

	test("adopts retry by operationId", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const first = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/retry",
			operationId: "op-retry",
		});
		const second = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/retry",
			operationId: "op-retry",
		});

		expect(first.outcome).toBe("created");
		expect(second.outcome).toBe("adopted-existing");
		if (first.outcome !== "created" || second.outcome !== "adopted-existing")
			throw new Error("expected retry adoption");
		expect(second.worktree.id).toBe(first.worktree.id);
	});
});
