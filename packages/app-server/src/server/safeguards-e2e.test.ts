import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SessionResumeIdentity } from "@daedalus-pi/app-server-protocol";
import {
	AppRouter,
	type AppServerDatabase,
	appendEvent,
	type EventPayload,
	openAppServerDatabase,
	ProjectService,
	runMigrations,
	SqliteSessionStore,
	WorktreeService,
} from "..";
import { createSessionIdentitySnapshot } from "../sessions/session-identity";
import { git } from "../workspaces/git";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function db(): AppServerDatabase {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return database;
}

function router(
	database: AppServerDatabase,
	input: { resumeStatus?: string; identities?: SessionResumeIdentity[] } = {},
): AppRouter {
	return new AppRouter({
		database,
		publish: () => {},
		controller: {
			readState: () => ({ sessions: [] }),
			startSession: async (params: { runsIn?: unknown }) => ({
				sessionId: "session-started",
				runsIn: params.runsIn,
			}),
			startTurn: async () => ({ turnId: "turn-1" }),
			resumeSession: async (params: { sessionId: string; identity?: SessionResumeIdentity }) => {
				if (params.identity) input.identities?.push(params.identity);
				return {
					sessionId: params.sessionId,
					status: input.resumeStatus ?? (params.identity?.status === "matched" ? "active" : "needs-attention"),
					identity: params.identity,
				};
			},
			interruptTurn: async () => {},
			disposeSession: async () => {},
		} as never,
	});
}

async function initRepo(prefix = "daedalus-safeguards-"): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
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

async function openProject(appRouter: AppRouter, path: string): Promise<string> {
	const opened = (await appRouter.handle({
		kind: "request",
		id: "open",
		method: "project/open",
		params: { path },
	})) as { projectId: string };
	return opened.projectId;
}

