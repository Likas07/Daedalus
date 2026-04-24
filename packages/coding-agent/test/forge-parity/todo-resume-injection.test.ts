import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { createAgentSession } from "../../src/core/sdk.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { SettingsManager } from "../../src/core/settings-manager.js";

function appendTodoState(
	sessionManager: SessionManager,
	todos: Array<{ id: string; content: string; status: string }>,
): void {
	sessionManager.appendMessage({
		role: "toolResult",
		toolCallId: `todo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		toolName: "todo_write",
		content: [{ type: "text", text: "seed todo state" }],
		details: {
			action: "write",
			mode: "replace",
			changes: [],
			todos,
			summary: {
				total: todos.length,
				active: todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress").length,
				pending: todos.filter((todo) => todo.status === "pending").length,
				in_progress: todos.filter((todo) => todo.status === "in_progress").length,
				completed: todos.filter((todo) => todo.status === "completed").length,
				cancelled: todos.filter((todo) => todo.status === "cancelled").length,
			},
		},
		isError: false,
		timestamp: Date.now(),
	});
}

describe("resume todo injection", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-resume-todos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("injects a droppable current task list user message on resume when active todos exist", async () => {
		const authStorage = AuthStorage.inMemory();
		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		authStorage.setRuntimeApiKey(model.provider, "test-key");
		const settingsManager = SettingsManager.inMemory();
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [
			{ id: "todo-1", content: "write failing test", status: "pending" },
			{ id: "todo-2", content: "implement feature", status: "in_progress" },
			{ id: "todo-3", content: "scaffold files", status: "completed" },
		]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model,
			authStorage,
			settingsManager,
			sessionManager,
			sessionStartEvent: { type: "session_start", reason: "resume" },
		});
		await session.bindExtensions({});

		const injected = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "resume-current-task-list",
		);
		expect(injected).toHaveLength(1);
		expect(injected[0]?.droppable).toBe(true);
		const content = typeof injected[0]?.content === "string" ? injected[0].content : "";
		expect(content).toBe(
			"**Current task list:**\n\n- [PENDING] write failing test\n- [IN_PROGRESS] implement feature\n- [DONE] scaffold files",
		);

		session.dispose();
	});
});
