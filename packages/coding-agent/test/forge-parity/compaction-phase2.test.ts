import { describe, expect, it, mock } from "bun:test";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, Model } from "@daedalus-pi/ai";

const mockCompleteSimple = mock(
	async (_model: Model<any>) =>
		({
			role: "assistant",
			content: [{ type: "text", text: "LLM_SUMMARY" }],
			api: _model.api,
			provider: _model.provider,
			model: _model.id,
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
			stopReason: "stop",
			timestamp: 1,
		}) as AssistantMessage,
);

mock.module("@daedalus-pi/ai", () => ({
	completeSimple: mockCompleteSimple,
}));

function user(content = "u"): AgentMessage {
	return { role: "user", content, timestamp: Date.now() } as any;
}

function assistant(text = "a"): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		stopReason: "stop",
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
		timestamp: Date.now(),
	} as any;
}

function entry(id: string, message: AgentMessage): any {
	return { type: "message", id, parentId: null, timestamp: new Date().toISOString(), message };
}

function modelChange(id: string): any {
	return {
		type: "model_change",
		id,
		parentId: null,
		timestamp: new Date().toISOString(),
		provider: "anthropic",
		modelId: "claude-sonnet-4-5",
	};
}

function model(id = "active", provider = "anthropic"): Model<any> {
	return {
		id,
		name: id,
		api: "anthropic-messages",
		provider,
		baseUrl: "",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000,
		maxTokens: 1000,
	} as Model<any>;
}

describe("Forge parity Phase 2 compaction settings and triggers", () => {
	it("keeps Daedalus aggressive compaction defaults", async () => {
		const { DEFAULT_COMPACTION_SETTINGS } = await import("../../src/core/compaction/compaction.js");
		expect(DEFAULT_COMPACTION_SETTINGS.enabled).toBe(true);
		expect(DEFAULT_COMPACTION_SETTINGS.reserveTokens).toBe(16384);
		expect(DEFAULT_COMPACTION_SETTINGS.keepRecentTokens).toBe(20000);
		expect(DEFAULT_COMPACTION_SETTINGS.keepRecentRatio).toBe(0.1);
		expect(DEFAULT_COMPACTION_SETTINGS.evictionWindow).toBe(1);
		expect(DEFAULT_COMPACTION_SETTINGS.retentionWindow).toBe(0);
		expect(DEFAULT_COMPACTION_SETTINGS.tokenThreshold).toBeUndefined();
		expect(DEFAULT_COMPACTION_SETTINGS.turnThreshold).toBeUndefined();
		expect(DEFAULT_COMPACTION_SETTINGS.messageThreshold).toBeUndefined();
		expect(DEFAULT_COMPACTION_SETTINGS.compactOnTurnEnd).toBeUndefined();
		expect(DEFAULT_COMPACTION_SETTINGS.compactModel).toBeUndefined();
	});

	it("supports token, turn, message, and turn-end proactive triggers", async () => {
		const {
			shouldCompact,
			shouldCompactByTokens,
			shouldCompactByTurns,
			shouldCompactByMessages,
			shouldCompactOnTurnEnd,
		} = await import("../../src/core/compaction/compaction.js");
		const messages = [user(), assistant(), user()];
		const base = { enabled: true, reserveTokens: 100, keepRecentTokens: 1000 };

		expect(shouldCompactByTokens(1500, { ...base, tokenThreshold: 1000 })).toBe(true);
		expect(shouldCompactByTokens(999, { ...base, tokenThreshold: 1000 })).toBe(false);
		expect(shouldCompactByTokens(1500, base)).toBe(false);

		expect(shouldCompactByTurns(messages, { ...base, turnThreshold: 3 })).toBe(false);
		expect(shouldCompactByTurns(messages, { ...base, turnThreshold: 2 })).toBe(true);
		expect(shouldCompactByTurns(messages, { ...base, turnThreshold: 1 })).toBe(true);

		expect(shouldCompactByMessages(messages, { ...base, messageThreshold: 4 })).toBe(false);
		expect(shouldCompactByMessages(messages, { ...base, messageThreshold: 3 })).toBe(true);
		expect(shouldCompactByMessages(messages, { ...base, messageThreshold: 2 })).toBe(true);

		expect(shouldCompactOnTurnEnd(messages, { ...base, compactOnTurnEnd: true })).toBe(true);
		expect(shouldCompactOnTurnEnd([...messages, assistant()], { ...base, compactOnTurnEnd: true })).toBe(false);
		expect(shouldCompactOnTurnEnd(messages, { ...base, compactOnTurnEnd: false })).toBe(false);

		expect(shouldCompact(10, 1000, base, messages)).toBe(false);
		expect(shouldCompact(1000, 100000, { ...base, tokenThreshold: 1000 }, messages)).toBe(true);
		expect(shouldCompact(10, 100000, { ...base, turnThreshold: 2 }, messages)).toBe(true);
		expect(shouldCompact(10, 100000, { ...base, messageThreshold: 3 }, messages)).toBe(true);
		expect(shouldCompact(10, 100000, { ...base, compactOnTurnEnd: true }, messages)).toBe(true);
		expect(shouldCompact(901, 1000, base, messages)).toBe(true);
	});
});

