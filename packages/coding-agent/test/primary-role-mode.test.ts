import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { buildSubagentAppendPrompts } from "../src/core/subagents/runtime-config.js";
import primaryRoleMode from "../src/extensions/daedalus/workflow/primary-role/index.js";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

function _getTextContent(message: any): string {
	if (!Array.isArray(message?.content)) return "";
	return message.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("primary role runtime mode", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-primary-role-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("switches to Sage primary mode with read-only analysis doctrine and restricted tools", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("sage primary ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("/sage");
		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["fs_search", "todo_read"]));
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.getActiveToolNames()).not.toContain("write");
		expect(session.getActiveToolNames()).not.toContain("hashline_edit");

		await session.prompt("Explain the auth architecture");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: SAGE]");
		expect(providerSystemPrompt).toContain("You are Sage");
		expect(providerSystemPrompt).toContain("You are not a delegated subagent in this mode");
		expect(providerSystemPrompt).not.toContain("submit_result exactly once");

		session.dispose();
		faux.unregister();
	});

	it("switches to Muse primary mode with planning doctrine and structured plan toolset", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("muse primary ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("/muse");
		expect(session.getActiveToolNames()).toEqual(
			expect.arrayContaining([
				"todo_write",
				"plan_create",
				"plan_validate",
				"skill",
				"subagent",
				"write",
				"hashline_edit",
			]),
		);

		await session.prompt("Plan the auth refactor");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: MUSE]");
		expect(providerSystemPrompt).toContain("You are Muse");
		expect(providerSystemPrompt).toContain("You may consult Sage through subagent delegation");
		expect(providerSystemPrompt).toContain("Executable implementation plans must use this lifecycle before handoff");
		expect(providerSystemPrompt).toContain("If `plan_validate` fails, fix the plan artifact");
		expect(providerSystemPrompt).toContain(
			"Advisory planning that is not intended for `execute_plan` may return analysis directly",
		);
		expect(providerSystemPrompt).not.toContain("submit_result exactly once");

		session.dispose();
		faux.unregister();
	});

	it("restores the selected primary role mode on session resume", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("resumed sage ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("primary-role-mode", {
			role: "sage",
			baselineTools: ["read", "bash", "hashline_edit", "write"],
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

		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["todo_read"]));
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.getActiveToolNames()).not.toContain("write");

		await session.prompt("Resume the architecture analysis");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: SAGE]");

		session.dispose();
		faux.unregister();
	});

	it("blocks primary Muse write tools outside Markdown paths", async () => {
		let toolCallHandler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
		const commandHandlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
		primaryRoleMode({
			on(event: string, handler: any) {
				if (event === "tool_call") toolCallHandler = handler;
			},
			registerCommand(name: string, options: any) {
				commandHandlers[name] = options.handler;
			},
			registerFlag() {},
			getActiveTools: () => ["read", "write", "hashline_edit"],
			setActiveTools() {},
			appendEntry() {},
			sendMessage() {},
		} as any);
		if (!toolCallHandler || !commandHandlers.muse || !commandHandlers.sage)
			throw new Error("primary-role did not register handlers");
		expect(commandHandlers.role).toBeUndefined();
		expect(commandHandlers.daedalus).toBeDefined();

		const ctx = {
			cwd: tempDir,
			hasUI: true,
			ui: { notify() {}, setStatus() {}, theme: { fg: (_name: string, text: string) => text } },
		};
		await commandHandlers.muse("", ctx);

		await expect(
			toolCallHandler(
				{ type: "tool_call", toolCallId: "1", toolName: "write", input: { path: "notes.md", content: "ok" } },
				ctx,
			),
		).resolves.toBeUndefined();
		await expect(
			toolCallHandler(
				{ type: "tool_call", toolCallId: "2", toolName: "write", input: { path: "src/file.ts", content: "no" } },
				ctx,
			),
		).resolves.toEqual({ block: true, reason: "Primary Muse may only write Markdown files; blocked src/file.ts" });
		await expect(
			toolCallHandler(
				{
					type: "tool_call",
					toolCallId: "3",
					toolName: "hashline_edit",
					input: { edits: [{ path: "docs/plan.md", op: "move", to: "src/plan.ts" }] },
				},
				ctx,
			),
		).resolves.toEqual({ block: true, reason: "Primary Muse may only write Markdown files; blocked src/plan.ts" });

		await commandHandlers.sage("", ctx);
		await expect(
			toolCallHandler(
				{ type: "tool_call", toolCallId: "4", toolName: "write", input: { path: "src/file.ts", content: "ok" } },
				ctx,
			),
		).resolves.toBeUndefined();
	});

	it("records Muse plan-ready metadata and ignores failed validation", async () => {
		let toolResultHandler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
		const commandHandlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
		const entries: Array<{ customType: string; data: any }> = [];
		primaryRoleMode({
			on(event: string, handler: any) {
				if (event === "tool_result") toolResultHandler = handler;
			},
			registerCommand(name: string, options: any) {
				commandHandlers[name] = options.handler;
			},
			registerFlag() {},
			getActiveTools: () => ["read", "plan_validate"],
			setActiveTools() {},
			appendEntry(customType: string, data: any) {
				entries.push({ customType, data });
			},
			sendMessage() {},
			sendUserMessage() {},
		} as any);
		if (!toolResultHandler || !commandHandlers.muse) throw new Error("primary-role did not register handlers");

		const ctx = {
			cwd: tempDir,
			hasUI: false,
			ui: { notify() {}, setStatus() {}, theme: { fg: (_name: string, text: string) => text } },
		};
		await commandHandlers.muse("", ctx);
		entries.length = 0;

		await toolResultHandler(
			{
				type: "tool_result",
				toolCallId: "1",
				toolName: "plan_validate",
				input: { path: "docs/plan.md" },
				content: [],
				isError: true,
			},
			ctx,
		);
		expect(entries).toHaveLength(0);

		await toolResultHandler(
			{
				type: "tool_result",
				toolCallId: "2",
				toolName: "plan_validate",
				input: { path: "docs/plan.md" },
				content: [],
				isError: false,
				details: { sidecarPath: "docs/plan.tasks.json" },
			},
			ctx,
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			customType: "muse-plan-ready",
			data: { path: "docs/plan.md", sidecarPath: "docs/plan.tasks.json", validated: true },
		});
		expect(entries[0]?.data.createdAt).toEqual(expect.any(String));
	});

	it("prompts after Muse plan validation and leaves Muse active for revise or stay choices", async () => {
		for (const choice of ["Revise plan", "Stay in Muse"]) {
			let toolResultHandler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
			const commandHandlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
			const sentMessages: any[] = [];
			const queuedUserMessages: any[] = [];
			let activeTools = ["read", "write", "hashline_edit"];
			primaryRoleMode({
				on(event: string, handler: any) {
					if (event === "tool_result") toolResultHandler = handler;
				},
				registerCommand(name: string, options: any) {
					commandHandlers[name] = options.handler;
				},
				registerFlag() {},
				getActiveTools: () => activeTools,
				setActiveTools(tools: string[]) {
					activeTools = tools;
				},
				appendEntry() {},
				sendMessage(message: any) {
					sentMessages.push(message);
				},
				sendUserMessage(content: string, options: any) {
					queuedUserMessages.push({ content, options });
				},
			} as any);
			if (!toolResultHandler || !commandHandlers.muse) throw new Error("primary-role did not register handlers");

			const ctx = {
				cwd: tempDir,
				hasUI: true,
				ui: {
					notify() {},
					setStatus() {},
					select: async () => choice,
					theme: { fg: (_name: string, text: string) => text },
				},
			};
			await commandHandlers.muse("", ctx);
			await toolResultHandler(
				{
					type: "tool_result",
					toolCallId: "1",
					toolName: "plan_validate",
					input: { path: "docs/plan.md" },
					content: [],
					isError: false,
				},
				ctx,
			);

			expect(activeTools).toEqual(expect.arrayContaining(["plan_validate", "write", "hashline_edit"]));
			expect(sentMessages.map((message) => message.customType)).not.toContain("muse-plan-handoff");
			expect(queuedUserMessages).toHaveLength(0);
		}
	});

	it("hands validated Muse plans to Daedalus when implement is selected", async () => {
		let toolResultHandler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
		let sessionTreeHandler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
		const commandHandlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
		const entries: Array<{ type: "custom"; customType: string; data: any }> = [];
		const sentMessages: any[] = [];
		const queuedUserMessages: any[] = [];
		let activeTools = ["read", "write", "hashline_edit"];
		primaryRoleMode({
			on(event: string, handler: any) {
				if (event === "tool_result") toolResultHandler = handler;
				if (event === "session_tree") sessionTreeHandler = handler;
			},
			registerCommand(name: string, options: any) {
				commandHandlers[name] = options.handler;
			},
			registerFlag() {},
			getFlag: () => undefined,
			getActiveTools: () => activeTools,
			setActiveTools(tools: string[]) {
				activeTools = tools;
			},
			appendEntry(customType: string, data: any) {
				entries.push({ type: "custom", customType, data });
			},
			sendMessage(message: any) {
				sentMessages.push(message);
			},
			sendUserMessage(content: string, options: any) {
				queuedUserMessages.push({ content, options });
			},
		} as any);
		if (!toolResultHandler || !sessionTreeHandler || !commandHandlers.muse)
			throw new Error("primary-role did not register handlers");

		const ctx = {
			cwd: tempDir,
			hasUI: true,
			ui: {
				notify() {},
				setStatus() {},
				select: async (_prompt: string, options: string[]) => {
					expect(options).toEqual(["Implement with Daedalus", "Revise plan", "Stay in Muse"]);
					return "Implement with Daedalus";
				},
				theme: { fg: (_name: string, text: string) => text },
			},
			sessionManager: { getBranch: () => entries },
		};
		await commandHandlers.muse("", ctx);
		await toolResultHandler(
			{
				type: "tool_result",
				toolCallId: "1",
				toolName: "plan_validate",
				input: { path: "docs/plan.md" },
				content: [],
				isError: false,
			},
			ctx,
		);

		expect(entries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ customType: "muse-plan-ready" }),
				expect.objectContaining({
					customType: "primary-role-mode",
					data: expect.objectContaining({ role: "daedalus" }),
				}),
			]),
		);
		expect(activeTools).toEqual(
			expect.arrayContaining([
				"plan_validate",
				"execute_plan",
				"plan_task_read",
				"subagent",
				"todo_read",
				"todo_write",
			]),
		);
		const persistedHandoff = entries.filter((entry) => entry.customType === "primary-role-mode").at(-1);
		expect(persistedHandoff?.data.baselineTools).toEqual(
			expect.arrayContaining(["plan_validate", "execute_plan", "plan_task_read"]),
		);

		activeTools = ["read", "write", "hashline_edit"];
		await sessionTreeHandler({ type: "session_tree" }, ctx);
		expect(activeTools).toEqual(expect.arrayContaining(["plan_validate", "execute_plan", "plan_task_read"]));
		expect(sentMessages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					customType: "muse-plan-handoff",
					display: true,
					content: expect.stringContaining("docs/plan.md"),
				}),
			]),
		);
		expect(queuedUserMessages).toEqual([
			expect.objectContaining({
				content: expect.stringContaining("docs/plan.md"),
				options: { deliverAs: "followUp" },
			}),
		]);
		expect(queuedUserMessages[0].content).toContain("execute_plan");
		expect(queuedUserMessages[0].content).toContain("Re-run plan_validate");
		expect(queuedUserMessages[0].content).toContain("resume=true");
		expect(queuedUserMessages[0].content).toContain("Worker");
		expect(queuedUserMessages[0].content).toContain("plan_task_read");
	});

	it("keeps delegated Sage prompts on the subagent result contract while primary Sage does not use it", () => {
		const sage = getBundledStarterAgents().find((agent) => agent.name === "sage");
		expect(sage).toBeDefined();
		const delegated = buildSubagentAppendPrompts({ agent: sage!, packetText: "Goal: inspect auth" }).join("\n\n");
		expect(delegated).toContain("submit_result exactly once");
		expect(delegated).toContain("Delegated task packet:");
		expect(sage?.systemPrompt).toContain("When delegated, gather the minimum sufficient evidence");
	});
});
