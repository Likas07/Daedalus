import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

function getText(result: any): string {
	return result.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
}

describe("semantic workspace lifecycle", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(join(tempDir, "src", "refresh-token.ts"), "export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n");
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

		const statusTool = session.getToolDefinition("sem_workspace_status");
		const semSearch = session.getToolDefinition("sem_search");
		expect(statusTool).toBeDefined();
		expect(semSearch).toBeDefined();

		const status = await statusTool!.execute("sem-status-1", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(status.details).toMatchObject({ initialized: false, ready: false, state: "uninitialized" });
		expect(getText(status)).toContain("uninitialized");

		await expect(
			semSearch!.execute(
				"sem-search-unready",
				{ query: "token refresh flow", path: ".", limit: 3 },
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

		const initTool = session.getToolDefinition("sem_workspace_init");
		const syncTool = session.getToolDefinition("sem_workspace_sync");
		const statusTool = session.getToolDefinition("sem_workspace_status");
		const infoTool = session.getToolDefinition("sem_workspace_info");
		const semSearch = session.getToolDefinition("sem_search");
		expect(initTool).toBeDefined();
		expect(syncTool).toBeDefined();
		expect(infoTool).toBeDefined();

		const init = await initTool!.execute("sem-init-1", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(init.details).toMatchObject({ initialized: true, ready: false, state: "initialized" });

		await expect(
			semSearch!.execute(
				"sem-search-initialized-only",
				{ query: "token refresh flow", path: ".", limit: 3 },
				undefined,
				undefined,
				{ cwd: tempDir } as any,
			),
		).rejects.toThrow(/initialized but not indexed|sem_workspace_sync/i);

		const sync = await syncTool!.execute("sem-sync-1", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(sync.details).toMatchObject({ initialized: true, ready: true, state: "ready" });
		expect(sync.details.indexedFiles).toBeGreaterThan(0);

		const status = await statusTool!.execute("sem-status-2", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(status.details).toMatchObject({ initialized: true, ready: true, state: "ready" });

		const info = await infoTool!.execute("sem-info-1", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(info.details.indexedFiles).toBeGreaterThan(0);
		expect(info.details.indexPath).toContain(".daedalus");

		const result = await semSearch!.execute(
			"sem-search-ready",
			{ query: "token refresh flow", path: ".", limit: 3 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(result)).toContain("refresh-token.ts");
		expect(result.details.workspace.state).toBe("ready");
		expect(result.details.workspace.source).toBe("index");

		const indexText = readFileSync(join(tempDir, ".daedalus", "semantic-workspace.json"), "utf-8");
		expect(indexText).toContain("refresh-token.ts");

		session.dispose();
	});

	it("detects stale index state after workspace changes", async () => {
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

		const initTool = session.getToolDefinition("sem_workspace_init");
		const syncTool = session.getToolDefinition("sem_workspace_sync");
		const statusTool = session.getToolDefinition("sem_workspace_status");
		const semSearch = session.getToolDefinition("sem_search");

		await initTool!.execute("sem-init-2", {}, undefined, undefined, { cwd: tempDir } as any);
		await syncTool!.execute("sem-sync-2", {}, undefined, undefined, { cwd: tempDir } as any);
		writeFileSync(join(tempDir, "src", "refresh-token.ts"), "export function refreshTokenFlow() {\n  const refreshToken = 'beta';\n  return refreshToken;\n}\n");

		const status = await statusTool!.execute("sem-status-stale", {}, undefined, undefined, { cwd: tempDir } as any);
		expect(status.details).toMatchObject({ initialized: true, ready: false, state: "stale" });

		await expect(
			semSearch!.execute(
				"sem-search-stale",
				{ query: "token refresh flow", path: ".", limit: 3 },
				undefined,
				undefined,
				{ cwd: tempDir } as any,
			),
		).rejects.toThrow(/stale|sem_workspace_sync/i);

		session.dispose();
	});
});
