import { describe, expect, it, mock } from "bun:test";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, Model, Usage } from "@daedalus-pi/ai";

const mockCompleteSimple = mock(
	async () =>
		({
			role: "assistant",
			content: [{ type: "text", text: "LLM_SUMMARY" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			usage: usage(1, 1),
			stopReason: "stop",
			timestamp: 1,
		}) as AssistantMessage,
);

mock.module("@daedalus-pi/ai", () => ({
	completeSimple: mockCompleteSimple,
}));

function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage {
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: input + output + cacheRead + cacheWrite,
		cost: { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite },
	};
}

function model(): Model<any> {
	return {
		id: "test",
		name: "Test",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "",
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000,
		maxTokens: 1000,
	} as Model<any>;
}

function assistant(
	content: AssistantMessage["content"],
	messageUsage = usage(1, 1),
	extra: Record<string, unknown> = {},
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: messageUsage,
		stopReason: "stop",
		timestamp: 1,
		...extra,
	} as AssistantMessage;
}

function msg(id: string, message: AgentMessage, parentId: string | null = null): any {
	return { type: "message", id, parentId, timestamp: new Date().toISOString(), message };
}

describe("compaction reasoning preservation e2e", () => {
	it("stores latest compacted reasoning and injects it into first kept empty assistant", async () => {
		mockCompleteSimple.mockClear();
		const { compact, prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const { buildSessionContext } = await import("../../src/core/session-manager.js");
		const entries = [
			msg("1", { role: "user", content: "old", timestamp: 1 } as any),
			msg("2", assistant([{ type: "thinking", thinking: "r1", thinkingSignature: "sig1" }]), "1"),
			msg(
				"3",
				assistant([{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }], usage(2, 3), {
					reasoning_details: [{ id: "r3", encrypted: "data" }],
				}),
				"2",
			),
			msg("4", { role: "user", content: "recent", timestamp: 4 } as any, "3"),
			msg("5", assistant([{ type: "text", text: "kept empty assistant" }]), "4"),
		];
		const prep = prepareCompaction(entries as any, { enabled: true, reserveTokens: 1000, keepRecentTokens: 1 }, "/w");
		expect(prep).toBeTruthy();
		const result = await compact(prep!, model(), "key");
		expect((result.details as any).reasoningSnapshot).toEqual({
			source: { api: "anthropic-messages", provider: "anthropic", model: "test" },
			thinkingBlocks: [{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }],
			reasoningDetails: [{ id: "r3", encrypted: "data" }],
		});

		const compactedEntries = [
			...entries,
			{
				type: "compaction",
				id: "6",
				parentId: "5",
				timestamp: new Date().toISOString(),
				summary: result.summary,
				firstKeptEntryId: result.firstKeptEntryId,
				tokensBefore: result.tokensBefore,
				details: result.details,
			},
		];
		const context = buildSessionContext(compactedEntries as any).messages;
		const keptAssistant = context.find(
			(message) =>
				message.role === "assistant" &&
				(message as AssistantMessage).content.some((block: any) => block.text === "kept empty assistant"),
		) as AssistantMessage;
		expect(keptAssistant.content[0]).toEqual({ type: "thinking", thinking: "r3", thinkingSignature: "sig3" });
		expect((keptAssistant as any).reasoning_details).toEqual([{ id: "r3", encrypted: "data" }]);
	});

	it("does not accumulate duplicate reasoning snapshots on repeated context builds", async () => {
		const { buildSessionContext } = await import("../../src/core/session-manager.js");
		const details = {
			reasoningSnapshot: {
				thinkingBlocks: [{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }],
			},
		};
		const entries = [
			msg("1", { role: "user", content: "old", timestamp: 1 } as any),
			msg("2", assistant([{ type: "thinking", thinking: "r3", thinkingSignature: "sig3" }]), "1"),
			msg("3", { role: "user", content: "kept", timestamp: 3 } as any, "2"),
			msg("4", assistant([{ type: "text", text: "empty 1" }]), "3"),
			{
				type: "compaction",
				id: "5",
				parentId: "4",
				timestamp: new Date().toISOString(),
				summary: "summary",
				firstKeptEntryId: "3",
				tokensBefore: 10,
				details,
			},
			msg("6", assistant([{ type: "text", text: "empty 2" }]), "5"),
		];

		const first = buildSessionContext(entries as any).messages;
		const second = buildSessionContext(entries as any).messages;
		for (const context of [first, second]) {
			const thinkingBlocks = context
				.filter((message) => message.role === "assistant")
				.flatMap((message) => (message as AssistantMessage).content)
				.filter((block) => block.type === "thinking" && block.thinking === "r3");
			expect(thinkingBlocks.length).toBe(1);
		}
	});
});
