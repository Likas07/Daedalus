import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import type { CustomEntry } from "../src/core/session-manager.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("tool state migration", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-tool-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("migrates legacy /tools state from edit to hashline_edit", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("tools-config", {
			enabledTools: ["read", "bash", "edit", "write"],
		});

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		expect(session.getActiveToolNames()).toEqual(["read", "bash", "hashline_edit", "write", "subagent"]);

		const toolEntries = sessionManager
			.getEntries()
			.filter((entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "tools-config");
		const latestToolsEntry = toolEntries.at(-1);
		expect((latestToolsEntry?.data as { enabledTools?: string[] } | undefined)?.enabledTools).toEqual([
			"read",
			"bash",
			"hashline_edit",
			"write",
		]);

		session.dispose();
	});

	test("plan mode restores hashline_edit instead of edit when leaving plan mode", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});

		await session.prompt("/plan");
		expect(session.getActiveToolNames()).toEqual(["read", "bash", "grep", "find", "ls", "questionnaire"]);

		await session.prompt("/plan");
		expect(session.getActiveToolNames()).toEqual(["read", "bash", "hashline_edit", "write", "todo_read", "todo_write", "execute_plan"]);

		session.dispose();
	});
});
