import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent, type EventPayload } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { createSessionIdentitySnapshot, verifySessionResumeIdentity } from "./session-identity";

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

async function registerIdentity(options: {
	readonly cwd: string;
	readonly worktreePath?: string;
	readonly sessionFile?: string;
}) {
	const database = db();
	const projectPath = await mkdtemp(join(tmpdir(), "dae-project-"));
	const worktreePath = options.worktreePath ?? options.cwd;
	appendEvent(database, {
		streamId: "project:p1",
		type: "project/registered",
		payload: { projectId: "p1", name: "Project", path: projectPath },
	});
	appendEvent(database, {
		streamId: "worktree:w1",
		type: "worktree/registered",
		payload: { projectId: "p1", worktreeId: "w1", path: worktreePath, branch: "main" },
	});
	appendEvent(database, {
		streamId: "s1",
		type: "session/started",
		payload: {
			sessionId: "s1",
			projectId: "p1",
			worktreeId: "w1",
			identity: (await createSessionIdentitySnapshot({
				sessionId: "s1",
				cwd: options.cwd,
				sessionFile: options.sessionFile ?? "sqlite://s1",
				projectId: "p1",
				worktreeId: "w1",
				runsIn: {
					projectId: "p1",
					worktreeId: "w1",
					path: options.cwd,
					canonicalPath: options.cwd,
					branch: "main",
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
			})) as unknown as EventPayload,
		},
	});
	return database;
}

describe("session resume identity", () => {
	test("matches the stored project/worktree/canonical/session file identity", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "dae-wt-"));
		const database = await registerIdentity({ cwd });

		const result = await verifySessionResumeIdentity({ database, sessionId: "s1", cwd, sessionFile: "sqlite://s1" });

		expect(result.status).toBe("matched");
		expect(result.storedWorktreeId).toBe("w1");
	});

	test("projects core workspaceTarget metadata into resume identity snapshots", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "dae-core-target-"));
		const identity = await createSessionIdentitySnapshot({
			sessionId: "s-core",
			cwd,
			sessionFile: "sqlite://s-core",
			workspaceTarget: {
				id: "core-target",
				cwd,
				projectRoot: "project-core",
				branch: "feature/core",
				isolationMode: "dedicated_worktree",
				validationStatus: "valid",
			},
		});

		expect(identity).toMatchObject({
			projectId: "project-core",
			worktreeId: "core-target",
			branch: "feature/core",
			isolationMode: "isolated-worktree",
			workspaceTarget: expect.objectContaining({ id: "core-target", isolationMode: "dedicated_worktree" }),
		});
	});

	test("blocks missing identity before runtime resume", async () => {
		const database = db();
		const cwd = await mkdtemp(join(tmpdir(), "dae-wt-"));

		const result = await verifySessionResumeIdentity({
			database,
			sessionId: "missing",
			cwd,
			sessionFile: "sqlite://missing",
		});

		expect(result.status).toBe("missing");
		expect(result.message).toContain("missing");
	});

	test("detects moved or wrong-worktree cwd", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "dae-wt-"));
		const other = await mkdtemp(join(tmpdir(), "dae-other-wt-"));
		const database = await registerIdentity({ cwd });

		const result = await verifySessionResumeIdentity({
			database,
			sessionId: "s1",
			cwd: other,
			sessionFile: "sqlite://s1",
		});

		expect(result.status).toBe("mismatched");
		expect(result.message).toContain("canonical");
	});

	test("detects symlinked worktree paths", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "dae-wt-"));
		const link = `${cwd}-link`;
		await symlink(cwd, link);
		const database = await registerIdentity({ cwd, worktreePath: link });

		const result = await verifySessionResumeIdentity({ database, sessionId: "s1", cwd, sessionFile: "sqlite://s1" });

		expect(result.status).toBe("mismatched");
		expect(result.message).toContain("symlink");
	});
});
