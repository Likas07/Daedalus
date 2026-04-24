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

mock.module("@daedalus-pi/ai", () => ({ completeSimple: mockCompleteSimple }));

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

function assistant(messageUsage: Usage): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "assistant" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: messageUsage,
		stopReason: "stop",
		timestamp: 1,
	} as AssistantMessage;
}

function msg(id: string, message: AgentMessage, parentId: string | null = null): any {
	return { type: "message", id, parentId, timestamp: new Date().toISOString(), message };
}

describe("compaction usage accumulation", () => {
	it("sums assistant usage across compacted messages onto details.usage", async () => {
		const { compact, prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = [
			msg("1", { role: "user", content: "start", timestamp: 1 } as any),
			msg("2", assistant(usage(10, 5, 1, 2)), "1"),
			msg("3", assistant(usage(20, 10, 3, 4)), "2"),
			msg("4", assistant(usage(5, 2, 5, 6)), "3"),
			msg("5", { role: "user", content: "recent", timestamp: 5 } as any, "4"),
		];
		const prep = prepareCompaction(entries as any, { enabled: true, reserveTokens: 1000, keepRecentTokens: 1 }, "/w");
		expect(prep).toBeTruthy();
		const result = await compact(prep!, model(), "key");
		expect((result.details as any).usage).toEqual({
			input: 35,
			output: 17,
			cacheRead: 9,
			cacheWrite: 12,
			totalTokens: 73,
			cost: { input: 35, output: 17, cacheRead: 9, cacheWrite: 12, total: 73 },
		});
	});
});
