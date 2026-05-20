import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@daedalus-pi/ai";
import type { SessionEntry } from "./session-manager.js";
import {
	getAssistantResponseByEntryId,
	getAssistantResponseByResponseId,
	getLastAssistantResponse,
	renderTranscriptMarkdown,
	renderTranscriptPlain,
} from "./transcript-export.js";

const usage = {
	input: 1,
	output: 2,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 3,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const user: UserMessage = {
	role: "user",
	content: "Please inspect the file without truncating this text.",
	timestamp: 1,
};
const assistant: AssistantMessage = {
	role: "assistant",
	content: [
		{ type: "thinking", thinking: "I should inspect the file fully." },
		{ type: "text", text: "I will read the file." },
		{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/very-long-file.ts", limit: 10 } },
	],
	api: "openai",
	provider: "openai",
	model: "test-model",
	responseId: "resp-1",
	usage,
	stopReason: "toolUse",
	timestamp: 2,
};
const toolResult: ToolResultMessage = {
	role: "toolResult",
	toolCallId: "call-1",
	toolName: "read",
	content: [{ type: "text", text: "line 1\nline 2\nline 3 -- not folded" }],
	isError: false,
	timestamp: 3,
};
const finalAssistant: AssistantMessage = {
	...assistant,
	content: [{ type: "text", text: "Final answer with every exported token." }],
	responseId: "resp-2",
	stopReason: "stop",
	timestamp: 8,
};

const entries: SessionEntry[] = [
	{ type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: user },
	{ type: "message", id: "a1", parentId: "u1", timestamp: "2026-01-01T00:00:01.000Z", message: assistant },
	{ type: "message", id: "t1", parentId: "a1", timestamp: "2026-01-01T00:00:02.000Z", message: toolResult },
	{
		type: "custom_message",
		id: "c1",
		parentId: "t1",
		timestamp: "2026-01-01T00:00:03.000Z",
		customType: "note",
		content: "custom exported content",
		display: false,
	},
	{
		type: "branch_summary",
		id: "b1",
		parentId: "c1",
		timestamp: "2026-01-01T00:00:04.000Z",
		fromId: "old-leaf",
		summary: "branch summary text",
	},
	{
		type: "compaction",
		id: "compact1",
		parentId: "b1",
		timestamp: "2026-01-01T00:00:05.000Z",
		summary: "compaction summary text",
		firstKeptEntryId: "u1",
		tokensBefore: 123,
	},
	{ type: "message", id: "a2", parentId: "compact1", timestamp: "2026-01-01T00:00:06.000Z", message: finalAssistant },
];

describe("transcript export", () => {
	test("renders current-branch entries to markdown", () => {
		const markdown = renderTranscriptMarkdown(entries);
		expect(markdown).toContain("## User");
		expect(markdown).toContain("Please inspect the file without truncating this text.");
		expect(markdown).toContain("> Thinking");
		expect(markdown).toContain("I will read the file.");
		expect(markdown).toContain("**Tool call**: read (call-1)");
		expect(markdown).toContain('"path": "src/very-long-file.ts"');
		expect(markdown).toContain("## Tool result: read (call-1)");
		expect(markdown).toContain("line 3 -- not folded");
		expect(markdown).toContain("## Custom message: note");
		expect(markdown).toContain("custom exported content");
		expect(markdown).toContain("## Branch summary");
		expect(markdown).toContain("branch summary text");
		expect(markdown).toContain("## Compaction summary");
		expect(markdown).toContain("compaction summary text");
	});

	test("renders plain transcript without display folding or truncation", () => {
		const plain = renderTranscriptPlain(entries);
		expect(plain).toContain("User:");
		expect(plain).toContain("Thinking:\nI should inspect the file fully.");
		expect(plain).toContain("Tool call: read (call-1)");
		expect(plain).toContain("line 1\nline 2\nline 3 -- not folded");
		expect(plain).not.toContain("truncated");
		expect(plain).not.toContain("folded for display");
	});

	test("extracts last, selected entry, and selected provider response assistant text", () => {
		expect(getLastAssistantResponse(entries)?.text).toBe("Final answer with every exported token.");
		expect(getAssistantResponseByEntryId(entries, "a1")?.text).toBe("I will read the file.");
		expect(getAssistantResponseByResponseId(entries, "resp-2")?.entryId).toBe("a2");
	});
});
