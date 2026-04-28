import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../persistence/migrations";
import { git } from "./git";
import { ProjectService } from "./project-service";
import { buildWorktreeCleanupRiskScan, validateCleanupConfirmationToken } from "./worktree-cleanup-risk";
import { WorktreeService } from "./worktree-service";

let db: Database;
let root: string;

beforeEach(async () => {
	db = new Database(":memory:", { strict: true });
	runMigrations(db);
	root = await mkdtemp(join(tmpdir(), "daedalus-cleanup-risk-"));
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

describe("worktree cleanup risk scan", () => {
	test("builds structured dirty, unpushed, session, and terminal reasons with a bound token", () => {
		const scan = buildWorktreeCleanupRiskScan({
			worktreeId: "wt-1",
			worktreePath: "/repo/wt",
			operationId: "cleanup-op-1",
			now: new Date("2026-01-01T00:00:00.000Z"),
			activeSessionIds: ["s-2", "s-1"],
			activeTerminalIds: ["t-1"],
			status: {
				branch: "feature",
				upstream: "origin/feature",
				ahead: 2,
				behind: 0,
				stagedCount: 0,
				unstagedCount: 1,
				files: [
					{
						path: "src/a.ts",
						status: "modified",
						staged: false,
						insertions: 0,
						deletions: 0,
						riskGroup: "source",
					},
				],
			},
		});

		expect(scan.risky).toBe(true);
		expect(scan.reasons.map((reason) => reason.kind)).toEqual([
			"dirty-files",
			"unpushed-commits",
			"active-sessions",
			"active-terminals",
		]);
		expect(scan.activeSessionIds).toEqual(["s-1", "s-2"]);
		expect(scan.confirmationToken).toBeString();
		expect(
			validateCleanupConfirmationToken({
				token: scan.confirmationToken ?? "",
				worktreeId: "wt-1",
				operationId: "cleanup-op-1",
				riskHash: scan.riskHash,
				now: new Date("2026-01-01T00:01:00.000Z"),
			}),
		).toBe(true);
		expect(
			validateCleanupConfirmationToken({
				token: scan.confirmationToken ?? "",
				worktreeId: "wt-2",
				operationId: "cleanup-op-1",
				riskHash: scan.riskHash,
				now: new Date("2026-01-01T00:01:00.000Z"),
			}),
		).toBe(false);
	});

	test("WorktreeService rejects risky cleanup without token and accepts a fresh matching token", async () => {
		const repo = await initRepo();
		const project = new ProjectService({ database: db }).open({ path: repo });
		const service = new WorktreeService({ database: db, listActiveSessionIds: () => ["session-1"] });
		const worktree = await service.create({
			projectId: project.projectId,
			branch: "cleanup-risk",
			path: join(root, "wt"),
		});
		await writeFile(join(worktree.path, "dirty.txt"), "dirty\n");

		await expect(service.cleanup(worktree.id, { operationId: "cleanup-op-2" })).rejects.toThrow("confirmation token");

		const scan = await service.cleanupRiskScan(worktree.id, "cleanup-op-2");

		expect(scan.reasons.map((reason) => reason.kind)).toContain("dirty-files");
		expect(scan.reasons.map((reason) => reason.kind)).toContain("active-sessions");
		await service.cleanup(worktree.id, { operationId: scan.operationId, confirmationToken: scan.confirmationToken });
		expect((await service.gitList(project.projectId)).some((entry) => entry.path === worktree.path)).toBe(false);
	});
});
