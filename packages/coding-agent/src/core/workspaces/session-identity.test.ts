import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionHeader, SessionManager } from "../session-manager.js";
import { normalizeWorkspaceSessionIdentity, workspaceTargetFromCwd } from "./session-identity.js";

const tempDirs: string[] = [];

function tempSessionDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-workspace-session-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function assistantMessage(text: string) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "anthropic-messages" as const,
		provider: "anthropic",
		model: "claude",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp: Date.now(),
	};
}

describe("workspace session identity", () => {
	test("normalizes cwd-only workspace targets", () => {
		expect(workspaceTargetFromCwd("/workspace/project")).toEqual({
			cwd: "/workspace/project",
			isolationMode: "shared_cwd",
		});
	});

	test("new sessions persist workspace identity in the header", () => {
		const dir = tempSessionDir();
		const manager = SessionManager.create("/workspace/project", dir);
		manager.setWorkspaceIdentity(
			normalizeWorkspaceSessionIdentity(
				{
					workspace: {
						id: "workspace-1",
						name: "Project",
						cwd: "/workspace/project",
						isolationMode: "dedicated_worktree",
						worktreePath: "/workspace/project",
						validationStatus: "valid",
					},
				},
				{ cwd: "/workspace/project", sessionId: manager.getSessionId(), now: "2026-05-03T00:00:00.000Z" },
			),
		);

		manager.appendMessage({ role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() });
		manager.appendMessage(assistantMessage("hi"));

		const reopened = SessionManager.open(manager.getSessionFile()!, dir);
		expect(reopened.getCwd()).toBe("/workspace/project");
		expect(reopened.getWorkspaceIdentity()?.workspace.id).toBe("workspace-1");
		expect(reopened.getWorkspaceIdentity()?.workspace.isolationMode).toBe("dedicated_worktree");
		expect(reopened.getWorkspaceIdentity()?.sessionId).toBe(manager.getSessionId());
	});

	test("old cwd-only sessions remain readable without workspace identity", () => {
		const dir = tempSessionDir();
		const file = join(dir, "old.jsonl");
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: "old-session",
			timestamp: "2026-05-03T00:00:00.000Z",
			cwd: "/old/project",
		};
		writeFileSync(file, `${JSON.stringify(header)}\n`);

		const manager = SessionManager.open(file, dir);
		expect(manager.getCwd()).toBe("/old/project");
		expect(manager.getWorkspaceIdentity()).toBeUndefined();
	});

	test("forked sessions preserve source lineage and workspace identity", () => {
		const sourceDir = tempSessionDir();
		const targetDir = tempSessionDir();
		const source = SessionManager.create("/workspace/source", sourceDir);
		source.setWorkspaceIdentity(
			normalizeWorkspaceSessionIdentity(
				{
					workspace: {
						id: "workspace-source",
						cwd: "/workspace/source",
						isolationMode: "dedicated_worktree",
						worktreePath: "/workspace/source",
					},
				},
				{ cwd: "/workspace/source", sessionId: source.getSessionId(), now: "2026-05-03T00:00:00.000Z" },
			),
		);
		source.appendMessage({ role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() });
		source.appendMessage(assistantMessage("hi"));

		const fork = SessionManager.forkFrom(source.getSessionFile()!, "/workspace/target", targetDir);
		const identity = fork.getWorkspaceIdentity();

		expect(fork.getHeader()?.parentSession).toBe(source.getSessionFile());
		expect(identity?.workspace.id).toBe("workspace-source");
		expect(identity?.workspace.cwd).toBe("/workspace/source");
		expect(identity?.sessionId).toBe(fork.getSessionId());
		expect(identity?.lineage?.parentSessionId).toBe(source.getSessionId());
		expect(identity?.lineage?.sourceSessionId).toBe(source.getSessionId());
		expect(identity?.lineage?.sourceSessionPath).toBe(source.getSessionFile());
	});
});
