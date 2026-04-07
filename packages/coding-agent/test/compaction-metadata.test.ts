import { afterEach, describe, expect, it, vi } from "bun:test";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import * as ai from "@oh-my-pi/pi-ai";
import { getBundledModel } from "@oh-my-pi/pi-ai/models";
import { hookFetch } from "@oh-my-pi/pi-utils";
import {
	type CompactionSettings,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	prepareCompaction,
} from "../src/session/compaction/compaction";
import type { SessionEntry } from "../src/session/session-manager";

function createMockUsage(input: number, output: number, cacheRead = 0, cacheWrite = 0) {
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: input + output + cacheRead + cacheWrite,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createUserMessage(text: string): AgentMessage {
	return { role: "user", content: text, timestamp: Date.now() };
}

function createAssistantMessage(text: string, usage = createMockUsage(0, 100, 9_000, 0)) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		usage,
		stopReason: "stop" as const,
		timestamp: Date.now(),
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
	};
}

function createToolResultMessage(toolName: string, text: string): AgentMessage {
	return {
		role: "toolResult" as const,
		toolName,
		toolCallId: `${toolName}-call`,
		content: [{ type: "text" as const, text }],
		isError: false,
		timestamp: Date.now(),
	};
}

function createEntriesWithLargeToolResult(): SessionEntry[] {
	const hugeToolOutput = "x".repeat(220_000);
	const recentToolOutput = "y".repeat(220_000);
	return [
		createMessageEntry("m1", null, createUserMessage("Turn 1")),
		createMessageEntry("m2", "m1", createAssistantMessage("Answer 1", createMockUsage(0, 100, 60_000, 0))),
		createMessageEntry("m3", "m2", createToolResultMessage("bash", hugeToolOutput)),
		createMessageEntry("m4", "m3", createUserMessage("Turn 2")),
		createMessageEntry("m5", "m4", createAssistantMessage("Answer 2", createMockUsage(0, 100, 30_000, 0))),
		createMessageEntry("m6", "m5", createToolResultMessage("bash", recentToolOutput)),
		createMessageEntry("m7", "m6", createUserMessage("Turn 3")),
		createMessageEntry("m8", "m7", createAssistantMessage("Answer 3", createMockUsage(0, 100, 90_000, 0))),
	];
}

function createMessageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message,
	} as SessionEntry;
}

function createCompactionEntry(
	id: string,
	parentId: string | null,
	summary: string,
	firstKeptEntryId: string,
): SessionEntry {
	return {
		type: "compaction",
		id,
		parentId,
		timestamp: new Date().toISOString(),
		summary,
		firstKeptEntryId,
		tokensBefore: 10_000,
	} as SessionEntry;
}

