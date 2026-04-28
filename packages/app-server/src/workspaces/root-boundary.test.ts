import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RootScopedTarget } from "@daedalus-pi/app-server-protocol";
import { appendEvent, type EventPayload } from "..";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { ProjectService } from "./project-service";
import { assertPathWithinRoot, RootBoundaryError, resolveRootScopedTarget } from "./root-boundary";

let db: Database;
let root: string;

beforeEach(async () => {
	db = new Database(":memory:", { strict: true });
	runMigrations(db);
	root = await mkdtemp(join(tmpdir(), "daedalus-root-boundary-"));
});

afterEach(() => db.close());

describe("resolveRootScopedTarget", () => {
	test("resolves a valid project root", async () => {
		const projectRoot = await directory("project");
		const project = new ProjectService({ database: db }).open({ path: projectRoot });

		const target = await resolveRootScopedTarget({
			database: db,
			target: { kind: "project", projectId: project.projectId },
		});

		expect(target.projectId).toBe(project.projectId);
		expect(target.rootPath).toBe(resolve(projectRoot));
		expect(target.targetPath).toBe(resolve(projectRoot));
		expect(target.canonicalRootPath).toBe(await realpath(projectRoot));
		expect(target.canonicalTargetPath).toBe(await realpath(projectRoot));
	});

	test("resolves a valid worktree root", async () => {
		const projectRoot = await directory("project");
		const worktreeRoot = await directory("project-worktree");
		const project = new ProjectService({ database: db }).open({ path: projectRoot });
		rememberWorktree({
			projectId: project.projectId,
			worktreeId: "worktree-1",
			path: worktreeRoot,
			branch: "feature/root-boundary",
		});

		const target = await resolveRootScopedTarget({
			database: db,
			target: { kind: "worktree", projectId: project.projectId, worktreeId: "worktree-1" },
		});

		expect(target.projectId).toBe(project.projectId);
		expect(target.rootPath).toBe(resolve(worktreeRoot));
		expect(target.canonicalRootPath).toBe(target.canonicalTargetPath);
	});

	test("resolves a valid session runtime cwd from read models", async () => {
		const projectRoot = await directory("project");
		const project = new ProjectService({ database: db }).open({ path: projectRoot });
		const runsIn = await assertPathWithinRoot({
			root: projectRoot,
			candidate: projectRoot,
			purpose: "session",
			projectId: project.projectId,
		});
		rememberSession({ projectId: project.projectId, sessionId: "session-1", runsIn });

		const target = await resolveRootScopedTarget({
			database: db,
			target: { kind: "session", projectId: project.projectId, sessionId: "session-1" },
		});

		expect(target).toEqual(runsIn);
	});

	test("rejects unknown targets", async () => {
		await expect(
			resolveRootScopedTarget({ database: db, target: { kind: "project", projectId: "missing-project" } }),
		).rejects.toThrow("Unknown project");
		await expect(
			resolveRootScopedTarget({ database: db, target: { kind: "worktree", worktreeId: "missing-worktree" } }),
		).rejects.toThrow("Unknown worktree");
	});

	test("rejects canonical path mismatches for already-scoped targets", async () => {
		const projectRoot = await directory("project");
		const target = await assertPathWithinRoot({ root: projectRoot, candidate: projectRoot, purpose: "operation" });
		const staleTarget: RootScopedTarget = { ...target, canonicalTargetPath: join(root, "stale") };

		await expect(resolveRootScopedTarget({ database: db, target: staleTarget })).rejects.toMatchObject({
			violation: { message: expect.stringContaining("canonical path mismatch") },
		});
	});
});

describe("assertPathWithinRoot", () => {
	test("rejects symlink escapes", async () => {
		const projectRoot = await directory("project");
		const outside = await directory("outside");
		const link = join(projectRoot, "escape");
		await symlink(outside, link);

		await expect(
			assertPathWithinRoot({ root: projectRoot, candidate: link, purpose: "operation" }),
		).rejects.toMatchObject({
			violation: { reason: "symlink-escape" },
		});
	});

	test("rejects dot-dot traversal outside the root", async () => {
		const projectRoot = await directory("project");
		const outside = await directory("outside");

		await expect(
			assertPathWithinRoot({
				root: projectRoot,
				candidate: join(projectRoot, "..", "outside"),
				purpose: "operation",
			}),
		).rejects.toMatchObject({ violation: { reason: "target-outside-root", resolvedPath: resolve(outside) } });
	});

	test("rejects sibling-prefix paths", async () => {
		const projectRoot = await directory("app");
		const sibling = await directory("app-copy");

		await expect(
			assertPathWithinRoot({ root: projectRoot, candidate: sibling, purpose: "operation" }),
		).rejects.toBeInstanceOf(RootBoundaryError);
	});

	test("rejects missing roots", async () => {
		const missingRoot = join(root, "missing-root");

		await expect(
			assertPathWithinRoot({ root: missingRoot, candidate: join(missingRoot, "file.txt"), purpose: "operation" }),
		).rejects.toMatchObject({ violation: { reason: "root-missing" } });
	});

	test("allows missing targets under an existing root using the nearest existing parent", async () => {
		const projectRoot = await directory("project");
		const nested = join(projectRoot, "missing", "child.txt");

		const target = await assertPathWithinRoot({ root: projectRoot, candidate: nested, purpose: "operation" });

		expect(target.targetPath).toBe(resolve(nested));
		expect(target.canonicalTargetPath).toBe(resolve(projectRoot, "missing", "child.txt"));
	});
});

async function directory(name: string): Promise<string> {
	const path = join(root, name);
	await mkdir(path, { recursive: true });
	return path;
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

function rememberSession(input: { projectId: string; sessionId: string; runsIn: RootScopedTarget }): void {
	appendEvent(db, {
		streamId: `project:${input.projectId}`,
		type: "session/started",
		payload: {
			sessionId: input.sessionId,
			projectId: input.projectId,
			status: "active",
			runsIn: {
				projectId: input.projectId,
				path: input.runsIn.rootPath,
				canonicalPath: input.runsIn.canonicalRootPath,
				branch: null,
				isolationMode: "shared-project",
				validationStatus: "valid",
			},
		} satisfies EventPayload,
	});
	projectRuntimeEvents(db);
}
