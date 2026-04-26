import { describe, expect, test } from "bun:test";
import type { SessionEntry, SessionHeader } from "../session-manager.js";
import {
	assertRoundTripStable,
	parseSessionJsonl,
	SessionJsonlParseError,
	serializeSessionJsonl,
} from "./jsonl-codec.js";

const header: SessionHeader = {
	type: "session",
	version: 3,
	id: "session-1",
	timestamp: "2026-04-26T00:00:00.000Z",
	cwd: "/workspace/project",
};

const entries: SessionEntry[] = [
	{
		type: "message",
		id: "entry-message",
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: "hello", timestamp: 1777161601000 },
	},
	{
		type: "model_change",
		id: "entry-model",
		parentId: "entry-message",
		timestamp: "2026-04-26T00:00:02.000Z",
		provider: "anthropic",
		modelId: "claude-sonnet-4-5",
	},
	{
		type: "thinking_level_change",
		id: "entry-thinking",
		parentId: "entry-model",
		timestamp: "2026-04-26T00:00:03.000Z",
		thinkingLevel: "high",
	},
	{
		type: "fast_mode_change",
		id: "entry-fast-mode",
		parentId: "entry-thinking",
		timestamp: "2026-04-26T00:00:04.000Z",
		fastMode: true,
	},
	{
		type: "compaction",
		id: "entry-compaction",
		parentId: "entry-fast-mode",
		timestamp: "2026-04-26T00:00:05.000Z",
		summary: "summary",
		firstKeptEntryId: "entry-message",
		tokensBefore: 123,
		details: { source: "test" },
		fromHook: true,
	},
	{
		type: "label",
		id: "entry-label",
		parentId: "entry-compaction",
		timestamp: "2026-04-26T00:00:06.000Z",
		targetId: "entry-message",
		label: "bookmark",
	},
	{
		type: "custom",
		id: "entry-custom",
		parentId: "entry-label",
		timestamp: "2026-04-26T00:00:07.000Z",
		customType: "example",
		data: { nested: ["value"] },
	},
];

function jsonlFor(sessionHeader = header, sessionEntries = entries): string {
	return [sessionHeader, ...sessionEntries].map((entry) => JSON.stringify(entry)).join("\n");
}

describe("session JSONL codec", () => {
	test("parses valid sessions with header and entries", () => {
		const parsed = parseSessionJsonl(jsonlFor());

		expect(parsed.header).toEqual(header);
		expect(parsed.entries).toEqual(entries);
	});

	test("rejects empty content", () => {
		expect(() => parseSessionJsonl("")).toThrow(SessionJsonlParseError);
		expect(() => parseSessionJsonl("\n\n")).toThrow("missing a session header");
	});

	test("rejects content missing the session header", () => {
		expect(() => parseSessionJsonl(JSON.stringify(entries[0]))).toThrow("missing a session header");
	});

	test("rejects malformed lines", () => {
		expect(() => parseSessionJsonl(`${JSON.stringify(header)}\n{not-json}`)).toThrow(
			"Malformed session JSONL line 2",
		);
	});

	test("preserves message, model, thinking, fast-mode, compaction, label, and custom entries", () => {
		const parsed = parseSessionJsonl(jsonlFor());

		expect(parsed.entries.map((entry) => entry.type)).toEqual([
			"message",
			"model_change",
			"thinking_level_change",
			"fast_mode_change",
			"compaction",
			"label",
			"custom",
		]);
		expect(parsed.entries).toEqual(entries);
	});

	test("serializes header and entries as JSONL", () => {
		const serialized = serializeSessionJsonl({ header, entries });

		expect(serialized).toBe(`${jsonlFor()}\n`);
	});

	test("is stable when parsing after serializing", () => {
		const serialized = serializeSessionJsonl({ header, entries });
		const parsed = parseSessionJsonl(serialized);

		expect(parsed).toEqual({ header, entries });
		expect(serializeSessionJsonl(parsed)).toBe(serialized);
	});

	test("asserts parse-after-serialize round-trip stability", () => {
		expect(assertRoundTripStable(jsonlFor())).toEqual({ header, entries });
	});
});
