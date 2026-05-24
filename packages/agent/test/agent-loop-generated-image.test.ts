import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
	type UserMessage,
} from "@daedalus-pi/ai";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { agentLoop } from "../src/agent-loop.js";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage, AgentTool } from "../src/types.js";

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

function createUserMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: Date.now() };
}

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
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

describe("agentLoop generated image events", () => {
	it("forwards generated image stream updates as message_update events", async () => {
		const context: AgentContext = { messages: [], tools: [] };
		const prompt = createUserMessage("Draw a cat");
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const startPartial = createAssistantMessage([
					{ type: "generatedImage", id: "img_1", mimeType: "image/png", status: "in_progress" },
				]);
				const donePartial = createAssistantMessage([
					{
						type: "generatedImage",
						id: "img_1",
						mimeType: "image/png",
						data: "iVBORw0KGgo=",
						status: "completed",
					},
				]);
				stream.push({ type: "start", partial: createAssistantMessage([]) });
				stream.push({
					type: "generated_image_start",
					contentIndex: 0,
					image: startPartial.content[0] as any,
					partial: startPartial,
				});
				stream.push({
					type: "generated_image_end",
					contentIndex: 0,
					image: donePartial.content[0] as any,
					partial: donePartial,
				});
				stream.push({ type: "done", reason: "stop", message: donePartial });
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([prompt], context, config, undefined, streamFn);
		for await (const event of stream) events.push(event);

		const updates = events.filter((event) => event.type === "message_update");
		expect(updates.map((event) => event.assistantMessageEvent.type)).toEqual([
			"generated_image_start",
			"generated_image_end",
		]);
		expect((updates[1].message.content[0] as any).data).toBe("iVBORw0KGgo=");
	});

	it("does not execute generated image blocks as tools", async () => {
		let executed = false;
		const tool: AgentTool = {
			name: "draw",
			description: "draw",
			parameters: Type.Object({}),
			execute: async () => {
				executed = true;
				return "unexpected";
			},
		};
		const context: AgentContext = { messages: [], tools: [tool] };
		const prompt = createUserMessage("Draw a cat");
		const config: AgentLoopConfig = { model: createModel(), convertToLlm: identityConverter };

		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				const message = createAssistantMessage([
					{ type: "generatedImage", id: "img_1", mimeType: "image/png", status: "completed" },
				]);
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		const events: AgentEvent[] = [];
		const stream = agentLoop([prompt], context, config, undefined, streamFn);
		for await (const event of stream) events.push(event);

		expect(executed).toBe(false);
		expect(events.some((event) => event.type === "tool_execution_start")).toBe(false);
		expect(events.filter((event) => event.type === "turn_end")[0].toolResults).toEqual([]);
	});
});
