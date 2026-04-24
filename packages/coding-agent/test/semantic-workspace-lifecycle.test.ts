import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { getSemanticWorkspaceStatus } from "../src/extensions/daedalus/tools/semantic-workspace.js";

function getText(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("semantic workspace lifecycle", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n",
		);
		writeFileSync(join(tempDir, "src", "auth.ts"), "export function authenticate() {\n  return 'alpha';\n}\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("reports uninitialized status and blocks sem_search before init", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		const semSearch = session.getToolDefinition("sem_search");
		expect(semSearch).toBeDefined();

		const status = getSemanticWorkspaceStatus(tempDir);
		expect(status).toMatchObject({ initialized: false, ready: false, state: "uninitialized" });
		expect(status.state).toBe("uninitialized");

		await expect(
			semSearch!.execute(
				"sem-search-unready",
				{
					queries: [{ query: "token refresh flow", use_case: "find token refresh implementation" }],
					path: ".",
					limit: 3,
				},
				undefined,
				undefined,
				{ cwd: tempDir } as any,
			),
		).rejects.toThrow(/sem_workspace_init|workspace.*uninitialized/i);

		session.dispose();
	});

	it("initializes, syncs, and then serves indexed semantic results", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		const semSearch = session.getToolDefinition("sem_search");
		expect(semSearch).toBeDefined();

		await session.prompt("/workspace-init");
		const initStatusMessage = session.messages
			.filter((message) => message.role === "custom" && message.customType === "semantic-workspace-status")
			.at(-1);
		expect(typeof initStatusMessage?.content === "string" ? initStatusMessage.content : "").toContain(
			"state: initialized",
		);

		await expect(
			semSearch!.execute(
				"sem-search-initialized-only",
				{
					queries: [{ query: "token refresh flow", use_case: "find token refresh implementation" }],
					path: ".",
					limit: 3,
				},
				undefined,
				undefined,
				{ cwd: tempDir } as any,
			),
		).rejects.toThrow(/initialized but not indexed|sem_workspace_sync/i);

		const statusAfterInit = getSemanticWorkspaceStatus(tempDir);
		expect(statusAfterInit).toMatchObject({ initialized: true, ready: false, state: "initialized" });

		await session.prompt("/workspace-sync");
		const status = getSemanticWorkspaceStatus(tempDir);
		expect(status).toMatchObject({ initialized: true, ready: true, state: "ready" });
		expect(status.chunkCount).toBeGreaterThan(0);

		const info = getSemanticWorkspaceStatus(tempDir);
		expect(info.chunkCount).toBeGreaterThan(0);
		expect(info.indexPath).toContain(".daedalus");

		const result = await semSearch!.execute(
			"sem-search-ready",
			{
				queries: [{ query: "token refresh flow", use_case: "find token refresh implementation" }],
				path: ".",
				limit: 3,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(result)).toContain("refresh-token.ts");
		expect(result.details.workspace.state).toBe("ready");
		expect(result.details.workspace.source).toBe("index");
		expect(result.details.queries[0].query).toBe("token refresh flow");

		const indexText = readFileSync(join(tempDir, ".daedalus", "semantic-workspace.json"), "utf-8");
		expect(indexText).toContain("embeddingModel");
		expect(indexText).toContain("lastDiscoverySummary");
		expect(info.lastDiscoverySummary?.candidateFiles).toBeGreaterThan(0);
		expect(info.lastDiscoverySummary?.skippedFiles).toBeGreaterThanOrEqual(0);

		session.dispose();
	});

	it("treats ordinary post-sync edits as stale_soft and still allows sem_search", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		const semSearch = session.getToolDefinition("sem_search")!;

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'beta';\n  return refreshToken;\n}\n",
		);

		const status = getSemanticWorkspaceStatus(tempDir);
		expect(status.state).toBe("stale_soft");
		expect(status.ready).toBe(true);

		const result = await semSearch.execute(
			"sem-search-soft-stale",
			{
				queries: [{ query: "token refresh flow", use_case: "find token refresh implementation" }],
				path: ".",
				limit: 3,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);

		expect(getText(result)).toContain("refresh-token.ts");
		expect(result.details.workspace.state).toBe("stale_soft");

		session.dispose();
	});
});
