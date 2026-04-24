import { describe, expect, it, mock } from "bun:test";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, Model } from "@daedalus-pi/ai";

const mockCompleteSimple = mock(
	async () =>
		({
			role: "assistant",
			content: [{ type: "text", text: "LLM_SUMMARY" }],
			api: "anthropic-messages",
			provider: "anthropic",
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
		}) as AssistantMessage,
);

mock.module("@daedalus-pi/ai", () => ({
	completeSimple: mockCompleteSimple,
}));

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

function msg(id: string, message: AgentMessage, parentId: string | null = null): any {
	return { type: "message", id, parentId, timestamp: new Date().toISOString(), message };
}

describe("compaction operation frame integration and droppable helpers", () => {
	it("pure droppable helpers exclude droppables from compaction input and live context", async () => {
		const { filterDroppableForCompaction, removeDroppableAfterCompaction } = await import(
			"../../src/core/compaction/compaction.js"
		);
		const { buildSessionContext } = await import("../../src/core/session-manager.js");
		const entries = [
			msg("1", { role: "user", content: "keep", timestamp: 1 } as any),
			{
				type: "custom_message",
				id: "2",
				parentId: "1",
				timestamp: new Date().toISOString(),
				customType: "x",
				content: "drop",
				display: false,
				droppable: true,
			},
			msg(
				"3",
				{
					role: "assistant",
					content: [{ type: "text", text: "keep2" }],
					stopReason: "stop",
					usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
					timestamp: 2,
				} as any,
				"2",
			),
			{
				type: "compaction",
				id: "4",
				parentId: "3",
				timestamp: new Date().toISOString(),
				summary: "summary",
				firstKeptEntryId: "1",
				tokensBefore: 10,
			},
			{
				type: "custom_message",
				id: "5",
				parentId: "4",
				timestamp: new Date().toISOString(),
				customType: "x",
				content: "drop-after",
				display: false,
				droppable: true,
			},
			msg(
				"6",
				{
					role: "custom",
					customType: "x",
					content: "drop-agent-message-after",
					display: false,
					droppable: true,
					timestamp: 3,
				} as any,
				"5",
			),
			msg(
				"7",
				{
					role: "custom",
					customType: "x",
					content: "keep-agent-message-after",
					display: false,
					timestamp: 4,
				} as any,
				"6",
			),
		];
		expect(filterDroppableForCompaction(entries as any).map((e: any) => e.id)).toEqual(["1", "3", "4", "7"]);
		expect(removeDroppableAfterCompaction(entries as any).map((e: any) => e.id)).toEqual(["1", "3", "4", "7"]);
		const context = buildSessionContext(entries as any).messages as any[];
		expect(context.some((m) => m.content === "drop")).toBe(false);
		expect(context.some((m) => m.content === "drop-after")).toBe(false);
		expect(context.some((m) => m.content === "drop-agent-message-after")).toBe(false);
		expect(context.some((m) => m.content === "keep-agent-message-after")).toBe(true);
	});

	it("compact appends rendered operation frame and details.operationFrame", async () => {
		mockCompleteSimple.mockClear();
		const { prepareCompaction, compact } = await import("../../src/core/compaction/compaction.js");
		const assistant: AssistantMessage = {
			role: "assistant",
			content: [{ type: "toolCall", id: "tc1", name: "read", arguments: { path: "/w/a.ts" } }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			usage: {
				input: 100,
				output: 50,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 150,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "tool_use",
			timestamp: 2,
		};
		const entries = [
			msg("1", { role: "user", content: "fix", timestamp: 1 } as any),
			msg("2", assistant, "1"),
			msg("3", { role: "user", content: "recent", timestamp: 3 } as any, "2"),
		];
		const prep = prepareCompaction(entries as any, { enabled: true, reserveTokens: 1000, keepRecentTokens: 1 }, "/w");
		expect(prep).toBeTruthy();
		const result = await compact(prep!, model(), "key");
		expect(result.summary).toContain("LLM_SUMMARY");
		expect(result.summary).toContain("## Summary");
		expect(result.summary).toContain("**Read:** `a.ts`");
		expect((result.details as any).readFiles).toBeDefined();
		expect((result.details as any).modifiedFiles).toBeDefined();
		expect((result.details as any).operationFrame.messages.length).toBeGreaterThan(0);
	});

	it("compact deterministically merges previous operation frame with current frame", async () => {
		mockCompleteSimple.mockClear();
		const { compact } = await import("../../src/core/compaction/compaction.js");
		const result = await compact(
			{
				firstKeptEntryId: "recent",
				messagesToSummarize: [assistantToolCall("write", { path: "/w/b.ts" }, "tc2")],
				turnPrefixMessages: [],
				isSplitTurn: false,
				tokensBefore: 20,
				previousSummary: "previous",
				fileOps: { read: new Set(), edited: new Set(), written: new Set() },
				settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 1 },
				cwd: "/w",
				previousOperationFrame: {
					cwd: "/w",
					messages: [
						{
							role: "assistant",
							contents: [
								{
									type: "toolCall",
									toolCall: { toolCallId: "tc1", tool: { kind: "file_read", path: "/w/a.ts" } },
								},
							],
						},
					],
				},
			} as any,
			model(),
			"key",
		);
		const frame = (result.details as any).operationFrame;
		expect(frame.messages.flatMap((m: any) => m.contents).map((c: any) => c.toolCall?.tool)).toEqual([
			{ kind: "file_read", path: "a.ts" },
			{ kind: "file_update", path: "b.ts" },
		]);
		expect(result.summary).toContain("**Read:** `a.ts`");
		expect(result.summary).toContain("**Update:** `b.ts`");
	});
});

function assistantToolCall(name: string, args: Record<string, unknown>, id: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id, name, arguments: args }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "tool_use",
		timestamp: 1,
	} as AssistantMessage;
}
