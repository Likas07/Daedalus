import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
	root = await mkdtemp(join(tmpdir(), "daedalus-worktree-service-"));
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

describe("worktree service lifecycle", () => {
	test("createOrAdoptWorktree finalizes GUI-created managed worktrees", async () => {
		const { projectId } = await openProject();
		const service = new WorktreeService({ database: db });
		const path = join(root, "managed-worktree");

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/managed",
			path,
			operationId: "op-managed",
			setup: false,
		});

		expect(outcome.outcome).toBe("created");
		if (outcome.outcome !== "created") throw new Error("expected created");
		expect(outcome.worktree.path).toBe(path);
		expect(existsSync(join(path, ".daedalus", "worktree.json"))).toBe(true);
		const metadata = JSON.parse(readFileSync(join(path, ".daedalus", "worktree.json"), "utf8"));
		expect(metadata.branch).toBe("feature/managed");
		expect(metadata.setup.status).toBe("created");
		expect((await git(path, ["config", "--get", "push.autoSetupRemote"])).stdout.trim()).toBe("true");
	});
});
