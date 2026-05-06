import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeManagedWorktree, WorkspaceService } from "./workspace-service.js";
import { readWorktreeMetadata } from "./worktree-metadata.js";

const tempDirs: string[] = [];

function sh(cwd: string, args: string[]): string {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

function tempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-workspace-service-"));
	tempDirs.push(dir);
	sh(dir, ["git", "init", "-b", "main"]);
	sh(dir, ["git", "config", "user.email", "test@example.com"]);
	sh(dir, ["git", "config", "user.name", "Test User"]);
	writeFileSync(join(dir, "README.md"), "hello\n");
	sh(dir, ["git", "add", "README.md"]);
	sh(dir, ["git", "commit", "-m", "initial"]);
	return realpathSync(dir);
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("WorkspaceService", () => {
	test("resolves current and base targets", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const current = service.resolveCurrentTarget(repo);
		expect(current.cwd).toBe(repo);
		expect(current.projectRoot).toBe(repo);
		expect(current.isolationMode).toBe("shared_cwd");
		expect(current.repositoryRoot).toBe(repo);
		expect(current.branch).toBe("main");
		expect(current.worktreePath).toBe(repo);
		expect(current.baseCommit).toHaveLength(40);
		expect(current.validationStatus).toBe("valid");
		const base = service.resolveBaseTarget("main");
		expect(base.baseBranch).toBe("main");
		expect(base.baseCommit).toHaveLength(40);
	});

	test("resolves non-git current targets as detached", () => {
		const serviceRoot = mkdtempSync(join(tmpdir(), "daedalus-workspace-service-root-"));
		const dir = mkdtempSync(join(tmpdir(), "daedalus-workspace-nongit-current-"));
		tempDirs.push(serviceRoot, dir);
		const actualDir = realpathSync(dir);
		const service = new WorkspaceService({ projectRoot: serviceRoot });

		expect(service.resolveCurrentTarget(dir)).toEqual({
			cwd: actualDir,
			projectRoot: actualDir,
			isolationMode: "detached",
			validationStatus: "valid",
		});
	});

	test("creates isolated worktrees under .daedalus/worktrees/<slug>", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const baseCommit = sh(repo, ["git", "rev-parse", "HEAD"]);
		const target = service.createIsolatedTarget({
			branch: "agent/task-2",
			slug: "task-2",
			baseRef: "main",
			mergeTarget: "main",
		});
		expect(target.cwd).toBe(join(repo, ".daedalus", "worktrees", "task-2"));
		expect(target.isolationMode).toBe("dedicated_worktree");
		expect(target.branch).toBe("agent/task-2");
		expect(target.baseBranch).toBe("main");
		expect(target.baseCommit).toBe(baseCommit);
		expect(target.mergeBack).toMatchObject({
			baseBranch: "main",
			baseCommit,
			targetBranch: "main",
			status: "not_started",
		});
		expect(target.setup?.status).toBe("setup_complete");
		expect(existsSync(join(target.cwd, "README.md"))).toBe(true);
		expect(readWorktreeMetadata(target.cwd)).toMatchObject({
			version: 1,
			branch: "agent/task-2",
			baseRef: "main",
			baseCommit,
			mergeTarget: "main",
			setup: { status: "setup_complete" },
		});
		expect(sh(target.cwd, ["git", "config", "--get", "push.autoSetupRemote"])).toBe("true");
	});

	test("can skip setup for fast isolated worktree creation", () => {
		const repo = tempRepo();
		writeFileSync(join(repo, ".worktreeinclude"), ".env.local\n");
		writeFileSync(join(repo, ".env.local"), "secret\n");
		const service = new WorkspaceService({ projectRoot: repo });
		const target = service.createIsolatedTarget({ branch: "agent/no-setup", slug: "no-setup", setup: false });
		expect(target.setup?.status).toBe("created");
		expect(existsSync(join(target.cwd, ".env.local"))).toBe(false);
		expect(readWorktreeMetadata(target.cwd)?.setup.status).toBe("created");
	});

	test("finalizes a manually created managed worktree without setup", () => {
		const repo = tempRepo();
		const worktreePath = join(repo, ".daedalus", "worktrees", "manual-finalize");
		const baseCommit = sh(repo, ["git", "rev-parse", "HEAD"]);
		sh(repo, ["git", "worktree", "add", "-b", "agent/manual-finalize", worktreePath, "main"]);

		const target = finalizeManagedWorktree({
			projectRoot: repo,
			worktreePath,
			branch: "agent/manual-finalize",
			baseRef: "main",
			baseCommit,
			mergeTarget: "main",
			id: "manual-finalize",
			setup: false,
		});

		expect(target).toMatchObject({
			id: "manual-finalize",
			cwd: realpathSync(worktreePath),
			projectRoot: repo,
			isolationMode: "dedicated_worktree",
			branch: "agent/manual-finalize",
			worktreePath: realpathSync(worktreePath),
			baseBranch: "main",
			baseCommit,
			mergeBack: { baseBranch: "main", baseCommit, targetBranch: "main", status: "not_started" },
			setup: { status: "created" },
			validationStatus: "valid",
		});
		expect(readWorktreeMetadata(target.cwd)).toMatchObject({
			version: 1,
			branch: "agent/manual-finalize",
			baseRef: "main",
			baseCommit,
			mergeTarget: "main",
			setup: { status: "created" },
		});
		expect(sh(target.cwd, ["git", "config", "--get", "push.autoSetupRemote"])).toBe("true");
	});

	test("opens/adopts existing worktree by path branch and id", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const created = service.createIsolatedTarget({ branch: "agent/adopt", slug: "adopt" });
		expect(service.openTarget({ cwd: created.cwd }).cwd).toBe(created.cwd);
		expect(service.openTarget({ branch: "agent/adopt" }).branch).toBe("agent/adopt");
		expect(service.openTarget({ id: "agent-adopt" }).adoption?.adoptedFromPath).toBe(created.cwd);
	});

	test("lists worktrees with canonical paths branch head and detached state", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const branchTarget = service.createIsolatedTarget({ branch: "agent/listed", slug: "listed" });
		const detachedPath = join(repo, ".daedalus", "worktrees", "detached");
		sh(repo, ["git", "worktree", "add", "--detach", detachedPath, "HEAD"]);
		const entries = service.listWorktrees();
		const main = entries.find((entry) => entry.path === repo);
		const branch = entries.find((entry) => entry.path === branchTarget.cwd);
		const detached = entries.find((entry) => entry.path === realpathSync(detachedPath));
		expect(main?.branch).toBe("main");
		expect(main?.head).toHaveLength(40);
		expect(branch?.branch).toBe("agent/listed");
		expect(branch?.head).toHaveLength(40);
		expect(detached?.detached).toBe(true);
		expect(detached?.branch).toBeUndefined();
		expect(detached?.head).toHaveLength(40);
	});

	test("tolerates stale prunable worktree paths when listing and creating", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const stalePath = `${repo}-stale`;
		tempDirs.push(stalePath);
		sh(repo, ["git", "worktree", "add", "-b", "agent/stale", stalePath, "HEAD"]);
		rmSync(stalePath, { recursive: true, force: true });

		const entries = service.listWorktrees();
		expect(entries.find((entry) => entry.path === stalePath)?.branch).toBe("agent/stale");

		const created = service.createIsolatedTarget({ branch: "agent/after-stale", slug: "after-stale" });
		expect(created.cwd).toBe(join(repo, ".daedalus", "worktrees", "after-stale"));
		expect(existsSync(join(created.cwd, "README.md"))).toBe(true);
	});

	test("rejects duplicate branch and path conflicts", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		service.createIsolatedTarget({ branch: "agent/conflict", slug: "conflict" });
		expect(() => service.createIsolatedTarget({ branch: "agent/other", slug: "conflict" })).toThrow(
			/path already exists/,
		);
		expect(() => service.createIsolatedTarget({ branch: "agent/conflict", slug: "other" })).toThrow(
			/branch already exists/,
		);
	});

	test("validates moved/deleted worktrees and branch mismatch", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const target = service.createIsolatedTarget({ branch: "agent/validate", slug: "validate" });
		expect(service.validateTarget(target).status).toBe("resumable");
		sh(target.cwd, ["git", "checkout", "-b", "agent/other-branch"]);
		expect(service.validateTarget(target).message).toMatch(/branch mismatch/);
		rmSync(target.cwd, { recursive: true, force: true });
		expect(service.validateTarget(target).status).toBe("workspace_missing");
	});

	test("canonicalizes symlink paths when platform supports symlinks", () => {
		const repo = tempRepo();
		const link = `${repo}-link`;
		tempDirs.push(link);
		try {
			symlinkSync(repo, link, "dir");
		} catch {
			return;
		}
		const service = new WorkspaceService({ projectRoot: link });
		expect(service.resolveCurrentTarget(link).cwd).toBe(repo);
	});

	test("reports cleanup risk for dirty and external worktrees", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const target = service.createIsolatedTarget({ branch: "agent/risk", slug: "risk" });
		expect(service.cleanupTargetRisk(target).safe).toBe(true);
		writeFileSync(join(target.cwd, "dirty.txt"), "dirty\n");
		const dirty = service.cleanupTargetRisk(target);
		expect(dirty.safe).toBe(false);
		expect(dirty.level).toBe("dirty");
		const externalPath = mkdtempSync(join(tmpdir(), "daedalus-external-worktree-"));
		rmSync(externalPath, { recursive: true, force: true });
		tempDirs.push(externalPath);
		sh(repo, ["git", "worktree", "add", "-b", "agent/external", externalPath, "HEAD"]);
		expect(service.cleanupTargetRisk(service.openTarget({ cwd: externalPath })).level).toBe("external");
	});

	test("removes clean managed worktrees and refuses dirty removal without force", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const clean = service.createIsolatedTarget({ branch: "agent/remove-clean", slug: "remove-clean" });
		service.removeTarget(clean);
		expect(existsSync(clean.cwd)).toBe(false);
		const dirty = service.createIsolatedTarget({ branch: "agent/remove-dirty", slug: "remove-dirty" });
		writeFileSync(join(dirty.cwd, "dirty.txt"), "dirty\n");
		expect(() => service.removeTarget(dirty)).toThrow(/Refusing/);
		service.removeTarget(dirty, { force: true });
		expect(existsSync(dirty.cwd)).toBe(false);
	});

	test("reports clearly when listing from a non-git cwd", () => {
		const dir = mkdtempSync(join(tmpdir(), "daedalus-workspace-nongit-"));
		tempDirs.push(dir);
		const service = new WorkspaceService({ projectRoot: dir });
		expect(() => service.listWorktrees()).toThrow(/not a git repository|not a git worktree|rev-parse|fatal/i);
	});
});
