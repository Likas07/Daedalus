import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, type EventPayload } from "..";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { git } from "./git";
import { ProjectService } from "./project-service";
import { validateWorktreeTarget } from "./worktree-safety";
import { WorktreeService } from "./worktree-service";

let db: Database;
let root: string;

beforeEach(async () => {
	db = new Database(":memory:", { strict: true });
	runMigrations(db);
	root = await mkdtemp(join(tmpdir(), "daedalus-worktree-safety-"));
});

afterEach(() => db.close());

async function initRepo(name = "repo"): Promise<string> {
	const repo = join(root, name);
	await mkdir(repo);
	await git(repo, ["init"]);
	await git(repo, ["config", "user.email", "test@example.com"]);
	await git(repo, ["config", "user.name", "Test User"]);
	await writeFile(join(repo, "README.md"), "hello\n");
	await git(repo, ["add", "README.md"]);
	await git(repo, ["commit", "-m", "initial"]);
	return repo;
}

function rememberWorktree(input: { projectId: string; worktreeId: string; path: string; branch: string }): void {
	appendEvent(db, {
		streamId: `project:${input.projectId}`,
		type: "worktree/created",
		payload: {
			worktreeId: input.worktreeId,
			projectId: input.projectId,
			path: input.path,
			branch: input.branch,
			baseBranch: null,
			status: "active",
		} satisfies EventPayload,
	});
	projectRuntimeEvents(db);
}

describe("validateWorktreeTarget", () => {
	test("validates a known git worktree before runtime start", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const worktree = await new WorktreeService({ database: db }).create({
			projectId: project.projectId,
			branch: "feature/safe",
			path: join(root, "safe-worktree"),
		});

		const validation = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: worktree.id,
		});

		expect(validation.status).toBe("valid");
		if (validation.status === "valid") {
			expect(validation.runsIn.worktreeId).toBe(worktree.id);
			expect(validation.runsIn.validationStatus).toBe("valid");
			expect(validation.runsIn.canonicalPath).toBeTruthy();
		}
	});

	test("reports unknown and cross-project worktrees", async () => {
		const repo = await initRepo();
		const otherRepo = await initRepo("other");
		const project = new ProjectService({ database: db }).open({ path: repo });
		const otherProject = new ProjectService({ database: db }).open({ path: otherRepo });
		const worktree = await new WorktreeService({ database: db }).create({
			projectId: otherProject.projectId,
			branch: "feature/other",
			path: join(root, "other-worktree"),
		});

		expect(
			(await validateWorktreeTarget({ database: db, projectId: project.projectId, worktreeId: "missing" })).status,
		).toBe("needs-attention");
		const crossProject = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: worktree.id,
		});
		expect(crossProject.status).toBe("needs-attention");
		expect(crossProject.status === "needs-attention" ? crossProject.reason : "").toContain("does not belong");
	});

	test("reports missing paths and unsafe symlink paths", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const missingPath = join(root, "missing-worktree");
		rememberWorktree({
			projectId: project.projectId,
			worktreeId: "worktree-missing",
			path: missingPath,
			branch: "feature/missing",
		});

		const missing = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: "worktree-missing",
		});
		expect(missing.status).toBe("needs-attention");
		expect(missing.status === "needs-attention" ? missing.reason : "").toContain("missing");

		const realPath = join(root, "real-worktree");
		await git(repo, ["worktree", "add", "-b", "feature/real", realPath]);
		const linkPath = join(root, "link-worktree");
		await symlink(realPath, linkPath);
		rememberWorktree({
			projectId: project.projectId,
			worktreeId: "worktree-link",
			path: linkPath,
			branch: "feature/real",
		});

		const linked = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: "worktree-link",
		});
		expect(linked.status).toBe("needs-attention");
		expect(linked.status === "needs-attention" ? linked.reason : "").toContain("symlink");
	});

	test("reports branch mismatch and missing git worktree membership", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const worktreePath = join(root, "branch-worktree");
		await git(repo, ["worktree", "add", "-b", "feature/actual", worktreePath]);
		rememberWorktree({
			projectId: project.projectId,
			worktreeId: "worktree-branch",
			path: worktreePath,
			branch: "feature/expected",
		});

		const branchMismatch = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: "worktree-branch",
		});
		expect(branchMismatch.status).toBe("needs-attention");
		expect(branchMismatch.status === "needs-attention" ? branchMismatch.reason : "").toContain("branch mismatch");

		await git(repo, ["worktree", "remove", "--force", worktreePath]);
		await mkdir(worktreePath);
		const notMember = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: "worktree-branch",
		});
		expect(notMember.status).toBe("needs-attention");
		expect(notMember.status === "needs-attention" ? notMember.reason : "").toContain("not registered");
	});

	test("allows dirty isolated worktrees", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const worktree = await new WorktreeService({ database: db }).create({
			projectId: project.projectId,
			branch: "feature/dirty",
			path: join(root, "dirty-worktree"),
		});
		await writeFile(join(worktree.path, "scratch.txt"), "dirty\n");

		const validation = await validateWorktreeTarget({
			database: db,
			projectId: project.projectId,
			worktreeId: worktree.id,
		});

		expect(validation.status).toBe("valid");
		expect(validation.status === "valid" ? validation.dirtyCount : 0).toBe(1);
	});
});
