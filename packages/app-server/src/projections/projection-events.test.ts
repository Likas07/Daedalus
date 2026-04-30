import { expect, test } from "bun:test";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { projectAppEventToProjectionEvents } from "./projection-events";

const base = (type: string, payload: Record<string, unknown> = {}, sessionId = "s1"): AppEvent => ({
	id: `${type}:1`,
	type,
	ts: "2026-04-30T00:00:00.000Z",
	sessionId,
	payload,
});

test("agent message updates emit detail-only streaming events", () => {
	const projected = projectAppEventToProjectionEvents({
		event: base("agent/message_update", { messageId: "m1", delta: "hello" }),
		seq: 7,
	});

	expect(projected.shell).toEqual([]);
	expect(projected.thread).toHaveLength(1);
	expect(projected.thread[0]).toMatchObject({
		seq: 7,
		threadId: "s1",
		sessionId: "s1",
		type: "activity-updated",
		activity: { id: "m1", kind: "thinking", status: "running", detail: "hello" },
	});
});

test("agent message end uses real streaming event name and appends detail message", () => {
	const projected = projectAppEventToProjectionEvents({
		event: base("agent/message_end", { messageId: "m1", turnId: "t1", role: "assistant", content: "Done" }),
		seq: 8,
	});

	expect(projected.shell).toEqual([]);
	expect(projected.thread[0]).toMatchObject({
		seq: 8,
		type: "message-appended",
		message: { id: "m1", turnId: "t1", role: "assistant", content: "Done" },
	});
});

test("approvals update shell and detail projections", () => {
	const projected = projectAppEventToProjectionEvents({
		event: base("approval/requested", {
			approvalId: "a1",
			request: { summary: "Run tests", secret: "redacted from shell" },
		}),
		seq: 9,
	});

	expect(projected.shell).toEqual([expect.objectContaining({ seq: 9, type: "snapshot-invalidated", threadId: "s1" })]);
	expect(projected.thread.map((event) => event.type)).toEqual(["pending-actions-updated", "activity-updated"]);
	expect(projected.thread[1]).toMatchObject({
		activity: { id: "a1", kind: "approval", status: "running", title: "Run tests" },
	});
	expect(JSON.stringify(projected.shell)).not.toContain("secret");
});

test("target and diagnostic changes update shell safety signals", () => {
	const target = projectAppEventToProjectionEvents({
		event: base("workflow/target/needs-attention", { reason: "missing worktree" }),
		seq: 10,
	});
	const diagnostic = projectAppEventToProjectionEvents({
		event: base("diagnostic/changed", { diagnostic: "identity mismatch" }),
		seq: 11,
	});

	expect(target.shell[0]).toMatchObject({ type: "snapshot-invalidated", threadId: "s1" });
	expect(target.thread[0]).toMatchObject({
		type: "safety-signal",
		safetySignal: { code: "target-validation", message: "missing worktree" },
	});
	expect(diagnostic.shell[0]).toMatchObject({ type: "snapshot-invalidated", threadId: "s1" });
	expect(diagnostic.thread[0]).toMatchObject({
		type: "safety-signal",
		safetySignal: { code: "diagnostic", message: "identity mismatch" },
	});
});
