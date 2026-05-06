import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import { Agent } from "@daedalus-pi/agent-core";
import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Model,
	Type,
	type Usage,
} from "@daedalus-pi/ai";
import { AgentSession } from "./agent-session";
import { AuthStorage } from "./auth-storage";
import type { ExtensionContext } from "./extensions/types";
import { defineTool } from "./extensions/types";
import { ModelRegistry } from "./model-registry";
import { DefaultResourceLoader } from "./resource-loader";
import { SessionManager } from "./session-manager";
import { SettingsManager } from "./settings-manager";

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const TEST_MODEL = {
	id: "test-model",
	name: "Test Model",
	api: "openai-completions",
	provider: "test-provider",
	baseUrl: "https://example.invalid/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 4_096,
} satisfies Model<any>;

type ToolCallSpec = {
	name: string;
	arguments: Record<string, unknown>;
};

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: TEST_MODEL.api,
		provider: TEST_MODEL.provider,
		model: TEST_MODEL.id,
		usage: EMPTY_USAGE,
		stopReason,
		timestamp: Date.now(),
	};
}

function streamToolThenStop(toolCall: ToolCallSpec) {
	let callCount = 0;
	return () => {
		const stream = new MockAssistantStream();
		queueMicrotask(() => {
			callCount += 1;
			if (callCount === 1) {
				stream.push({
					type: "done",
					reason: "toolUse",
					message: assistantMessage(
						[
							{
								type: "toolCall",
								id: `${toolCall.name}-call`,
								name: toolCall.name,
								arguments: toolCall.arguments,
							},
						],
						"toolUse",
					),
				});
				return;
			}

			stream.push({
				type: "done",
				reason: "stop",
				message: assistantMessage([{ type: "text", text: "done" }], "stop"),
			});
		});
		return stream;
	};
}

function createTestSession(options: {
	initialActiveToolNames: string[];
	customTools?: ConstructorParameters<typeof AgentSession>[0]["customTools"];
}) {
	const cwd = mkdtempSync(join(tmpdir(), "daedalus-tool-context-cwd-"));
	const agentDir = join(cwd, ".daedalus");
	const settingsManager = SettingsManager.inMemory();
	const sessionManager = SessionManager.create(cwd, join(agentDir, "sessions"));
	const authStorage = AuthStorage.inMemory({ "test-provider": { type: "api_key", key: "test-key" } });
	const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
	const agent = new Agent({
		initialState: { model: TEST_MODEL, thinkingLevel: "off" },
		streamFn: streamToolThenStop({ name: options.initialActiveToolNames[0] ?? "", arguments: {} }),
		getApiKey: (provider) => modelRegistry.getApiKeyForProvider(provider),
	});
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
	});

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd,
		resourceLoader,
		modelRegistry,
		initialActiveToolNames: options.initialActiveToolNames,
		customTools: options.customTools,
	});

	return { session, agent, cwd, sessionManager, modelRegistry };
}

function findToolResult(agent: Agent, toolName: string): Extract<AgentMessage, { role: "toolResult" }> | undefined {
	return agent.state.messages.find(
		(message): message is Extract<AgentMessage, { role: "toolResult" }> =>
			message.role === "toolResult" && message.toolName === toolName,
	);
}

describe("built-in tool execution context", () => {
	test("real web_search fails with Missing Codex OAuth credentials when unauthenticated", async () => {
		const { session, agent } = createTestSession({ initialActiveToolNames: ["web_search"] });
		agent.streamFn = streamToolThenStop({ name: "web_search", arguments: { query: "Daedalus" } });

		await session.prompt("search the web", { expandPromptTemplates: false });

		const result = findToolResult(agent, "web_search");
		expect(result).toBeDefined();
		expect(result?.isError).toBe(true);
		const text = result?.content.find((content) => content.type === "text")?.text ?? "";
		expect(text).toContain("Missing Codex OAuth credentials");
		expect(text).not.toContain("modelRegistry");
		expect(text).not.toContain("Cannot read properties of undefined");
	});

	test("ToolDefinition runtime execution receives cwd, sessionManager, and modelRegistry", async () => {
		let observedCtx: Pick<ExtensionContext, "cwd" | "sessionManager" | "modelRegistry"> | undefined;
		const ctxProbe = defineTool({
			name: "ctx_probe",
			label: "ctx_probe",
			description: "Capture the runtime extension context for regression testing.",
			parameters: Type.Object({}),
			execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
				observedCtx = {
					cwd: ctx.cwd,
					sessionManager: ctx.sessionManager,
					modelRegistry: ctx.modelRegistry,
				};
				return { content: [{ type: "text", text: "ctx ok" }], details: {} };
			},
		});
		const { session, agent, cwd, sessionManager, modelRegistry } = createTestSession({
			initialActiveToolNames: ["ctx_probe"],
			customTools: [ctxProbe],
		});
		agent.streamFn = streamToolThenStop({ name: "ctx_probe", arguments: {} });

		await session.prompt("probe context", { expandPromptTemplates: false });

		const result = findToolResult(agent, "ctx_probe");
		expect(result?.isError).toBe(false);
		expect(observedCtx?.cwd).toBe(cwd);
		expect(observedCtx?.sessionManager).toBe(sessionManager);
		expect(observedCtx?.modelRegistry).toBe(modelRegistry);
	});
});
