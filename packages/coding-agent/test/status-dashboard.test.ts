import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { syncSemanticWorkspace } from "../src/extensions/daedalus/tools/semantic-workspace.js";

function getText(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("status dashboard", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `daedalus-status-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(join(tempDir, "src", "auth.ts"), "export const auth = true;\n");
		await syncSemanticWorkspace(tempDir);
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("status_overview reports workspace readiness and todo summary", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("plan-execution-state", {
			todos: [
				{ id: "plan-step-1", content: "Inspect auth", status: "completed" },
				{ id: "plan-step-2", content: "Implement refresh", status: "in_progress" },
			],
			summary: { total: 2, active: 1, pending: 0, in_progress: 1, completed: 1, cancelled: 0 },
		});
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});
		await syncSemanticWorkspace(tempDir);

		const tool = session.getToolDefinition("status_overview");
		expect(tool).toBeDefined();
		const result = await tool!.execute("status-overview-1", {}, undefined, undefined, {
			cwd: tempDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			hasPendingMessages: () => false,
			sessionManager,
		} as any);
		const text = getText(result);
		expect(text).toContain("semantic_workspace: ready");
		expect(text).toContain("todos_total: 2");
		expect(text).toContain("todos_in_progress: 1");

		session.dispose();
	});

	it("/status command emits a status dashboard custom message", async () => {
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
		await syncSemanticWorkspace(tempDir);

		await session.prompt("/status");
		const statusMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "status-dashboard",
		);
		expect(statusMessages).toHaveLength(1);
		const text = typeof statusMessages[0]?.content === "string" ? statusMessages[0].content : "";
		expect(text).toContain("semantic_workspace: ready");
		expect(text).toContain("model: anthropic/claude-sonnet-4-5");

		session.dispose();
	});


	it("status_overview reports soft-stale semantic state without treating it as unusable", async () => {
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
		await syncSemanticWorkspace(tempDir);
		writeFileSync(join(tempDir, "src", "auth.ts"), "export const auth = 'changed';\n");

		const tool = session.getToolDefinition("status_overview")!;
		const result = await tool.execute("status-overview-soft-stale", {}, undefined, undefined, {
			cwd: tempDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			hasPendingMessages: () => false,
			sessionManager,
		} as any);

		expect(getText(result)).toContain("semantic_workspace: stale_soft");

		session.dispose();
	});
});
