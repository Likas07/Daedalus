import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("semantic workspace commands and exposure", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-commands-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n",
		);
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("uses slash commands for lifecycle and only exposes sem_search after indexing", async () => {
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

		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.systemPrompt).not.toContain("- sem_search:");
		expect(session.systemPrompt).not.toContain("Use sem_search for concept-level discovery");
		expect(session.getActiveToolNames()).not.toContain("sem_workspace_init");
		expect(session.getActiveToolNames()).not.toContain("sem_workspace_sync");
		expect(session.getActiveToolNames()).not.toContain("sem_workspace_status");
		expect(session.getActiveToolNames()).not.toContain("sem_workspace_info");

		await session.prompt("/workspace-status");
		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");

		expect(session.getActiveToolNames()).toContain("sem_search");
		expect(session.systemPrompt).toContain("- sem_search:");
		expect(session.systemPrompt).toContain("Use sem_search for concept-level discovery");

		const statusMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "semantic-workspace-status",
		);
		expect(statusMessages.length).toBeGreaterThanOrEqual(3);
		const latest = statusMessages.at(-1);
		const latestText = typeof latest?.content === "string" ? latest.content : "";
		expect(latestText).toContain("state: ready");

		session.dispose();
	}, 120_000);


	it("keeps sem_search exposed after indexed workspace becomes soft-stale", async () => {
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

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");
		writeFileSync(join(tempDir, "src", "refresh-token.ts"), "export const refresh = 'beta';\n");

		expect(session.getActiveToolNames()).toContain("sem_search");
		expect(session.systemPrompt).toContain("- sem_search:");

		session.dispose();
	}, 120_000);
});
