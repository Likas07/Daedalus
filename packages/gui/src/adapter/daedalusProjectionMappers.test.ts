import { describe, expect, test } from "vitest";
import {
	applyThreadEventToT3Thread,
	mapAccessToRuntimeMode,
	mapProjectToT3Project,
	mapShellEventToT3Event,
	mapShellSnapshotItem,
	mapThreadDetailToT3Thread,
	mapThreadSummaryToT3Thread,
} from "./daedalusProjectionMappers";

const now = "2026-05-04T00:00:00.000Z";

describe("daedalus projection mappers", () => {
	test("maps project summaries to T3 project shells", () => {
		expect(
			mapProjectToT3Project({ id: "p1", name: "", path: "/tmp/demo", createdAt: now, updatedAt: now }),
		).toMatchObject({
			id: "p1",
			title: "demo",
			workspaceRoot: "/tmp/demo",
			defaultModelSelection: null,
			scripts: [],
		});
	});

	test("maps access policy to runtime mode", () => {
		expect(mapAccessToRuntimeMode("supervised")).toBe("approval-required");
		expect(mapAccessToRuntimeMode("workspace-write")).toBe("auto-accept-edits");
		expect(mapAccessToRuntimeMode("danger-full-access")).toBe("full-access");
	});

	test("maps thread shell preserving worktree metadata", () => {
		const shell = mapThreadSummaryToT3Thread({
			threadId: "t1",
			sessionId: "s1",
			projectId: "p1",
			title: "Work",
			status: "running",
			updatedAt: now,
			pendingActionCount: 1,
			safetySignals: [],
			branch: "feature/gui",
			worktreePath: "/repo/.worktrees/gui",
			accessMode: "workspace-write",
			model: "gpt-5",
			lastTurnId: "turn-1",
		});
		expect(shell).toMatchObject({
			id: "t1",
			projectId: "p1",
			runtimeMode: "auto-accept-edits",
			branch: "feature/gui",
			worktreePath: "/repo/.worktrees/gui",
			hasPendingApprovals: true,
			latestTurn: { turnId: "turn-1", state: "running" },
		});
		expect(shell.modelSelection).toEqual({ provider: "codex", model: "gpt-5" });
	});

	test("maps thread detail without leaking tool/audit detail into chat messages", () => {
		const detail = mapThreadDetailToT3Thread({
			cursor: { seq: 4, updatedAt: now },
			threadId: "t1",
			sessionId: "s1",
			projectId: "p1",
			title: "Existing",
			status: "completed",
			messages: [
				{ id: "m1", role: "user", content: "hello", createdAt: now },
				{ id: "audit-1", role: "tool", content: "raw audit payload", createdAt: now },
			],
			activity: [{ id: "a1", kind: "tool", status: "completed", title: "Ran grep", detail: "raw", startedAt: now }],
			pendingActions: [],
			safetySignals: [],
			diffIds: [],
		});
		expect(detail.messages).toHaveLength(1);
		expect(detail.messages[0]?.text).toBe("hello");
		expect(detail.activities[0]?.payload).toEqual({});
	});

	test("maps shell snapshots and events", () => {
		const item = mapShellSnapshotItem({ cursor: { seq: 2, updatedAt: now }, threads: [], selectedThreadId: "t1" }, [
			{ id: "p1", name: "Demo", path: "/repo", createdAt: now, updatedAt: now },
		]);
		expect(item.kind).toBe("snapshot");
		if (item.kind === "snapshot") expect(item.snapshot.projects[0]?.id).toBe("p1");

		expect(
			mapShellEventToT3Event({
				seq: 3,
				cursor: { seq: 3, updatedAt: now },
				type: "thread-removed",
				threadId: "t1",
			}),
		).toEqual({ kind: "thread-removed", sequence: 3, threadId: "t1" });
	});

	test("applies thread detail events incrementally", () => {
		const thread = mapThreadDetailToT3Thread({
			cursor: { seq: 1, updatedAt: now },
			threadId: "t1",
			sessionId: "s1",
			projectId: "p1",
			title: "Existing",
			status: "running",
			messages: [],
			activity: [],
			pendingActions: [],
			safetySignals: [],
			diffIds: [],
		});
		const next = applyThreadEventToT3Thread(thread, {
			seq: 2,
			cursor: { seq: 2, updatedAt: now },
			threadId: "t1",
			sessionId: "s1",
			type: "message-appended",
			message: { id: "m1", role: "assistant", content: "done", createdAt: now },
		});
		expect(next?.messages[0]?.text).toBe("done");
	});
});
