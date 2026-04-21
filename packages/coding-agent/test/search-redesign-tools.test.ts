import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("fs_search and sem_search tools", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-search-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(join(tempDir, "src", "refresh-token.ts"), "export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n");
		writeFileSync(join(tempDir, "src", "auth.ts"), "export function authenticate() {\n  return 'alpha';\n}\n");
		writeFileSync(join(tempDir, "README.md"), "This project handles token refresh and authentication.\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("supports exact file and content search with pagination modes", async () => {
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

		const fsSearch = session.getToolDefinition("fs_search");
		expect(fsSearch).toBeDefined();

		const fileResult = await fsSearch!.execute(
			"fs-search-1",
			{ pattern: "*.ts", target: "files", path: "src", limit: 10 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(fileResult)).toContain("refresh-token.ts");
		expect(getText(fileResult)).toContain("auth.ts");

		const countResult = await fsSearch!.execute(
			"fs-search-2",
			{ pattern: "alpha", target: "content", path: "src", output_mode: "count" },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(countResult)).toContain("refresh-token.ts:1");
		expect(getText(countResult)).toContain("auth.ts:1");

		const pagedResult = await fsSearch!.execute(
			"fs-search-3",
			{ pattern: "alpha", target: "content", path: "src", limit: 1, offset: 0 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(pagedResult)).toContain("[Showing 1-1 of 2. Use offset=1 for more.]");

		session.dispose();
	});

	it("ranks semantically related files ahead of weaker matches", async () => {
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
		const initTool = session.getToolDefinition("sem_workspace_init");
		const syncTool = session.getToolDefinition("sem_workspace_sync");
		expect(semSearch).toBeDefined();
		expect(initTool).toBeDefined();
		expect(syncTool).toBeDefined();

		await initTool!.execute("sem-init-search-test", {}, undefined, undefined, { cwd: tempDir } as any);
		await syncTool!.execute("sem-sync-search-test", {}, undefined, undefined, { cwd: tempDir } as any);

		const result = await semSearch!.execute(
			"sem-search-1",
			{ query: "token refresh flow", path: ".", limit: 3 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		const text = getText(result);
		expect(text).toContain("refresh-token.ts");
		expect(text.split("\n")[0]).toContain("refresh-token.ts");

		session.dispose();
	});
});