function createEntries(): SessionEntry[] {
	return [
		createMessageEntry("m1", null, createUserMessage("Turn 1")),
		createMessageEntry("m2", "m1", createAssistantMessage("Answer 1")),
		createMessageEntry("m3", "m2", createUserMessage("Turn 2")),
		createMessageEntry("m4", "m3", createAssistantMessage("Answer 2", createMockUsage(0, 100, 5_000, 0))),
		createMessageEntry("m5", "m4", createUserMessage("Turn 3")),
		createMessageEntry("m6", "m5", createAssistantMessage("Answer 3", createMockUsage(0, 100, 9_000, 0))),
	];
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("compaction metadata", () => {
	it("records local metadata when remote compaction is disabled", async () => {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5")!;
		const preparation = prepareCompaction(createEntries(), {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1_000,
			remoteEnabled: false,
			remoteEndpoint: "https://compaction.example.test/summarize",
		});
		if (!preparation) throw new Error("Expected compaction preparation");
		vi.spyOn(ai, "completeSimple")
			.mockResolvedValueOnce(createAssistantMessage("Local history summary"))
			.mockResolvedValueOnce(createAssistantMessage("Local turn summary"))
			.mockResolvedValueOnce(createAssistantMessage("Local short summary"));

		const result = await compact(preparation, model, "test-api-key");
		expect(result.details).toMatchObject({
			metadata: {
				thresholdSource: "reserve",
				historySummaryMethod: "local",
				shortSummaryMethod: "local",
				remoteArtifactMethod: "none",
				remoteArtifactAttempted: false,
				remoteArtifactFallbackUsed: false,
				splitTurn: true,
				usedPreviousSummary: false,
			},
		});
	});

	it("records fixed-threshold policy metadata", async () => {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5")!;
		const settings: CompactionSettings = {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1_000,
			thresholdTokens: 12_345,
			remoteEnabled: false,
		};
		const preparation = prepareCompaction(createEntries(), settings);
		if (!preparation) throw new Error("Expected compaction preparation");
		vi.spyOn(ai, "completeSimple")
			.mockResolvedValueOnce(createAssistantMessage("History summary"))
			.mockResolvedValueOnce(createAssistantMessage("Turn summary"))
			.mockResolvedValueOnce(createAssistantMessage("Short summary"));

		const result = await compact(preparation, model, "test-api-key");
		expect(result.details).toMatchObject({
			metadata: {
				thresholdSource: "fixed_tokens",
				thresholdTokens: 12_345,
				effectiveKeepRecentTokens: preparation.effectiveKeepRecentTokens,
			},
		});
	});

	it("records OpenAI remote artifact metadata", async () => {
		const model = getBundledModel("openai", "gpt-5.1");
		if (!model) throw new Error("Expected OpenAI model");
		const previousCompaction = createCompactionEntry("c1", null, "Previous summary", "m2") as SessionEntry & {
			preserveData?: Record<string, unknown>;
		};
		previousCompaction.preserveData = {
			openaiRemoteCompaction: {
				provider: "openai",
				replacementHistory: [
					{ type: "message", role: "user", content: [{ type: "input_text", text: "Previous preserved user" }] },
					{ type: "compaction", encrypted_content: "prior_encrypted" },
				],
				compactionItem: { type: "compaction", encrypted_content: "prior_encrypted" },
			},
		};
		const entries = [
			createMessageEntry("m1", null, createUserMessage("Turn 1")),
			createMessageEntry("m2", "m1", createAssistantMessage("Answer 1") as unknown as AgentMessage),
			previousCompaction,
			createMessageEntry("m3", "c1", createUserMessage("Turn 2")),
			createMessageEntry("m4", "m3", createAssistantMessage("Answer 2") as unknown as AgentMessage),
		];
		const preparation = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1_000,
			remoteEnabled: true,
		});
		if (!preparation) throw new Error("Expected compaction preparation");
		const fetchSpy = vi.fn(
			(_input, _init, _next) =>
				new Response(JSON.stringify({ output: [{ type: "compaction", encrypted_content: "new_encrypted" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		using _hook = hookFetch(fetchSpy);
		vi.spyOn(ai, "completeSimple")
			.mockResolvedValueOnce(createAssistantMessage("History summary") as any)
			.mockResolvedValueOnce(createAssistantMessage("Short summary") as any);

		const result = await compact(preparation, model, "test-api-key");
		expect(result.details).toMatchObject({
			metadata: {
				remoteArtifactMethod: "openai",
				remoteArtifactAttempted: true,
				remoteArtifactFallbackUsed: false,
			},
		});
	});
});

it("prunes oversized old tool results before summarization", () => {
	const preparation = prepareCompaction(createEntriesWithLargeToolResult(), {
		...DEFAULT_COMPACTION_SETTINGS,
		keepRecentTokens: 1_000,
		remoteEnabled: false,
	});
	if (!preparation) throw new Error("Expected compaction preparation");

	const prunedToolResult = preparation.messagesToSummarize.find(message => message.role === "toolResult");
	expect(prunedToolResult).toBeDefined();
	expect(JSON.stringify(prunedToolResult)).toContain("[Output truncated - ");
	expect(preparation.pruning).toEqual({ prunedCount: 1, tokensSaved: expect.any(Number) });
});

it("records pruning metadata in compaction results", async () => {
	const model = getBundledModel("anthropic", "claude-sonnet-4-5")!;
	const preparation = prepareCompaction(createEntriesWithLargeToolResult(), {
		...DEFAULT_COMPACTION_SETTINGS,
		keepRecentTokens: 1_000,
		remoteEnabled: false,
	});
	if (!preparation) throw new Error("Expected compaction preparation");
	vi.spyOn(ai, "completeSimple")
		.mockResolvedValueOnce(createAssistantMessage("History summary"))
		.mockResolvedValueOnce(createAssistantMessage("Short summary"));

	const result = await compact(preparation, model, "test-api-key");
	expect(result.details).toMatchObject({
		metadata: {
			prunedToolResults: 1,
			prunedToolResultTokensSaved: expect.any(Number),
		},
	});
});

function createToolOnlyEntriesForMicrocompact(): SessionEntry[] {
	const hugeToolOutput = "z".repeat(220_000);
	return [
		createCompactionEntry("c1", null, "Previous summary", "m-old"),
		createMessageEntry("m1", "c1", createToolResultMessage("bash", hugeToolOutput)),
		createMessageEntry("m2", "m1", createToolResultMessage("bash", hugeToolOutput)),
		createMessageEntry("m3", "m2", createAssistantMessage("Current turn", createMockUsage(0, 100, 120_000, 0))),
	];
}

it("uses a micro compaction path when only pruned tool results need reduction", async () => {
	const model = getBundledModel("anthropic", "claude-sonnet-4-5")!;
	const preparation = prepareCompaction(createToolOnlyEntriesForMicrocompact(), {
		...DEFAULT_COMPACTION_SETTINGS,
		keepRecentTokens: 1_000,
		remoteEnabled: false,
	});
	if (!preparation) throw new Error("Expected compaction preparation");
	const completeSpy = vi.spyOn(ai, "completeSimple");

	const result = await compact(preparation, model, "test-api-key");
	expect(completeSpy).not.toHaveBeenCalled();
	expect(result.summary).toContain("Older tool outputs were reduced");
	expect(result.details).toMatchObject({
		metadata: {
			mode: "micro",
			prunedToolResults: 1,
		},
	});
});
