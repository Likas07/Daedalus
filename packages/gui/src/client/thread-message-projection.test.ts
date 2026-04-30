import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { ThreadActivity, ThreadMessage } from "@daedalus-pi/app-server-protocol";
import { projectThreadMessages } from "./thread-message-projection";

const now = "2026-04-30T00:00:00.000Z";
const message = (id: string, role: ThreadMessage["role"], content: string, createdAt = now): ThreadMessage => ({
	id,
	role,
	content,
	createdAt,
});
const tool = (
	id: string,
	title: string,
	startedAt = now,
	status: ThreadActivity["status"] = "completed",
): ThreadActivity => ({ id, kind: "tool", status, title, startedAt });

describe("projectThreadMessages", () => {
	test("projects user bubbles and live assistant text growth from latest update", () => {
		const rows = projectThreadMessages({
			status: "running",
			messages: [
				message("u1", "user", "hello"),
				message("a1", "assistant", "hel"),
				message("a1", "assistant", "hello"),
			],
		});
		expect(rows.filter((row) => row.kind === "message")).toHaveLength(2);
		expect(rows[1]).toMatchObject({ kind: "message", streaming: true, message: { content: "hello" } });
	});

	test("compacts adjacent tool activity groups and appends pending actions", () => {
		const rows = projectThreadMessages({
			status: "waiting",
			messages: [message("u1", "user", "ship it")],
			activity: [
				tool("t1", "Read"),
				tool("t2", "Write"),
				{ id: "s1", kind: "system", status: "completed", title: "Done", startedAt: now },
			],
			pendingActions: [{ id: "p1", kind: "approval", title: "Approve", approvalId: "approval-1" }],
		});
		expect(
			rows
				.filter((row) => row.kind === "activity")
				.map((row) => (row.kind === "activity" ? row.activities.length : 0)),
		).toEqual([2, 1]);
		expect(rows.at(-1)).toMatchObject({ kind: "pending-action", action: { title: "Approve" } });
	});

	test("orders activity groups between chat messages by time", () => {
		const rows = projectThreadMessages({
			status: "waiting",
			messages: [
				message("u1", "user", "ship it", "2026-04-30T00:00:01.000Z"),
				message("a1", "assistant", "done", "2026-04-30T00:00:04.000Z"),
			],
			activity: [tool("t1", "Read", "2026-04-30T00:00:02.000Z"), tool("t2", "Write", "2026-04-30T00:00:03.000Z")],
		});
		expect(rows.map((row) => row.kind)).toEqual(["message", "activity", "message"]);
	});

	test("adds working indicator when running without assistant streaming row", () => {
		const rows = projectThreadMessages({ status: "running", messages: [message("u1", "user", "go")] });
		expect(rows.at(-1)).toMatchObject({ kind: "working" });
	});

	test("suppresses gui-context-only and empty chat bubbles while running", () => {
		const rows = projectThreadMessages({
			status: "running",
			messages: [
				message("u1", "user", "<gui-context>internal</gui-context>"),
				message("a1", "assistant", "   "),
			],
		});
		expect(rows.filter((row) => row.kind === "message")).toHaveLength(0);
		expect(rows.at(-1)).toMatchObject({ kind: "working" });
	});

	test("strips gui-context from visible user message text", () => {
		const rows = projectThreadMessages({
			status: "waiting",
			messages: [message("u1", "user", "<gui-context>internal</gui-context> Show me status")],
		});
		expect(rows[0]).toMatchObject({ kind: "message", message: { content: "Show me status" } });
	});

	test("message components expose chat semantics without ledger affordances", async () => {
		const [timeline, bubble, activity, markdown] = await Promise.all([
			readFile(new URL("../components/messages/MessagesTimeline.svelte", import.meta.url), "utf8"),
			readFile(new URL("../components/messages/MessageBubble.svelte", import.meta.url), "utf8"),
			readFile(new URL("../components/messages/CompactActivityGroup.svelte", import.meta.url), "utf8"),
			readFile(new URL("../components/messages/AssistantMarkdown.svelte", import.meta.url), "utf8"),
		]);
		const combined = `${timeline}\n${bubble}\n${activity}`;

		expect(combined).toContain("messages-timeline");
		expect(bubble).toContain("user-row");
		expect(bubble).toContain("assistant-row");
		expect(bubble).toContain("streaming-indicator");
		expect(activity).toContain("Details hidden");
		expect(markdown).toContain("escapeHtml");
		expect(timeline).toContain("isAtBottom");
		expect(timeline).toContain("activeAssistantId");
		expect(combined).not.toMatch(/ledger|raw event|event count|numbered row|vertical rule/i);
	});
});
