import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage } from "@daedalus-pi/ai";
import {
	extractLastReasoning,
	injectReasoningIntoFirstEmptyAssistant,
	type ReasoningSnapshot,
} from "../../src/core/compaction/reasoning-preservation.js";

function assistant(content: AssistantMessage["content"], extra: Record<string, unknown> = {}): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "openai",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
		...extra,
	} as AssistantMessage;
}

const openAiSource = { api: "openai-completions", provider: "openai", model: "test" };

describe("reasoning preservation extraction and injection", () => {
	it("extractLastReasoning returns the latest non-empty assistant reasoning snapshot with source", () => {
		const messages: AgentMessage[] = [
			assistant([{ type: "thinking", thinking: "r1", thinkingSignature: "sig1" }]),
			assistant([{ type: "text", text: "none" }]),
			assistant([{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }], {
				reasoning_details: [{ type: "reasoning.encrypted", id: "r3", data: "encrypted" }],
			}),
			assistant([{ type: "text", text: "none" }]),
		];

		const snapshot = extractLastReasoning(messages);
		expect(snapshot).toEqual({
			source: openAiSource,
			thinkingBlocks: [{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }],
			reasoningDetails: [{ type: "reasoning.encrypted", id: "r3", data: "encrypted" }],
		});
	});

	it("extractLastReasoning includes allowlisted provider-specific top-level fields and tool thought signatures", () => {
		const snapshot = extractLastReasoning([
			assistant([{ type: "toolCall", id: "tc1", name: "read", arguments: {}, thoughtSignature: "thought-sig" }], {
				provider_reasoning_blob: { encrypted: true },
				not_reasoning_metadata: "ignored",
			}),
		]);

		expect(snapshot).toEqual({
			source: openAiSource,
			providerMetadata: { provider_reasoning_blob: { encrypted: true } },
			toolThoughtSignatures: [{ id: "tc1", thoughtSignature: "thought-sig" }],
		});
	});

	it("injectReasoningIntoFirstEmptyAssistant injects full snapshot once for the same provider/model", () => {
		const snapshot: ReasoningSnapshot = {
			source: openAiSource,
			thinkingBlocks: [{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }],
			reasoningDetails: [{ id: "r3" }],
			providerMetadata: { provider_reasoning_blob: { encrypted: true } },
			toolThoughtSignatures: [{ id: "tc1", thoughtSignature: "tool-sig" }],
		};
		const messages: AgentMessage[] = [
			{ role: "user", content: "summary", timestamp: 1 } as any,
			assistant([
				{ type: "text", text: "empty" },
				{ type: "toolCall", id: "tc1", name: "read", arguments: {} },
			]),
			{ role: "user", content: "next", timestamp: 2 } as any,
			assistant([{ type: "thinking", thinking: "r5", thinkingSignature: "sig5" }]),
		];

		expect(injectReasoningIntoFirstEmptyAssistant(messages, snapshot)).toBe(true);
		expect((messages[1] as AssistantMessage).content[0]).toEqual({
			type: "thinking",
			thinking: "r3",
			thinkingSignature: "sig3",
		});
		expect(((messages[1] as AssistantMessage).content[2] as any).thoughtSignature).toBe("tool-sig");
		expect((messages[1] as any).reasoning_details).toEqual([{ id: "r3" }]);
		expect((messages[1] as any).provider_reasoning_blob).toEqual({ encrypted: true });
		expect((messages[3] as AssistantMessage).content).toEqual([
			{ type: "thinking", thinking: "r5", thinkingSignature: "sig5" },
		]);

		expect(injectReasoningIntoFirstEmptyAssistant(messages, snapshot)).toBe(false);
		expect(
			messages.filter((message) => message.role === "assistant" && (message as any).reasoning_details).length,
		).toBe(1);
	});

	it("does not inject opaque metadata across providers", () => {
		const snapshot: ReasoningSnapshot = {
			source: { api: "anthropic-messages", provider: "anthropic", model: "claude" },
			thinkingBlocks: [{ type: "thinking", thinking: "visible", thinkingSignature: "anthropic-signature" }],
			reasoningDetails: [{ encrypted: "anthropic" }],
			providerMetadata: { provider_reasoning_blob: "opaque" },
			toolThoughtSignatures: [{ id: "tc1", thoughtSignature: "tool-sig" }],
		};
		const messages: AgentMessage[] = [
			assistant([{ type: "toolCall", id: "tc1", name: "read", arguments: {} }], {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-5",
			}),
		];

		expect(injectReasoningIntoFirstEmptyAssistant(messages, snapshot)).toBe(true);
		const injected = messages[0] as AssistantMessage;
		expect(injected.content[0]).toEqual({ type: "thinking", thinking: "visible" });
		expect((injected.content[0] as any).thinkingSignature).toBeUndefined();
		expect((injected.content[1] as any).thoughtSignature).toBeUndefined();
		expect((injected as any).reasoning_details).toBeUndefined();
		expect((injected as any).provider_reasoning_blob).toBeUndefined();
	});

	it("does not inject opaque metadata across models", () => {
		const snapshot: ReasoningSnapshot = {
			source: openAiSource,
			thinkingBlocks: [{ type: "thinking", thinking: "", thinkingSignature: JSON.stringify({ id: "rs_1" }) }],
			reasoningDetails: [{ encrypted: "openai" }],
			providerMetadata: { provider_reasoning_blob: "opaque" },
		};
		const messages: AgentMessage[] = [assistant([{ type: "text", text: "empty" }], { model: "different" })];

		expect(injectReasoningIntoFirstEmptyAssistant(messages, snapshot)).toBe(false);
		const target = messages[0] as AssistantMessage;
		expect(target.content).toEqual([{ type: "text", text: "empty" }]);
		expect((target as any).reasoning_details).toBeUndefined();
		expect((target as any).provider_reasoning_blob).toBeUndefined();
	});

	it("visible thinking-only snapshot can be injected across providers without signatures", () => {
		const snapshot: ReasoningSnapshot = {
			source: { api: "anthropic-messages", provider: "anthropic", model: "claude" },
			thinkingBlocks: [{ type: "thinking", thinking: "visible" }],
		};
		const messages: AgentMessage[] = [assistant([{ type: "text", text: "empty" }])];

		expect(injectReasoningIntoFirstEmptyAssistant(messages, snapshot)).toBe(true);
		expect((messages[0] as AssistantMessage).content[0]).toEqual({ type: "thinking", thinking: "visible" });
	});
});
