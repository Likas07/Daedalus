import { mkdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEntriesFromFile, type SessionHeader, SessionManager } from "../../src/core/session-manager.js";
import type { WorkspaceSessionIdentity } from "../../src/core/workspaces/session-identity.js";

describe("SessionManager.forkFrom workspace identity", () => {
	let tempDir: string;
	let sourceDir: string;
	let targetDir: string;
	let sourceCwd: string;
	let targetCwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-fork-workspace-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		sourceDir = join(tempDir, "source-sessions");
		targetDir = join(tempDir, "target-sessions");
		sourceCwd = join(tempDir, "source-workspace");
		targetCwd = join(tempDir, "target-workspace");
		mkdirSync(sourceDir, { recursive: true });
		mkdirSync(targetDir, { recursive: true });
		mkdirSync(sourceCwd, { recursive: true });
		mkdirSync(targetCwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createPersistedSourceSession(workspaceIdentity?: WorkspaceSessionIdentity): SessionManager {
		const source = SessionManager.create(sourceCwd, sourceDir);
		if (workspaceIdentity) {
			source.setWorkspaceIdentity(workspaceIdentity);
		}
		source.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
		source.appendMessage({ role: "assistant", content: "hi", timestamp: Date.now() });
		return source;
	}

	it("can fork into the current workspace identity while preserving source lineage", () => {
		const source = createPersistedSourceSession({
			version: 1,
			sessionId: "source-session-placeholder",
			workspace: {
				cwd: sourceCwd,
				isolationMode: "shared_cwd",
				repositoryRoot: sourceCwd,
				branch: "old-branch",
			},
		});
		const sourcePath = source.getSessionFile();
		expect(sourcePath).toBeTruthy();

		const currentWorkspaceIdentity: WorkspaceSessionIdentity = {
			version: 1,
			workspace: {
				cwd: targetCwd,
				isolationMode: "shared_cwd",
				repositoryRoot: targetCwd,
				branch: "current-branch",
			},
			lineage: {
				parentSessionId: "preexisting-parent",
			},
		};

		const forked = SessionManager.forkFrom(sourcePath!, targetCwd, targetDir, currentWorkspaceIdentity);
		const forkedHeader = forked.getHeader();

		expect(forked.getCwd()).toBe(targetCwd);
		expect(forkedHeader?.cwd).toBe(targetCwd);
		expect(forkedHeader?.parentSession).toBe(sourcePath);
		expect(forkedHeader?.workspaceIdentity?.sessionId).toBe(forked.getSessionId());
		expect(forkedHeader?.workspaceIdentity?.workspace.cwd).toBe(targetCwd);
		expect(forkedHeader?.workspaceIdentity?.workspace.branch).toBe("current-branch");
		expect(forkedHeader?.workspaceIdentity?.workspace.repositoryRoot).toBe(targetCwd);
		expect(forkedHeader?.workspaceIdentity?.lineage).toMatchObject({
			parentSessionId: source.getSessionId(),
			parentSessionPath: sourcePath,
			sourceSessionId: source.getSessionId(),
			sourceSessionPath: sourcePath,
		});
		expect(forkedHeader?.workspaceIdentity?.lineage?.forkedAt).toBe(forkedHeader?.timestamp);

		const sourceMessages = source.getEntries().filter((entry) => entry.type === "message");
		const forkedMessages = forked.getEntries().filter((entry) => entry.type === "message");
		expect(forkedMessages).toEqual(sourceMessages);
	});

	it("keeps legacy fork behavior when no workspace identity override is provided", () => {
		const source = createPersistedSourceSession({
			version: 1,
			workspace: {
				cwd: sourceCwd,
				isolationMode: "shared_cwd",
				branch: "source-branch",
			},
		});
		const sourcePath = source.getSessionFile();
		expect(sourcePath).toBeTruthy();

		const forked = SessionManager.forkFrom(sourcePath!, targetCwd, targetDir);
		const forkedHeader = forked.getHeader();

		expect(forkedHeader?.workspaceIdentity?.workspace.cwd).toBe(sourceCwd);
		expect(forkedHeader?.workspaceIdentity?.workspace.branch).toBe("source-branch");
		expect(forkedHeader?.workspaceIdentity?.lineage).toMatchObject({
			parentSessionId: source.getSessionId(),
			parentSessionPath: sourcePath,
			sourceSessionId: source.getSessionId(),
			sourceSessionPath: sourcePath,
		});
	});

	it("writes the overridden workspace identity to the forked session file", () => {
		const source = createPersistedSourceSession();
		const sourcePath = source.getSessionFile();
		expect(sourcePath).toBeTruthy();

		const forked = SessionManager.forkFrom(sourcePath!, targetCwd, targetDir, {
			version: 1,
			workspace: {
				cwd: targetCwd,
				isolationMode: "shared_cwd",
				branch: "persisted-current-branch",
			},
		});
		const forkedPath = forked.getSessionFile();
		expect(forkedPath).toBeTruthy();

		const [fileHeader] = loadEntriesFromFile(forkedPath!) as [SessionHeader];
		expect(fileHeader.workspaceIdentity?.workspace.cwd).toBe(targetCwd);
		expect(fileHeader.workspaceIdentity?.workspace.branch).toBe("persisted-current-branch");
		expect(fileHeader.workspaceIdentity?.lineage?.sourceSessionPath).toBe(sourcePath);

		const rawContent = readFileSync(forkedPath!, "utf-8");
		expect(rawContent).toContain("persisted-current-branch");
	});
});
