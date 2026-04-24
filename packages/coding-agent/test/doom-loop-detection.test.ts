import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

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
async function waitForAssistantCount(session: AgentSession, count: number): Promise<void> {
	for (let i = 0; i < 50; i++) {
		await session.agent.waitForIdle();
		if (session.messages.filter((message) => message.role === "assistant").length >= count) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(count);
}

describe("doom-loop detection", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-doom-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("warns after repeated completion attempts with unchanged active work", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("I think this is done."),
			fauxAssistantMessage("Still done."),
			fauxAssistantMessage("Done again."),
			fauxAssistantMessage("Continuing after doom-loop reminder."),
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

		await session.prompt("Attempt 1");
		await waitForAssistantCount(session, 2);
		await session.prompt("Attempt 2");
		await waitForAssistantCount(session, 4);

		const doomLoopMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "doom-loop-reminder",
		);
		expect(doomLoopMessages).toHaveLength(1);
		expect(typeof doomLoopMessages[0]?.content === "string" ? doomLoopMessages[0].content : "").toContain(
			"repeating completion attempts",
		);

		session.dispose();
		faux.unregister();
	});

	it("does not warn when active work signature changes between attempts", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Done?"),
			fauxAssistantMessage("Continue task 1."),
			fauxAssistantMessage("Done?"),
			fauxAssistantMessage("Continue task 2."),
			fauxAssistantMessage("Done?"),
			fauxAssistantMessage("Continue task 3."),
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

		await session.prompt("Attempt 1");
		await waitForAssistantCount(session, 2);
		appendTodoState(sessionManager, [{ id: "task-2", content: "Different task", status: "pending" }]);
		await session.prompt("Attempt 2");
		await waitForAssistantCount(session, 4);
		appendTodoState(sessionManager, [{ id: "task-3", content: "Another task", status: "pending" }]);
		await session.prompt("Attempt 3");
		await waitForAssistantCount(session, 6);

		const doomLoopMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "doom-loop-reminder",
		);
		expect(doomLoopMessages).toHaveLength(0);

		session.dispose();
		faux.unregister();
	});

	it("does not warn on healthy long tasks that never attempt completion", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("I am still investigating the issue and checking the auth flow."),
			fauxAssistantMessage("I am gathering more evidence and reading the next file."),
			fauxAssistantMessage("I am still debugging and have not finished yet."),
			fauxAssistantMessage("I am continuing the investigation."),
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

		await session.prompt("Attempt 1");
		await waitForAssistantCount(session, 2);
		await session.prompt("Attempt 2");
		await session.prompt("Attempt 3");
		await waitForAssistantCount(session, 4);

		const doomLoopMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "doom-loop-reminder",
		);
		expect(doomLoopMessages).toHaveLength(0);

		session.dispose();
		faux.unregister();
	});
});
