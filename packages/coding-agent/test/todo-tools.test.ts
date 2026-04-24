import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

function getText(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("todo_read/todo_write tools", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-todo-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("reads empty todo state and supports replace + merge writes", async () => {
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

		const todoRead = session.getToolDefinition("todo_read");
		const todoWrite = session.getToolDefinition("todo_write");
		expect(todoRead).toBeDefined();
		expect(todoWrite).toBeDefined();

		const empty = await todoRead!.execute("todo-read-1", {}, undefined, undefined, undefined);
		expect(getText(empty)).toBe("No todos");
		expect(empty.details.summary).toMatchObject({ total: 0, active: 0 });

		const replaced = await todoWrite!.execute(
			"todo-write-1",
			{
				todos: [
					{ id: "inspect", content: "Inspect auth flow", status: "completed" },
					{ id: "implement", content: "Implement refresh", status: "in_progress" },
				],
			},
			undefined,
			undefined,
			undefined,
		);
		expect(getText(replaced)).toContain("Todo list replaced");
		expect(replaced.details.mode).toBe("replace");
		expect(replaced.details.summary).toMatchObject({ total: 2, completed: 1, in_progress: 1, active: 1 });

		const merged = await todoWrite!.execute(
			"todo-write-2",
			{
				merge: true,
				todos: [
					{ id: "implement", content: "Implement refresh", status: "completed" },
					{ id: "tests", content: "Add refresh tests", status: "pending" },
				],
			},
			undefined,
			undefined,
			undefined,
		);
		expect(merged.details.mode).toBe("merge");
		expect(merged.details.summary).toMatchObject({ total: 3, completed: 2, pending: 1, active: 1 });
		expect(merged.details.changes.map((change: any) => change.kind)).toEqual(["updated", "added"]);

		const latest = await todoRead!.execute("todo-read-2", {}, undefined, undefined, undefined);
		expect(latest.details.todos).toEqual([
			{ id: "inspect", content: "Inspect auth flow", status: "completed" },
			{ id: "implement", content: "Implement refresh", status: "completed" },
			{ id: "tests", content: "Add refresh tests", status: "pending" },
		]);

		session.dispose();
	});

	it("rejects invalid todo invariants", async () => {
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

		const todoWrite = session.getToolDefinition("todo_write");
		await expect(
			todoWrite!.execute(
				"todo-write-invalid",
				{
					todos: [
						{ id: "a", content: "First", status: "in_progress" },
						{ id: "b", content: "Second", status: "in_progress" },
					],
				},
				undefined,
				undefined,
				undefined,
			),
		).rejects.toThrow(/at most one in_progress/i);

		session.dispose();
	});

	it("migrates legacy todo tool state on session resume", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendMessage({
			role: "toolResult",
			toolCallId: "legacy-call",
			toolName: "todo",
			content: [{ type: "text", text: "Added todo #1: legacy task" }],
			details: {
				action: "add",
				todos: [{ id: 1, text: "Legacy task", done: false }],
				nextId: 2,
			},
			isError: false,
			timestamp: Date.now(),
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
		const migrated = await todoRead!.execute("todo-read-legacy", {}, undefined, undefined, undefined);
		expect(migrated.details.migratedFromLegacy).toBe(true);
		expect(migrated.details.todos).toEqual([{ id: "legacy-1", content: "Legacy task", status: "pending" }]);
		expect(migrated.details.summary).toMatchObject({ total: 1, pending: 1, active: 1 });

		session.dispose();
	});
});