describe("safeguard end-to-end regressions", () => {
	test("router worktree/create returns typed created, adopted, and conflict outcomes", async () => {
		const appRouter = router(db());
		const repo = await initRepo();
		const projectId = await openProject(appRouter, repo);
		const target = join(repo, "..", "feature-wt");

		const created = await appRouter.handle({
			kind: "request",
			id: "create",
			method: "worktree/create",
			params: { projectId, branch: "feature/safe", path: target, operationId: "op-create" } as never,
		});
		expect(created).toMatchObject({
			outcome: "created",
			operationId: "op-create",
			worktree: { projectId, branch: "feature/safe" },
		});

		const adopted = await appRouter.handle({
			kind: "request",
			id: "adopt",
			method: "worktree/create",
			params: { projectId, branch: "feature/safe", path: target, operationId: "op-adopt" } as never,
		});
		expect(adopted).toMatchObject({
			outcome: "adopted-existing",
			operationId: "op-adopt",
			worktree: { projectId, branch: "feature/safe" },
		});

		const conflict = await appRouter.handle({
			kind: "request",
			id: "conflict",
			method: "worktree/create",
			params: { projectId, branch: "feature/other", path: target, operationId: "op-conflict" } as never,
		});
		expect(conflict).toMatchObject({
			outcome: "conflict",
			reason: "path-exists",
			operationId: "op-conflict",
			existingPath: resolve(target),
		});
	});

	test("worktree creation rollback reports a typed rolled-back outcome", async () => {
		const database = db();
		const repo = await initRepo("daedalus-safeguards-rollback-");
		const projectId = new ProjectService({ database }).open({ path: repo }).projectId;
		const service = new WorktreeService({
			database,
			afterGitCreate: async () => {
				throw new Error("simulated post-create failure");
			},
		});

		const outcome = await service.createOrAdoptWorktree({
			projectId,
			branch: "feature/rollback",
			path: join(repo, "..", "rollback-wt"),
			operationId: "op-rollback",
		});
		expect(outcome).toMatchObject({
			outcome: "rolled-back",
			operationId: "op-rollback",
			message: expect.stringContaining("simulated post-create failure"),
		});
	});

	test("cleanup scan blocks risky cleanup until the matching confirmation token is supplied", async () => {
		const appRouter = router(db());
		const repo = await initRepo("daedalus-safeguards-cleanup-");
		const projectId = await openProject(appRouter, repo);
		const created = (await appRouter.handle({
			kind: "request",
			id: "create",
			method: "worktree/create",
			params: { projectId, branch: "feature/cleanup" },
		})) as { worktree: { id: string; path: string } };
		await writeFile(join(created.worktree.path, "dirty.txt"), "dirty\n");

		await expect(
			appRouter.handle({
				kind: "request",
				id: "cleanup",
				method: "worktree/cleanup",
				params: { worktreeId: created.worktree.id, operationId: "op-clean" },
			}),
		).rejects.toThrow("confirmation token");
		const scan = (await appRouter.handle({
			kind: "request",
			id: "scan",
			method: "worktree/cleanup-scan",
			params: { worktreeId: created.worktree.id, operationId: "op-clean" },
		})) as { cleanupRisk: { risky: boolean; confirmationToken?: string } };
		expect(scan.cleanupRisk).toMatchObject({ risky: true, confirmationToken: expect.any(String) });
		await expect(
			appRouter.handle({
				kind: "request",
				id: "cleanup-confirmed",
				method: "worktree/cleanup",
				params: {
					worktreeId: created.worktree.id,
					operationId: "op-clean",
					confirmationToken: scan.cleanupRisk.confirmationToken,
					force: true,
				},
			}),
		).resolves.toEqual({ ok: true });
	});

	test("structured diff targets reject unknown/outside-root worktrees", async () => {
		const appRouter = router(db());
		const repo = await initRepo("daedalus-safeguards-diff-");
		const projectId = await openProject(appRouter, repo);

		await expect(
			appRouter.handle({
				kind: "request",
				id: "diff",
				method: "diff/get",
				params: { target: { kind: "worktree", projectId, worktreeId: "missing-worktree" } },
			}),
		).rejects.toThrow("Unknown worktree");
	});

	test("verified resume surfaces identity mismatch before continuing", async () => {
		const database = db();
		const identities: SessionResumeIdentity[] = [];
		const appRouter = router(database, { identities });
		const original = await mkdtemp(join(tmpdir(), "daedalus-safeguards-resume-original-"));
		const moved = await mkdtemp(join(tmpdir(), "daedalus-safeguards-resume-moved-"));
		const sessionStore = new SqliteSessionStore({ database });
		await sessionStore.import({
			session: {
				header: { type: "session", version: 3, id: "resume-1", timestamp: "now", cwd: moved },
				entries: [],
			},
		});
		appendEvent(database, {
			streamId: "resume-1",
			type: "session/started",
			payload: {
				sessionId: "resume-1",
				identity: (await createSessionIdentitySnapshot({
					sessionId: "resume-1",
					cwd: original,
					sessionFile: "sqlite://resume-1",
				})) as unknown as EventPayload,
			},
		});

		const result = await appRouter.handle({
			kind: "request",
			id: "resume",
			method: "session/resume",
			params: { sessionId: "resume-1", prompt: "continue" },
		});
		expect(result).toMatchObject({
			sessionId: "resume-1",
			status: "needs-attention",
			identity: { status: "mismatched" },
		});
		expect(identities[0]).toMatchObject({ status: "mismatched" });
	});

	test("guarded terminal create rejects cwd outside the requested project root", async () => {
		const appRouter = router(db());
		const repo = await initRepo("daedalus-safeguards-terminal-");
		const projectId = await openProject(appRouter, repo);
		const outside = await mkdtemp(join(tmpdir(), "daedalus-terminal-outside-"));

		await expect(
			appRouter.handle({
				kind: "request",
				id: "terminal",
				method: "terminal/create",
				params: { projectId, cwd: outside, cols: 80, rows: 24 },
			}),
		).rejects.toThrow("outside requested project/worktree scope");
	});
});
