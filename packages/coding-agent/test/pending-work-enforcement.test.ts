import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

function appendTodoState(sessionManager: SessionManager, todos: Array<{ id: string; content: string; status: string }>): void {
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

describe("pending work enforcement", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-pending-work-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("queues a single follow-up reminder for unchanged active todos", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Initial answer"),
			fauxAssistantMessage("Continuing because todos remain"),
			fauxAssistantMessage("Second user-visible answer"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Keep working", status: "pending" }]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("Start");
		let reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(1);

		await session.prompt("Continue");
		reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(1);

		session.dispose();
		faux.unregister();
	});

	it("emits a fresh reminder when the active todo set changes", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Initial answer"),
			fauxAssistantMessage("Continue on task 1"),
			fauxAssistantMessage("Another answer"),
			fauxAssistantMessage("Continue on task 2"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Keep working", status: "pending" }]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("Start");
		appendTodoState(sessionManager, [{ id: "task-2", content: "New active task", status: "pending" }]);
		await session.prompt("Continue");

		const reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(2);

		session.dispose();
		faux.unregister();
	});

	it("does nothing when pending-work enforcement is disabled", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([fauxAssistantMessage("Initial answer")]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory();
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Keep working", status: "pending" }]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});
		session.settingsManager.setPendingWorkEnabled(false);

		await session.prompt("Start");

		const reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(0);
		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(1);

		session.dispose();
		faux.unregister();
	});
});
