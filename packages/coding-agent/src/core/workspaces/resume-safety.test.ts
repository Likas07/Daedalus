import { afterEach, describe, expect, test } from "bun:test";
import * as crypto from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertWorkspaceResumeSafe,
	getWorkspaceResumeSafetyDiagnostic,
	MissingSessionCwdError,
	WorkspaceResumeSafetyError,
} from "../session-cwd.js";
import { SessionManager } from "../session-manager.js";
import type { WorkspaceSessionIdentity, WorkspaceTarget } from "./types.js";
import { WorkspaceService } from "./workspace-service.js";

const roots: string[] = [];

function tmp(name: string): string {
	const path = mkdtempSync(join(tmpdir(), `daedalus-${name}-`));
	roots.push(path);
	return path;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sh(cwd: string, args: string[]): void {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString() || `${args.join(" ")} failed`);
}

function initRepo(): string {
	const repo = tmp("resume-repo");
	sh(repo, ["git", "init", "-b", "main"]);
	sh(repo, ["git", "config", "user.email", "test@example.com"]);
	sh(repo, ["git", "config", "user.name", "Test"]);
	writeFileSync(join(repo, "README.md"), "ok\n");
	sh(repo, ["git", "add", "README.md"]);
	sh(repo, ["git", "commit", "-m", "init"]);
	return repo;
}

function manager(cwd: string, workspaceIdentity?: WorkspaceSessionIdentity): SessionManager {
	const sessionDir = join(tmp("resume-sessions"), "sessions");
	mkdirSync(sessionDir, { recursive: true });
	const sessionFile = join(sessionDir, `${crypto.randomUUID()}.jsonl`);
	writeFileSync(
		sessionFile,
		`${JSON.stringify({ type: "session", version: 3, id: crypto.randomUUID(), timestamp: new Date().toISOString(), cwd, workspaceIdentity })}\n`,
	);
	return SessionManager.open(sessionFile, sessionDir);
}

function identity(workspace: WorkspaceTarget): WorkspaceSessionIdentity {
	return { version: 1, workspace };
}

describe("workspace resume safety", () => {
	test("missing cwd remains MissingSessionCwdError-compatible and structured", () => {
		const cwd = tmp("missing-cwd");
		const session = manager(cwd);
		rmSync(cwd, { recursive: true, force: true });
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, tmp("fallback"));
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("missing_cwd");
		expect(() => assertWorkspaceResumeSafe(session, tmp("fallback"))).toThrow(WorkspaceResumeSafetyError);
		expect(() => assertWorkspaceResumeSafe(session, tmp("fallback"))).toThrow(MissingSessionCwdError);
	});

	test("cwd-only sessions resume safely from the same cwd", () => {
		const cwd = tmp("legacy");
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(manager(cwd), cwd);
		expect(diagnostic?.ok).toBe(true);
		expect(diagnostic?.issues).toEqual([]);
		expect(() => assertWorkspaceResumeSafe(manager(cwd), cwd)).not.toThrow();
	});

	test("cwd-only sessions with a different cwd still require adoption", () => {
		const cwd = tmp("legacy");
		const fallback = tmp("fallback");
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(manager(cwd), fallback);
		expect(diagnostic?.ok).toBe(false);
		expect(diagnostic?.issues).toContainEqual(
			expect.objectContaining({ code: "legacy_unknown", recovery: "adopt_workspace" }),
		);
	});

	test("detached workspace identity resumes without git metadata", () => {
		const cwd = tmp("detached-resume");
		const session = manager(
			cwd,
			identity({ cwd, projectRoot: cwd, isolationMode: "detached", validationStatus: "valid" }),
		);
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, cwd, new WorkspaceService({ projectRoot: cwd }));
		expect(diagnostic?.ok).toBe(true);
		expect(diagnostic?.issues).toEqual([]);
		expect(() => assertWorkspaceResumeSafe(session, cwd, new WorkspaceService({ projectRoot: cwd }))).not.toThrow();
	});

	test("detached workspace identity ignores current projectRoot mismatches", () => {
		const cwd = tmp("detached-cross-project");
		const otherProject = tmp("detached-other-project");
		const session = manager(
			cwd,
			identity({ cwd, projectRoot: cwd, isolationMode: "detached", validationStatus: "valid" }),
		);
		const service = new WorkspaceService({ projectRoot: otherProject });
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, otherProject, service);
		expect(diagnostic?.ok).toBe(true);
		expect(diagnostic?.issues).toEqual([]);
		expect(() => assertWorkspaceResumeSafe(session, otherProject, service)).not.toThrow();
	});

	test("detached workspace identity is unsafe when cwd is missing", () => {
		const cwd = tmp("detached-missing");
		const session = manager(
			cwd,
			identity({ cwd, projectRoot: cwd, isolationMode: "detached", validationStatus: "valid" }),
		);
		rmSync(cwd, { recursive: true, force: true });
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, tmp("fallback"));
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("missing_cwd");
		expect(() => assertWorkspaceResumeSafe(session, tmp("fallback"))).toThrow(WorkspaceResumeSafetyError);
	});

	test("canonical path mismatch is unsafe", () => {
		const repo = initRepo();
		const other = tmp("other-cwd");
		const target = new WorkspaceService({ projectRoot: repo }).resolveCurrentTarget(repo);
		const session = manager(other, identity(target));
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(
			session,
			other,
			new WorkspaceService({ projectRoot: repo }),
		);
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("canonical_path_mismatch");
	});

	test("missing worktree is unsafe", () => {
		const repo = initRepo();
		const target = new WorkspaceService({ projectRoot: repo }).createIsolatedTarget({ branch: "agent/missing" });
		const session = manager(target.cwd, identity(target));
		rmSync(target.cwd, { recursive: true, force: true });
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, repo, new WorkspaceService({ projectRoot: repo }));
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("missing_worktree");
	});

	test("branch mismatch is unsafe", () => {
		const repo = initRepo();
		const target = new WorkspaceService({ projectRoot: repo }).resolveCurrentTarget(repo);
		const session = manager(repo, identity({ ...target, branch: "agent/expected" }));
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(session, repo, new WorkspaceService({ projectRoot: repo }));
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("branch_mismatch");
	});

	test("project mismatch is unsafe", () => {
		const repo = initRepo();
		const otherProject = tmp("other-project");
		mkdirSync(otherProject, { recursive: true });
		const target = new WorkspaceService({ projectRoot: repo }).resolveCurrentTarget(repo);
		const session = manager(repo, identity(target));
		const diagnostic = getWorkspaceResumeSafetyDiagnostic(
			session,
			repo,
			new WorkspaceService({ projectRoot: otherProject }),
		);
		expect(diagnostic?.issues.map((issue) => issue.code)).toContain("project_mismatch");
	});
});
