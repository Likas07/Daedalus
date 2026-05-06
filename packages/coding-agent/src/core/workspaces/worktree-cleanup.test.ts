import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
	const dir = mkdtempSync(join(tmpdir(), "daedalus-worktree-cleanup-"));
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

describe("WorkspaceService cleanup hygiene", () => {
	test("prunes stale worktree records after directories disappear", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const stalePath = `${repo}-stale`;
		tempDirs.push(stalePath);
		sh(repo, ["git", "worktree", "add", "-b", "agent/stale-prune", stalePath, "HEAD"]);
		rmSync(stalePath, { recursive: true, force: true });

		expect(service.listWorktrees().some((entry) => entry.path === stalePath)).toBe(true);
		service.pruneStaleWorktrees();
		expect(service.listWorktrees().some((entry) => entry.path === stalePath)).toBe(false);
	});

	test("classifies missing, managed, dirty, and external cleanup risk", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const managed = service.createIsolatedTarget({ branch: "agent/cleanup-risk", slug: "cleanup-risk" });

		expect(service.cleanupTargetRisk(managed)).toMatchObject({ safe: true, level: "safe" });

		writeFileSync(join(managed.cwd, "dirty.txt"), "dirty\n");
		const dirty = service.cleanupTargetRisk(managed);
		expect(dirty.safe).toBe(false);
		expect(dirty.level).toBe("dirty");
		expect(dirty.dirtyStatus).toContain("dirty.txt");

		const externalPath = mkdtempSync(join(tmpdir(), "daedalus-external-cleanup-"));
		rmSync(externalPath, { recursive: true, force: true });
		tempDirs.push(externalPath);
		sh(repo, ["git", "worktree", "add", "-b", "agent/external-cleanup", externalPath, "HEAD"]);
		expect(service.cleanupTargetRisk(service.openTarget({ cwd: externalPath }))).toMatchObject({
			safe: false,
			level: "external",
		});

		rmSync(managed.cwd, { recursive: true, force: true });
		expect(service.cleanupTargetRisk(managed)).toMatchObject({ safe: true, level: "none" });
	});

	test("removes clean managed worktrees but refuses dirty and external targets unless forced", () => {
		const repo = tempRepo();
		const service = new WorkspaceService({ projectRoot: repo });
		const clean = service.createIsolatedTarget({
			branch: "agent/remove-cleanup-clean",
			slug: "remove-cleanup-clean",
		});
		service.removeTarget(clean);
		expect(existsSync(clean.cwd)).toBe(false);

		const dirty = service.createIsolatedTarget({
			branch: "agent/remove-cleanup-dirty",
			slug: "remove-cleanup-dirty",
		});
		writeFileSync(join(dirty.cwd, "dirty.txt"), "dirty\n");
		expect(() => service.removeTarget(dirty)).toThrow(/Refusing/);
		service.removeTarget(dirty, { force: true });
		expect(existsSync(dirty.cwd)).toBe(false);

		const externalPath = mkdtempSync(join(tmpdir(), "daedalus-external-remove-"));
		rmSync(externalPath, { recursive: true, force: true });
		tempDirs.push(externalPath);
		sh(repo, ["git", "worktree", "add", "-b", "agent/remove-external", externalPath, "HEAD"]);
		const external = service.openTarget({ cwd: externalPath });
		expect(() => service.removeTarget(external)).toThrow(/Refusing/);
		service.removeTarget(external, { force: true });
		expect(existsSync(externalPath)).toBe(false);
	});
});
