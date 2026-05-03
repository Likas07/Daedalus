import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceService } from "./workspace-service.js";

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
		expect(current.branch).toBe("main");
		expect(current.validationStatus).toBe("valid");
		const base = service.resolveBaseTarget("main");
		expect(base.baseBranch).toBe("main");
		expect(base.baseCommit).toHaveLength(40);
	});

	test("creates isolated worktrees under .daedalus/worktrees/<slug>", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const target = service.createIsolatedTarget({ branch: "agent/task-2", slug: "task-2" });
		expect(target.cwd).toBe(join(repo, ".daedalus", "worktrees", "task-2"));
		expect(target.isolationMode).toBe("dedicated_worktree");
		expect(target.branch).toBe("agent/task-2");
		expect(existsSync(join(target.cwd, "README.md"))).toBe(true);
	});

	test("opens/adopts existing worktree by path branch and id", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const created = service.createIsolatedTarget({ branch: "agent/adopt", slug: "adopt" });
		expect(service.openTarget({ cwd: created.cwd }).cwd).toBe(created.cwd);
		expect(service.openTarget({ branch: "agent/adopt" }).branch).toBe("agent/adopt");
		expect(service.openTarget({ id: "agent-adopt" }).adoption?.adoptedFromPath).toBe(created.cwd);
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
});
