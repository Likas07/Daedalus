import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
} from "@daedalus-pi/ai";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.js";
import { DEFAULT_TOOL_TIMEOUT_MS } from "../src/tool-timeout.js";
import type { AgentMessage, AgentTool } from "../src/types.js";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
		queueMicrotask(() => this.push({ type: "done", reason: message.stopReason, message }));
	}
}

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function identityConverter(messages: AgentMessage[]): Message[] {
	return messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult") as Message[];
}

function makeTool(name: string, execute: AgentTool["execute"]): AgentTool {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		execute,
	};
}

function makeAgent(
	tool: AgentTool,
	firstMessage: AssistantMessage,
	options: { toolTimeoutMs?: number; subagentToolTimeoutMs?: number } = {},
) {
	let calls = 0;
	const agent = new Agent({
		initialState: {
			systemPrompt: "",
			model: createModel(),
			tools: [tool],
		},
		convertToLlm: identityConverter,
		streamFn: () =>
			new MockAssistantStream(calls++ === 0 ? firstMessage : assistant([{ type: "text", text: "done" }])),
		...options,
	});
	return agent;
}

describe("agent tool timeout", () => {
	it("plumbs Agent timeout defaults and overrides", () => {
		const defaultAgent = new Agent();
		expect(defaultAgent.toolTimeoutMs).toBe(DEFAULT_TOOL_TIMEOUT_MS);
		expect(defaultAgent.subagentToolTimeoutMs).toBeUndefined();

		const customAgent = new Agent({ toolTimeoutMs: 100, subagentToolTimeoutMs: 1000 });
		expect(customAgent.toolTimeoutMs).toBe(100);
		expect(customAgent.subagentToolTimeoutMs).toBe(1000);
	});

	it("emits an error tool result when a normal tool exceeds the timeout", async () => {
		const slow = makeTool("slow", async () => {
			await new Promise(() => {});
			return { content: [{ type: "text", text: "never" }], details: {} };
		});
		const agent = makeAgent(slow, assistant([{ type: "toolCall", id: "call-1", name: "slow", arguments: {} }]), {
			toolTimeoutMs: 25,
		});

		await agent.prompt("run slow");

		const result = agent.state.messages.find((message) => message.role === "toolResult");
		expect(result?.role).toBe("toolResult");
		if (result?.role === "toolResult") {
			expect(result.isError).toBe(true);
			expect(result.content[0]).toMatchObject({ type: "text", text: "Tool slow timed out after 25ms" });
		}
	});

	it("does not apply the normal timeout to subagent tools when subagent timeout is unset", async () => {
		const subagent = makeTool("subagent", async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { content: [{ type: "text", text: "subagent ok" }], details: {} };
		});
		const agent = makeAgent(
			subagent,
			assistant([{ type: "toolCall", id: "call-1", name: "subagent", arguments: {} }]),
			{ toolTimeoutMs: 10 },
		);

		await agent.prompt("run subagent");

		const result = agent.state.messages.find((message) => message.role === "toolResult");
		expect(result?.role).toBe("toolResult");
		if (result?.role === "toolResult") {
			expect(result.isError).toBe(false);
			expect(result.content[0]).toMatchObject({ type: "text", text: "subagent ok" });
		}
	});

	it("does not apply the normal timeout to bash because bash has its own timeout", async () => {
		const bash = makeTool("bash", async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { content: [{ type: "text", text: "bash ok" }], details: {} };
		});
		const agent = makeAgent(bash, assistant([{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }]), {
			toolTimeoutMs: 10,
		});

		await agent.prompt("run bash");

		const result = agent.state.messages.find((message) => message.role === "toolResult");
		expect(result?.role).toBe("toolResult");
		if (result?.role === "toolResult") {
			expect(result.isError).toBe(false);
			expect(result.content[0]).toMatchObject({ type: "text", text: "bash ok" });
		}
	});

	it("aborts default-infinite subagent tools even if the tool ignores the signal", async () => {
		let markToolStarted!: () => void;
		const toolStarted = new Promise<void>((resolve) => {
			markToolStarted = resolve;
		});
		const subagent = makeTool("subagent", async () => {
			markToolStarted();
			await new Promise(() => {});
			return { content: [{ type: "text", text: "never" }], details: {} };
		});
		const agent = makeAgent(
			subagent,
			assistant([{ type: "toolCall", id: "call-1", name: "subagent", arguments: {} }]),
			{ toolTimeoutMs: 10 },
		);

		const promptPromise = agent.prompt("run subagent forever");
		await toolStarted;
		agent.abort();
		await expect(promptPromise).resolves.toBeUndefined();

		expect(agent.state.isStreaming).toBe(false);
		const result = agent.state.messages.find((message) => message.role === "toolResult");
		expect(result?.role).toBe("toolResult");
		if (result?.role === "toolResult") {
			expect(result.isError).toBe(true);
			expect(result.content[0]?.type).toBe("text");
			expect(result.content[0]?.text).not.toContain("timed out");
		}
	});
});
