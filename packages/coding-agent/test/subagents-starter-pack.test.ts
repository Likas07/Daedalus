import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { TUI } from "@daedalus-pi/tui";
import stripAnsi from "strip-ansi";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { loadExtensions } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import type { ExtensionActions, ExtensionContextActions, ExtensionUIContext } from "../src/core/extensions/types.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.js";
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
				agent: "scout",
				status: "completed" as const,
				summary: "Found auth files",
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

	it("always injects orchestrator guidance before agent start", async () => {
		const runner = await createRunner();
		await runner.emit({ type: "session_start", reason: "startup" });

		const result = await runner.emitBeforeAgentStart("help", undefined, "System prompt");
		const text = result?.messages?.[0]?.content?.[0];
		const textContent = text && typeof text === "object" && "type" in text && text.type === "text" ? text : undefined;

		expect(textContent?.type).toBe("text");
		expect(textContent?.text ?? "").toContain("[DAEDALUS ORCHESTRATOR]");
		expect(textContent?.text ?? "").toContain("Delegate focused work when it improves speed, clarity, or safety.");
		expect(textContent?.text ?? "").toContain("Use compact task packets and inspectable task results.");
	});

	it("renders the active agent name and live progress details instead of a generic subagent label", async () => {
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

	it("opens transcript, context, and result artifact actions from /subagents", async () => {
		const sessionFile = path.join(tempDir, "run-1.jsonl");
		const contextFile = path.join(tempDir, "run-1.context.md");
		const resultFile = path.join(tempDir, "run-1.result.json");
		fs.writeFileSync(sessionFile, "assistant: finished\n");
		fs.writeFileSync(contextFile, "Focus on src/auth.ts\n");
		fs.writeFileSync(resultFile, JSON.stringify({ changedFiles: ["src/auth.ts"] }, null, 2));

		const select = vi.fn(async (title: string, options: string[]) => {
			if (title === "Inspect subagent run") return options[0];
			if (title === "Open subagent artifact") return "Result JSON";
			return undefined;
		});
		const renderedScreens: string[] = [];
		let customCalls = 0;
		const custom: ExtensionUIContext["custom"] = async <T>(factory: Parameters<ExtensionUIContext["custom"]>[0]) => {
			customCalls += 1;
			const component = await factory(createFakeTui(), {} as any, {} as any, () => {});
			renderedScreens.push(stripAnsi(component.render(120).join("\n")));
			return undefined as T;
		};
		const runner = await createRunner(
			{
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

		expect(select).toHaveBeenNthCalledWith(1, "Inspect subagent run", ["✓ worker · Updated auth flow"]);
		expect(select).toHaveBeenNthCalledWith(2, "Open subagent artifact", [
			"Transcript",
			"Context packet",
			"Result JSON",
		]);
		expect(customCalls).toBe(1);
		expect(renderedScreens[0]).toContain("worker result");
		expect(renderedScreens[0]).toContain('"changedFiles": [');
	});
});
