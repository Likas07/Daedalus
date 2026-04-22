import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Container, type TUI } from "@daedalus-pi/tui";
import stripAnsi from "strip-ansi";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { loadExtensions } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import type {
	ExtensionActions,
	ExtensionCommandContextActions,
	ExtensionContextActions,
	ExtensionUIContext,
} from "../src/core/extensions/types.js";
import { KeybindingsManager } from "../src/core/keybindings.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.js";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function createFakeTui(): TUI {
	return {
		requestRender: () => {},
	} as unknown as TUI;
}

function createUiContext(overrides: Partial<ExtensionUIContext> = {}): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: () => {},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		setEditorComponent: () => {},
		get theme() {
			return {} as any;
		},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false as const, error: "UI not available" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
		...overrides,
	};
}

function createCommandActions(overrides: Partial<ExtensionCommandContextActions> = {}): ExtensionCommandContextActions {
	return {
		waitForIdle: async () => {},
		newSession: async () => ({ cancelled: false }),
		fork: async () => ({ cancelled: false }),
		navigateTree: async () => ({ cancelled: false }),
		switchSession: async () => ({ cancelled: false }),
		reload: async () => {},
		...overrides,
	};
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("starter-pack subagent extension", () => {
	let tempDir: string;

	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-pack-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const createRunner = async (
		actionOverrides: Partial<ExtensionActions> = {},
		uiOverrides?: Partial<ExtensionUIContext>,
	) => {
		const extensionPath = fileURLToPath(
			new URL("../src/extensions/daedalus/workflow/subagents/index.ts", import.meta.url),
		);
		const loaded = await loadExtensions([extensionPath], tempDir);
		const runner = new ExtensionRunner(
			loaded.extensions,
			loaded.runtime,
			tempDir,
			SessionManager.inMemory(),
			ModelRegistry.create(AuthStorage.create(path.join(tempDir, "auth.json"))),
		);

		const actions: ExtensionActions = {
			sendMessage: () => {},
			sendUserMessage: () => {},
			appendEntry: () => {},
			setSessionName: () => {},
			getSessionName: () => undefined,
			setLabel: () => {},
			getActiveTools: () => [],
			getAllTools: () => [],
			setActiveTools: () => {},
			refreshTools: () => {},
			getCommands: () => [],
			setModel: async () => false,
			getThinkingLevel: () => "off",
			setThinkingLevel: () => {},
			runSubagent: vi.fn(async () => ({
				runId: "run-1",
				resultId: "run-1",
				agent: "scout",
				status: "completed" as const,
				summary: "Found auth files",
				task: "Locate auth",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				output: "src/auth.ts\nsrc/tokens.ts",
				reference: {
					resultId: "run-1",
					agentId: "scout",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					task: "Locate auth",
					status: "completed",
					summary: "Found auth files",
					note: "If you want the full output, use read_agent_result_output(run-1).",
				},
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
			getActiveSubagentRuns: () => [],
			listSubagentRuns: async () => [],
			...actionOverrides,
		};

		const ctxActions: ExtensionContextActions = {
			getModel: () => undefined,
			isIdle: () => true,
			getSignal: () => undefined,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
			getSkills: () => [],
		};

		runner.bindCore(actions, ctxActions, {
			registerProvider: () => {},
			unregisterProvider: () => {},
		});
		runner.bindCommandContext(createCommandActions());
		if (uiOverrides) {
			runner.setUIContext(createUiContext(uiOverrides));
		}

		return runner;
	};

	it("registers the subagent tool plus /agents and /subagents without an orchestrator toggle", async () => {
		const runner = await createRunner();
		const tools = runner.getAllRegisteredTools();
		const commands = runner
			.getRegisteredCommands()
			.map((command) => command.invocationName)
			.sort();

		expect(tools.some((tool) => tool.definition.name === "subagent")).toBe(true);
		expect(commands).toContain("agents");
		expect(commands).toContain("subagents");
		expect(commands).not.toContain("orchestrator");
	});

	it("always injects Daedalus artisan guidance before agent start", async () => {
		const runner = await createRunner();
		await runner.emit({ type: "session_start", reason: "startup" });

		const result = await runner.emitBeforeAgentStart("help", undefined, "System prompt");
		const text = result?.messages?.[0]?.content?.[0];
		const textContent = text && typeof text === "object" && "type" in text && text.type === "text" ? text : undefined;

		expect(textContent?.type).toBe("text");
		expect(textContent?.text ?? "").toContain("[DAEDALUS]");
		expect(textContent?.text ?? "").toContain("Daedalus is a master artisan");
		expect(textContent?.text ?? "").toContain("Delegate focused work when it improves quality, speed, or safety.");
		expect(textContent?.text ?? "").toContain(
			"Default to delegation for non-trivial, multi-step, or ambiguous work.",
		);
		expect(textContent?.text ?? "").toContain(
			"Parallelize everything that is independent; serialize only when later work depends on earlier results.",
		);
		expect(textContent?.text ?? "").toContain(
			"Use Muse when the task needs decomposition or dependency-aware sequencing.",
		);
		expect(textContent?.text ?? "").toContain("Keep final synthesis in Daedalus; subagents return scoped lightweight references.");
		expect(textContent?.text ?? "").toContain("Use summary first when consuming subagent results.");
		expect(textContent?.text ?? "").toContain("read_agent_result_output(result_id)");
		expect(textContent?.text ?? "").toContain("Avoid duplicate or overly granular delegations.");
		expect(textContent?.text ?? "").toContain("Use compact task packets and inspectable task results.");
		expect(textContent?.text ?? "").toContain('Use agent="sage" for Sage (sage)');
		expect(textContent?.text ?? "").toContain('Use agent="muse" for Muse (muse)');
		expect(textContent?.text ?? "").toContain('Use agent="worker" for Hephaestus (worker)');
	});

	it("exposes the subagent tool in the prompt via a prompt snippet", async () => {
		const runner = await createRunner();
		const tool = runner.getToolDefinition("subagent");
		expect(tool).toBeDefined();
		expect(tool?.promptSnippet).toContain("Delegate a focused sub-task to an available specialist");
	});

	it("keeps Daedalus as the only primary orchestrator and never exposes an orchestrator subagent", async () => {
		const notice = vi.fn();
		const runner = await createRunner({}, { notify: notice });
		const command = runner.getRegisteredCommands().find((item) => item.invocationName === "agents");
		expect(command).toBeDefined();

		await command!.handler("", runner.createCommandContext());

		expect(JSON.stringify(notice.mock.calls)).not.toContain("orchestrator");
	});

	it("renders the active agent name, live progress details, and an inspect affordance", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("subagent");
		expect(definition).toBeDefined();

		const component = new ToolExecutionComponent(
			"subagent",
			"tool-1",
			{ agent: "scout", goal: "Trace auth flow", assignment: "Inspect auth files and report." },
			{},
			definition,
			createFakeTui(),
			tempDir,
		);
		component.updateResult(
			{
				content: [{ type: "text", text: "grep /Authorization/ in src" }],
				details: {
					agent: "scout",
					goal: "Trace auth flow",
					status: "running",
					summary: "Trace auth flow",
					activity: "grep /Authorization/ in src",
					recentActivity: ["read src/auth.ts", "grep /Authorization/ in src"],
					childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
				},
				isError: false,
			},
			true,
		);

		const rendered = stripAnsi(component.render(120).join("\n"));
		expect(rendered).toContain("scout");
		expect(rendered).toContain("Trace auth flow");
		expect(rendered).toContain("grep /Authorization/ in src");
		expect(rendered).toContain("read src/auth.ts");
		expect(rendered).toContain("Inspect (");
	});

	it("activates the focused subagent tool row with Enter", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("subagent");
		const onPrimaryAction = vi.fn(async () => {});

		const component = new ToolExecutionComponent(
			"subagent",
			"tool-activate",
			{ agent: "worker", goal: "Inspect auth", assignment: "Review auth flow." },
			{ onPrimaryAction },
			definition,
			createFakeTui(),
			tempDir,
		);
		component.updateResult(
			{
				content: [{ type: "text", text: "done" }],
				details: {
					runId: "run-1",
					agent: "worker",
					goal: "Inspect auth",
					status: "completed",
					summary: "Reviewed auth flow",
					childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
				},
				isError: false,
			},
			false,
		);

		expect(component.hasPrimaryAction()).toBe(true);
		component.focused = true;
		component.handleInput("\r");
		await flushMicrotasks();

		expect(onPrimaryAction).toHaveBeenCalledWith({
			toolName: "subagent",
			details: {
				runId: "run-1",
				agent: "worker",
				goal: "Inspect auth",
				status: "completed",
				summary: "Reviewed auth flow",
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			},
		});
	});

	it("cycles focused actionable subagent rows newest-to-oldest and wraps", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("subagent");
		const makeActionableComponent = (toolCallId: string, goal: string) => {
			const component = new ToolExecutionComponent(
				"subagent",
				toolCallId,
				{ agent: "worker", goal, assignment: `${goal}.` },
				{ onPrimaryAction: vi.fn(async () => {}) },
				definition,
				createFakeTui(),
				tempDir,
			);
			component.updateResult(
				{
					content: [{ type: "text", text: goal }],
					details: {
						runId: toolCallId,
						agent: "worker",
						goal,
						status: "completed",
						summary: goal,
						childSessionFile: `/tmp/parent/subagents/${toolCallId}.jsonl`,
					},
					isError: false,
				},
				false,
			);
			return component;
		};

		const older = makeActionableComponent("tool-older", "Inspect auth");
		const newer = makeActionableComponent("tool-newer", "Inspect logs");
		let focused: ToolExecutionComponent | undefined;
		const fakeThis: any = {
			chatContainer: new Container(),
			showStatus: vi.fn(),
			getActionableToolComponents: Reflect.get(InteractiveMode.prototype, "getActionableToolComponents"),
			ui: {
				setFocus: (component: ToolExecutionComponent) => {
					if (focused) focused.focused = false;
					focused = component;
					component.focused = true;
				},
				requestRender: vi.fn(),
			},
		};
		fakeThis.chatContainer.addChild(older);
		fakeThis.chatContainer.addChild(newer);

		const cycleActionableTools = Reflect.get(InteractiveMode.prototype, "focusLatestActionableTool") as (
			this: typeof fakeThis,
		) => void;

		cycleActionableTools.call(fakeThis);
		expect(newer.focused).toBe(true);
		expect(older.focused).toBe(false);

		cycleActionableTools.call(fakeThis);
		expect(older.focused).toBe(true);
		expect(newer.focused).toBe(false);

		cycleActionableTools.call(fakeThis);
		expect(newer.focused).toBe(true);
		expect(older.focused).toBe(false);
		expect(fakeThis.showStatus).not.toHaveBeenCalled();
	});

	it("cycles from a focused subagent tool row with Ctrl+Alt+I and releases focus with Escape", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("subagent");
		const onCycleActionable = vi.fn();
		const onReleaseFocus = vi.fn();
		const onPrimaryAction = vi.fn(async () => {});

		const component = new ToolExecutionComponent(
			"subagent",
			"tool-cycle",
			{ agent: "worker", goal: "Inspect auth", assignment: "Review auth flow." },
			{
				keybindings: new KeybindingsManager(),
				onCycleActionable,
				onPrimaryAction,
				onReleaseFocus,
			},
			definition,
			createFakeTui(),
			tempDir,
		);
		component.updateResult(
			{
				content: [{ type: "text", text: "done" }],
				details: {
					runId: "run-1",
					agent: "worker",
					goal: "Inspect auth",
					status: "completed",
					summary: "Reviewed auth flow",
					childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
				},
				isError: false,
			},
			false,
		);

		component.focused = true;
		component.handleInput("\u001b\t");
		expect(onCycleActionable).toHaveBeenCalledTimes(1);
		expect(onPrimaryAction).not.toHaveBeenCalled();

		component.handleInput("\u001b");
		expect(onReleaseFocus).toHaveBeenCalledTimes(1);
	});

	it("shows active runs first with status and activity labels", async () => {
		const select = vi.fn(async () => undefined);
		const runner = await createRunner(
			{
				getActiveSubagentRuns: () => [
					{
						runId: "run-active",
						agent: "scout",
						parentSessionFile: "/tmp/parent.jsonl",
						status: "running",
						summary: "Trace auth flow",
						startedAt: 1,
						updatedAt: 2,
						activity: "grep /Authorization/ in src",
						childSessionFile: "/tmp/parent/subagents/run-active.jsonl",
					},
				],
				listSubagentRuns: async () => [
					{
						runId: "run-done",
						agent: "reviewer",
						status: "completed",
						summary: "Reviewed auth flow",
						childSessionFile: "/tmp/parent/subagents/run-done.jsonl",
					},
				],
			},
			{ select },
		);

		const command = runner.getRegisteredCommands().find((entry) => entry.invocationName === "subagents");
		expect(command).toBeDefined();
		await command!.handler("", runner.createCommandContext());

		expect(select).toHaveBeenCalledWith("Inspect subagent run", [
			"⋯ scout · grep /Authorization/ in src",
			"✓ reviewer · Reviewed auth flow",
		]);
	});

	it("returns a lightweight reference record instead of injecting full output", async () => {
		const runner = await createRunner({
			runSubagent: vi.fn(async () => ({
				runId: "run-1",
				resultId: "run-1",
				agent: "worker",
				status: "completed" as const,
				summary: "Drafted a short introduction",
				task: "Introduce yourself",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				output: "I am Hephaestus, a focused implementation specialist.",
				reference: {
					resultId: "run-1",
					agentId: "worker",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					task: "Introduce yourself",
					status: "completed",
					summary: "Drafted a short introduction",
					note: "If you want the full output, use read_agent_result_output(run-1).",
				},
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
		});

		const definition = runner.getToolDefinition("subagent");
		const ctx = runner.createCommandContext();
		const result = await definition!.execute(
			"tool-1",
			{ agent: "worker", goal: "Introduce yourself", assignment: "Write a short first-person introduction." },
			undefined,
			undefined,
			{
				...ctx,
				sessionManager: {
					...ctx.sessionManager,
					getSessionFile: () => "/tmp/parent.jsonl",
				},
			},
		);

		expect(result.content[0]).toEqual({
			type: "text",
			text: JSON.stringify({
				resultId: "run-1",
				agentId: "worker",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				task: "Introduce yourself",
				status: "completed",
				summary: "Drafted a short introduction",
				note: "If you want the full output, use read_agent_result_output(run-1).",
			}),
		});
	});

	it("does not inject the deferred full output into the parent-visible content", async () => {
		const runner = await createRunner({
			runSubagent: vi.fn(async () => ({
				runId: "run-1",
				resultId: "run-1",
				agent: "worker",
				status: "completed" as const,
				summary: "Prepared a concise introduction",
				task: "Introduce yourself",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				output: "I am Hephaestus, a focused implementation specialist who finishes the task fully.",
				reference: {
					resultId: "run-1",
					agentId: "worker",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					task: "Introduce yourself",
					status: "completed",
					summary: "Prepared a concise introduction",
					note: "If you want the full output, use read_agent_result_output(run-1).",
				},
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
		});

		const definition = runner.getToolDefinition("subagent");
		const ctx = runner.createCommandContext();
		const result = await definition!.execute(
			"tool-1",
			{ agent: "worker", goal: "Introduce yourself", assignment: "Return only the actual introduction text." },
			undefined,
			undefined,
			{
				...ctx,
				sessionManager: {
					...ctx.sessionManager,
					getSessionFile: () => "/tmp/parent.jsonl",
				},
			},
		);

		expect(result.content[0]).toEqual({
			type: "text",
			text: JSON.stringify({
				resultId: "run-1",
				agentId: "worker",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				task: "Introduce yourself",
				status: "completed",
				summary: "Prepared a concise introduction",
				note: "If you want the full output, use read_agent_result_output(run-1).",
			}),
		});
		expect(JSON.stringify(result.content[0])).not.toContain("focused implementation specialist who finishes the task fully");
	});

	it("does not let the worker identify itself as Daedalus when asked directly", async () => {
		const runner = await createRunner({
			runSubagent: vi.fn(async () => ({
				runId: "run-1",
				resultId: "run-1",
				agent: "worker",
				status: "completed" as const,
				summary: "Generated worker introduction",
				task: "Introduce yourself",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				output: "I’m Hephaestus, a code-focused implementation specialist and software craftsperson.",
				reference: {
					resultId: "run-1",
					agentId: "worker",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					task: "Introduce yourself",
					status: "completed",
					summary: "Generated worker introduction",
					note: "If you want the full output, use read_agent_result_output(run-1).",
				},
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
		});

		const definition = runner.getToolDefinition("subagent");
		const ctx = runner.createCommandContext();
		const result = await definition!.execute(
			"tool-1",
			{ agent: "worker", goal: "Introduce yourself", assignment: "Introduce yourself in first person." },
			undefined,
			undefined,
			{
				...ctx,
				sessionManager: {
					...ctx.sessionManager,
					getSessionFile: () => "/tmp/parent.jsonl",
				},
			},
		);

		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("Generated worker introduction");
		expect(text).not.toContain("I’m Daedalus");
	});

	it("opens a real inspector overlay from /subagents and keeps transcript/context/result/meta actions available", async () => {
		const parentSessionFile = path.join(tempDir, "parent.jsonl");
		const sessionFile = path.join(tempDir, "run-1.jsonl");
		const contextFile = path.join(tempDir, "run-1.context.md");
		const resultFile = path.join(tempDir, "run-1.result.json");
		const metaFile = path.join(tempDir, "run-1.meta.json");
		fs.writeFileSync(sessionFile, "assistant: finished\n");
		fs.writeFileSync(contextFile, "Focus on src/auth.ts\n");
		fs.writeFileSync(resultFile, JSON.stringify({ changedFiles: ["src/auth.ts"] }, null, 2));
		fs.writeFileSync(metaFile, JSON.stringify({ parentSessionFile }, null, 2));

		const select = vi.fn(async (title: string, options: string[]) => {
			if (title === "Inspect subagent run") return options[0];
			return undefined;
		});
		const renderedScreens: string[] = [];
		const overlayFlags: boolean[] = [];
		let customCalls = 0;
		const custom: ExtensionUIContext["custom"] = async <T>(factory, options) => {
			customCalls += 1;
			overlayFlags.push(Boolean(options?.overlay));
			const component = await factory(createFakeTui(), {} as any, {} as any, () => {});
			renderedScreens.push(stripAnsi(component.render(120).join("\n")));
			if (customCalls === 1) {
				component.handleInput?.("3");
				await flushMicrotasks();
			}
			return undefined as T;
		};
		const runner = await createRunner(
			{
				getActiveSubagentRuns: () => [
					{
						runId: "run-1",
						agent: "worker",
						parentSessionFile,
						status: "completed",
						summary: "Updated auth flow",
						startedAt: 1,
						updatedAt: 2,
						childSessionFile: sessionFile,
						contextArtifactPath: contextFile,
					},
				],
				listSubagentRuns: async () => [
					{
						runId: "run-1",
						agent: "worker",
						status: "completed",
						summary: "Updated auth flow",
						childSessionFile: sessionFile,
						contextArtifactPath: contextFile,
						resultArtifactPath: resultFile,
					},
				],
			},
			{ select, custom },
		);

		const command = runner.getRegisteredCommands().find((entry) => entry.invocationName === "subagents");
		await command!.handler("", runner.createCommandContext());

		expect(select).toHaveBeenCalledTimes(1);
		expect(select).toHaveBeenCalledWith("Inspect subagent run", ["✓ worker · Updated auth flow"]);
		expect(customCalls).toBe(2);
		expect(overlayFlags).toEqual([true, true]);
		expect(renderedScreens[0]).toContain("worker · completed");
		expect(renderedScreens[0]).toContain("Actions:");
		expect(renderedScreens[0]).toContain("1. Transcript");
		expect(renderedScreens[0]).toContain("2. Context packet");
		expect(renderedScreens[0]).toContain("3. Result JSON");
		expect(renderedScreens[0]).toContain("4. Metadata");
		expect(renderedScreens[0]).toContain("5. Open child session");
		expect(renderedScreens[0]).toContain("6. Back to parent");
		expect(renderedScreens[1]).toContain("worker result");
		expect(renderedScreens[1]).toContain('"changedFiles": [');
	});

	it("opens the child session from the inspector", async () => {
		const parentSessionFile = path.join(tempDir, "parent.jsonl");
		const sessionFile = path.join(tempDir, "run-2.jsonl");
		fs.writeFileSync(sessionFile, "assistant: child\n");
		fs.writeFileSync(path.join(tempDir, "run-2.meta.json"), JSON.stringify({ parentSessionFile }, null, 2));

		const switchSession = vi.fn(async () => ({ cancelled: false }));
		const custom: ExtensionUIContext["custom"] = async <T>(factory) => {
			const component = await factory(createFakeTui(), {} as any, {} as any, () => {});
			component.handleInput?.("3");
			await flushMicrotasks();
			return undefined as T;
		};
		const runner = await createRunner(
			{
				getActiveSubagentRuns: () => [
					{
						runId: "run-2",
						agent: "worker",
						parentSessionFile,
						status: "completed",
						summary: "Updated auth flow",
						startedAt: 1,
						updatedAt: 2,
						childSessionFile: sessionFile,
					},
				],
				listSubagentRuns: async () => [
					{
						runId: "run-2",
						agent: "worker",
						status: "completed",
						summary: "Updated auth flow",
						childSessionFile: sessionFile,
					},
				],
			},
			{ select: async (_title, options) => options[0], custom },
		);
		runner.bindCommandContext(createCommandActions({ switchSession }));

		const command = runner.getRegisteredCommands().find((entry) => entry.invocationName === "subagents");
		await command!.handler("", runner.createCommandContext());

		expect(switchSession).toHaveBeenCalledWith(sessionFile);
	});

	it("returns to the parent session from the inspector", async () => {
		const parentSessionFile = path.join(tempDir, "parent.jsonl");
		const sessionFile = path.join(tempDir, "run-3.jsonl");
		fs.writeFileSync(sessionFile, "assistant: child\n");
		fs.writeFileSync(path.join(tempDir, "run-3.meta.json"), JSON.stringify({ parentSessionFile }, null, 2));

		const switchSession = vi.fn(async () => ({ cancelled: false }));
		const custom: ExtensionUIContext["custom"] = async <T>(factory) => {
			const component = await factory(createFakeTui(), {} as any, {} as any, () => {});
			component.handleInput?.("4");
			await flushMicrotasks();
			return undefined as T;
		};
		const runner = await createRunner(
			{
				getActiveSubagentRuns: () => [
					{
						runId: "run-3",
						agent: "worker",
						parentSessionFile,
						status: "completed",
						summary: "Updated auth flow",
						startedAt: 1,
						updatedAt: 2,
						childSessionFile: sessionFile,
					},
				],
				listSubagentRuns: async () => [
					{
						runId: "run-3",
						agent: "worker",
						status: "completed",
						summary: "Updated auth flow",
						childSessionFile: sessionFile,
					},
				],
			},
			{ select: async (_title, options) => options[0], custom },
		);
		runner.bindCommandContext(createCommandActions({ switchSession }));

		const command = runner.getRegisteredCommands().find((entry) => entry.invocationName === "subagents");
		await command!.handler("", runner.createCommandContext());

		expect(switchSession).toHaveBeenCalledWith(parentSessionFile);
	});
});
