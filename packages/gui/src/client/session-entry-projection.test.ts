import { describe, expect, test } from "bun:test";
import { projectSessionEntries, type SessionEntryLike } from "./session-entry-projection";

const ts = "2026-04-26T00:00:00.000Z";
const base = (type: string, id = type): SessionEntryLike => ({ type, id, parentId: null, timestamp: ts });

describe("session entry projection", () => {
	test("covers TUI session entry types", () => {
		const entries: SessionEntryLike[] = [
			{ ...base("message", "u"), message: { role: "user", content: "hello" } },
			{ ...base("message", "a"), message: { role: "assistant", responseId: "r1", model: "claude", content: [{ type: "thinking", thinking: "plan" }, { type: "text", text: "hi" }, { type: "toolCall", id: "tc1", name: "read", arguments: { path: "x" } }] } },
			{ ...base("message", "tr"), message: { role: "toolResult", toolCallId: "tc1", toolName: "read", content: [{ type: "text", text: "ok" }], isError: false } },
			{ ...base("model_change"), provider: "anthropic", modelId: "claude" },
			{ ...base("thinking_level_change"), thinkingLevel: "high" },
			{ ...base("fast_mode_change"), fastMode: true },
			{ ...base("compaction"), summary: "short", firstKeptEntryId: "u", tokensBefore: 100 },
			{ ...base("branch_summary"), fromId: "a", summary: "branch" },
			{ ...base("custom"), customType: "extension/state", data: { ok: true } },
			{ ...base("custom_message"), customType: "skill/test", content: "skill ran", display: true },
			{ ...base("label"), targetId: "a", label: "bookmark" },
		];
		const rows = projectSessionEntries(entries, "s1");
		expect(rows.map((row) => row.kind)).toContain("user");
		expect(rows.map((row) => row.kind)).toContain("assistant");
		expect(rows.map((row) => row.kind)).toContain("tool");
		expect(rows.map((row) => row.kind)).toContain("model");
		expect(rows.map((row) => row.kind)).toContain("thinking");
		expect(rows.map((row) => row.kind)).toContain("fast-mode");
		expect(rows.map((row) => row.kind)).toContain("compaction");
		expect(rows.map((row) => row.kind)).toContain("branch-summary");
		expect(rows.map((row) => row.kind)).toContain("custom");
		expect(rows.map((row) => row.kind)).toContain("skill");
		expect(rows.map((row) => row.kind)).toContain("label");
		expect(rows.every((row) => row.sessionId === "s1")).toBe(true);
	});

	test("hides custom messages marked display false", () => {
		expect(projectSessionEntries([{ ...base("custom_message"), customType: "hidden", content: "no", display: false }])).toHaveLength(0);
	});
});