describe("Forge parity Phase 2 compaction windows", () => {
	it("retentionWindow preserves the last N context messages from compaction candidates", async () => {
		const { prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = Array.from({ length: 10 }, (_, i) =>
			entry(String(i + 1), i % 2 === 0 ? user(`u${i}`) : assistant(`a${i}`)),
		);
		const prep = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			retentionWindow: 3,
			evictionWindow: 1,
		});
		expect(prep?.firstKeptEntryId).toBe("8");
	});

	it("retentionWindow counts context messages, not raw SessionEntry indices", async () => {
		const { prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = [
			entry("m1", user("old")),
			modelChange("meta1"),
			modelChange("meta2"),
			entry("m2", assistant("middle")),
			modelChange("meta3"),
			entry("m3", user("recent")),
		];
		const prep = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			retentionWindow: 2,
			evictionWindow: 1,
		});
		expect(prep?.firstKeptEntryId).toBe("m2");
	});

	it("evictionWindow caps the token fraction of context allowed to compact and 0.0 disables compaction", async () => {
		const { prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = Array.from({ length: 10 }, (_, i) =>
			entry(String(i + 1), i % 2 === 0 ? user(`u${i}`) : assistant(`a${i}`)),
		);
		const half = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			evictionWindow: 0.5,
		});
		expect(half?.firstKeptEntryId).toBe("6");

		const none = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			evictionWindow: 0,
		});
		expect(none).toBeUndefined();
	});

	it("default evictionWindow allows full eligible compaction", async () => {
		const { DEFAULT_COMPACTION_SETTINGS, prepareCompaction } = await import(
			"../../src/core/compaction/compaction.js"
		);
		const entries = Array.from({ length: 10 }, (_, i) =>
			entry(String(i + 1), i % 2 === 0 ? user(`u${i}`) : assistant(`a${i}`)),
		);
		const prep = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1,
		});
		expect(prep?.firstKeptEntryId).toBe("10");
	});

	it("evictionWindow uses non-uniform token sizes instead of message counts", async () => {
		const { prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = [
			entry("1", user("a".repeat(16))),
			entry("2", user("b".repeat(16))),
			entry("3", user("c".repeat(16))),
			entry("4", user("d".repeat(160))),
			entry("5", user("e".repeat(160))),
		];
		const prep = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			evictionWindow: 0.2,
		});
		expect(prep?.firstKeptEntryId).toBe("4");
	});

	it("proactive thresholds under defaults do not prepare empty/no-op compactions", async () => {
		const { DEFAULT_COMPACTION_SETTINGS, prepareCompaction } = await import(
			"../../src/core/compaction/compaction.js"
		);
		const entries = [entry("1", user("tiny")), entry("2", assistant("tiny")), entry("3", user("tiny"))];
		const prep = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			messageThreshold: 1,
		});
		expect(prep).toBeUndefined();
	});

	it("uses conservative retention plus eviction behavior", async () => {
		const { prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = Array.from({ length: 10 }, (_, i) =>
			entry(String(i + 1), i % 2 === 0 ? user(`u${i}`) : assistant(`a${i}`)),
		);
		const prep = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			retentionWindow: 3,
			evictionWindow: 0.5,
		});
		expect(prep?.firstKeptEntryId).toBe("6");
	});
});

describe("Forge parity Phase 2 compactModel", () => {
	it("uses compactModel for summarization when provided", async () => {
		mockCompleteSimple.mockClear();
		const { compact, prepareCompaction } = await import("../../src/core/compaction/compaction.js");
		const entries = [entry("1", user("old")), entry("2", assistant("old answer")), entry("3", user("new"))];
		const prep = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 100,
			keepRecentTokens: 1,
			evictionWindow: 1,
			compactModel: model("compact", "openai"),
		});
		expect(prep).toBeDefined();
		await compact(prep!, model("active", "anthropic"), "api-key");
		expect(mockCompleteSimple).toHaveBeenCalled();
		expect(mockCompleteSimple.mock.calls[0][0]).toMatchObject({ id: "compact", provider: "openai" });
	});
});
