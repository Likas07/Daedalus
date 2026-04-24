import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("plan-mode / todo convergence", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-planmode-convergence-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("todo_read reconstructs plan execution state from custom entries", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("plan-execution-state", {
			todos: [
				{ id: "plan-step-1", content: "Inspect auth flow", status: "completed" },
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

		const todoRead = session.getToolDefinition("todo_read");
		const result = await todoRead!.execute("todo-read-plan-state", {}, undefined, undefined, undefined);
		expect(result.details.todos).toEqual([
			{ id: "plan-step-1", content: "Inspect auth flow", status: "completed" },
			{ id: "plan-step-2", content: "Implement refresh", status: "in_progress" },
		]);

		session.dispose();
	});

	it("todo_read reconstructs plan-mode structured todos from resumed plan-mode state", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("plan-mode", {
			enabled: false,
			executing: true,
			planTodos: [
				{ id: "plan-step-1", content: "Inspect auth flow", status: "completed" },
				{ id: "plan-step-2", content: "Implement refresh", status: "pending" },
			],
		});
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		const todoRead = session.getToolDefinition("todo_read");
		const result = await todoRead!.execute("todo-read-plan-mode", {}, undefined, undefined, undefined);
		expect(result.details.todos[0]).toMatchObject({ id: "plan-step-1", status: "completed" });
		expect(result.details.todos[1]).toMatchObject({ id: "plan-step-2", status: "pending" });

		session.dispose();
	});
});
