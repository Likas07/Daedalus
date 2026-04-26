import { describe, expect, test } from "bun:test";
import { projectTranscriptEvents, rawLooksSensitive } from "./transcript-projection";

describe("transcript projection", () => {
	test("projects common app events into safe transcript rows", () => {
		const rows = projectTranscriptEvents([
			{
				id: "u1",
				ts: "2026-04-26T00:00:00.000Z",
				type: "message/user",
				sessionId: "s1",
				payload: { role: "user", content: "hello" },
			},
			{
				id: "t1",
				ts: "2026-04-26T00:00:01.000Z",
				type: "tool/call",
				sessionId: "s1",
				payload: { command: "bun test", apiKey: "SECRET" },
			},
			{
				id: "a1",
				ts: "2026-04-26T00:00:02.000Z",
				type: "approval/requested",
				sessionId: "s1",
				payload: { summary: "Approve read" },
			},
		]);
		expect(rows.map((row) => row.kind)).toEqual(["user", "tool", "approval"]);
		expect(rows[1].summary).toBe("bun test");
		expect(rows[1].containsSensitiveRaw).toBe(true);
		expect(JSON.stringify(rows.map((row) => row.summary))).not.toContain("SECRET");
	});

	test("projects session entry replay payloads", () => {
		const rows = projectTranscriptEvents([
			{
				id: "replay",
				ts: "now",
				type: "session/entries",
				sessionId: "s1",
				payload: {
					entries: [
						{
							type: "message",
							id: "m1",
							parentId: null,
							timestamp: "now",
							message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
						},
					],
				},
			},
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "entry:m1", kind: "assistant", summary: "hello" });
	});

	test("updates streaming assistant rows by message id without duplicates", () => {
		const rows = projectTranscriptEvents([
			{ id: "e1", ts: "1", type: "agent/message_delta", sessionId: "s1", payload: { messageId: "m", delta: "hel" } },
			{
				id: "e2",
				ts: "2",
				type: "agent/message_delta",
				sessionId: "s1",
				payload: { messageId: "m", delta: "hello" },
			},
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "stream:s1:m", kind: "assistant", summary: "hello" });
	});

	test("detects sensitive raw payload fields", () => {
		expect(rawLooksSensitive({ token: "abc" })).toBe(true);
		expect(rawLooksSensitive({ message: "plain" })).toBe(false);
	});
});
