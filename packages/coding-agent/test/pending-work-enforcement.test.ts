import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgentSession, isAssistantAwaitingUserInput } from "../src/core/agent-session.js";
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

async function waitForPostRunContinuationDrain(session: AgentSession): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await session.agent.waitForIdle();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
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
		await waitForAssistantCount(session, 2);
		expect(session.isStreaming).toBe(false);
		expect(session.getSteeringMessages()).toHaveLength(0);
		expect(session.getFollowUpMessages()).toHaveLength(0);

		let reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(1);

		await session.prompt("Continue");
		await waitForAssistantCount(session, 3);
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
		await waitForAssistantCount(session, 2);
		appendTodoState(sessionManager, [{ id: "task-2", content: "New active task", status: "pending" }]);
		await session.prompt("Continue");
		await waitForAssistantCount(session, 4);

		const reminderMessages = session.messages.filter(
			(message) => message.role === "custom" && message.customType === "pending-work-reminder",
		);
		expect(reminderMessages).toHaveLength(2);

		session.dispose();
		faux.unregister();
	});

	it("does not auto-continue when the assistant asks for permission while todos remain", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("I need to run a potentially destructive command. Please confirm before I continue."),
			fauxAssistantMessage("This response should only happen after explicit user input"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Run the command after approval", status: "pending" }]);

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
		await waitForPostRunContinuationDrain(session);

		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
		expect(session.getSteeringMessages()).toHaveLength(0);
		expect(session.getFollowUpMessages()).toHaveLength(0);
		expect(
			session.messages.filter(
				(message) => message.role === "custom" && message.customType === "pending-work-reminder",
			),
		).toHaveLength(1);

		session.dispose();
		faux.unregister();
	});

	it("does not auto-continue when the user explicitly asks the agent to stop after setting todos", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Set 3 todos and stopped."),
			fauxAssistantMessage("This response should not happen without another user prompt"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [
			{ id: "todo-1", content: "Clarify the next concrete task", status: "pending" },
			{ id: "todo-2", content: "Inspect relevant project files before making changes", status: "pending" },
			{ id: "todo-3", content: "Run appropriate verification before reporting completion", status: "pending" },
		]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("Set a few todos and stop");
		await waitForPostRunContinuationDrain(session);

		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
		expect(session.messages.filter((message) => message.role === "user")).toHaveLength(1);
		expect(
			session.messages.filter(
				(message) => message.role === "custom" && message.customType === "pending-work-reminder",
			),
		).toHaveLength(1);

		session.dispose();
		faux.unregister();
	});

	it("ignores internally injected pending-work reminder user messages when finding the latest real user stop request", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Set 3 todos and stopped."),
			fauxAssistantMessage("Still should not continue from the injected reminder"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Keep this pending", status: "pending" }]);
		sessionManager.appendMessage({
			role: "user",
			content: [
				{
					type: "text",
					text: "You have pending todo items that must be completed before finishing the task:\n\n- [PENDING] Keep this pending\n\nComplete these before yielding.",
				},
			],
			timestamp: Date.now(),
		});

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("Set a few todos and stop");
		await waitForPostRunContinuationDrain(session);

		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(1);

		session.dispose();
		faux.unregister();
	});

	it("continues normally after the user answers a prior permission question", async () => {
		const faux = registerFauxProvider();
		faux.setResponses([
			fauxAssistantMessage("Do you want me to continue?"),
			fauxAssistantMessage("Continuing after explicit user input"),
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.inMemory({ pendingWork: { enabled: true } });
		const sessionManager = SessionManager.inMemory();
		appendTodoState(sessionManager, [{ id: "task-1", content: "Continue only after answer", status: "pending" }]);

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
		await waitForPostRunContinuationDrain(session);
		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(1);

		await session.prompt("Yes, continue.");
		await waitForAssistantCount(session, 2);

		expect(session.messages.filter((message) => message.role === "assistant")).toHaveLength(2);

		session.dispose();
		faux.unregister();
	});

	it("detects question-style tool calls as awaiting user input", () => {
		expect(
			isAssistantAwaitingUserInput(
				fauxAssistantMessage(fauxToolCall("question", { question: "Proceed?", options: [] })),
			),
		).toBe(true);
		expect(
			isAssistantAwaitingUserInput(
				fauxAssistantMessage(
					fauxToolCall("questionnaire", { questions: [{ question: "Choose scope", options: [] }] }),
				),
			),
		).toBe(true);
		expect(isAssistantAwaitingUserInput(fauxAssistantMessage("I inspected the files and will keep working."))).toBe(
			false,
		);
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
