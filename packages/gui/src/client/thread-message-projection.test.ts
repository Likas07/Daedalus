import { describe, expect, test } from "bun:test";
import type { ThreadActivity, ThreadMessage } from "@daedalus-pi/app-server-protocol";
import { projectThreadMessages } from "./thread-message-projection";

const now = "2026-04-30T00:00:00.000Z";
const message = (id: string, role: ThreadMessage["role"], content: string): ThreadMessage => ({ id, role, content, createdAt: now });
const tool = (id: string, title: string): ThreadActivity => ({ id, kind: "tool", status: "completed", title, startedAt: now });

describe("projectThreadMessages", () => {
	test("projects user bubbles and live assistant text growth from latest update", () => {
		const rows = projectThreadMessages({
			status: "running",
			messages: [message("u1", "user", "hello"), message("a1", "assistant", "hel"), message("a1", "assistant", "hello")],
		});
		expect(rows.filter((row) => row.kind === "message")).toHaveLength(2);
		expect(rows[1]).toMatchObject({ kind: "message", streaming: true, message: { content: "hello" } });
	});

	test("compacts adjacent tool activity groups and appends pending actions", () => {
		const rows = projectThreadMessages({
			status: "waiting",
			messages: [message("u1", "user", "ship it")],
			activity: [tool("t1", "Read"), tool("t2", "Write"), { id: "s1", kind: "system", status: "completed", title: "Done", startedAt: now }],
			pendingActions: [{ id: "p1", kind: "approval", title: "Approve", approvalId: "approval-1" }],
		});
		expect(rows.filter((row) => row.kind === "activity").map((row) => row.kind === "activity" ? row.activities.length : 0)).toEqual([2, 1]);
		expect(rows.at(-1)).toMatchObject({ kind: "pending-action", action: { title: "Approve" } });
	});

	test("adds working indicator when running without assistant streaming row", () => {
		const rows = projectThreadMessages({ status: "running", messages: [message("u1", "user", "go")] });
		expect(rows.at(-1)).toMatchObject({ kind: "working" });
	});
});
