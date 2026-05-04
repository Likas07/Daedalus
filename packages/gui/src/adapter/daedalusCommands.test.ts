import { describe, expect, test, vi } from "vitest";
import { createDaedalusCommandAdapter } from "./daedalusCommands";

function client() {
	return { request: vi.fn(async () => ({ ok: true })) };
}

describe("daedalus command adapter", () => {
	test("maps draft thread creation to session/start with model and draft context", async () => {
		const c = client();
		const dispatch = createDaedalusCommandAdapter(c as never);
		await dispatch({
			type: "thread.create",
			threadId: "thread-1",
			projectId: "project-1",
			title: "New thread",
			modelSelection: { provider: "codex", model: "gpt-5" },
			runtimeMode: "approval-required",
			interactionMode: "default",
			branch: null,
			worktreePath: null,
			createdAt: "2026-05-04T00:00:00.000Z",
		} as never);

		expect(c.request).toHaveBeenCalledWith(
			"session/start",
			expect.objectContaining({
				projectId: "project-1",
				model: "gpt-5",
				startTarget: expect.objectContaining({ mode: "base-checkout", projectId: "project-1" }),
				draftState: expect.objectContaining({ threadId: "thread-1", title: "New thread" }),
			}),
		);
	});

	test("maps first turn with createThread bootstrap to session/start with prompt context", async () => {
		const c = client();
		const dispatch = createDaedalusCommandAdapter(c as never);
		await dispatch({
			type: "thread.turn.start",
			threadId: "thread-1",
			message: { text: "build it", attachments: [{ id: "att-1" }, { filePath: "/repo/a.ts" }] },
			modelSelection: { provider: "codex", model: "gpt-5" },
			runtimeMode: "approval-required",
			interactionMode: "default",
			bootstrap: { createThread: { projectId: "project-1" } },
		} as never);

		expect(c.request).toHaveBeenCalledWith(
			"session/start",
			expect.objectContaining({
				projectId: "project-1",
				prompt: "build it",
				attachmentIds: ["att-1"],
				filePaths: ["/repo/a.ts"],
				model: "gpt-5",
				draftState: expect.objectContaining({ bootstrap: expect.any(Object) }),
			}),
		);
	});

	test("maps existing thread turns to turn/start", async () => {
		const c = client();
		const dispatch = createDaedalusCommandAdapter(c as never);
		await dispatch({
			type: "thread.turn.start",
			threadId: "session-1",
			message: { text: "next", attachments: [] },
		} as never);
		expect(c.request).toHaveBeenCalledWith(
			"turn/start",
			expect.objectContaining({ sessionId: "session-1", prompt: "next" }),
		);
	});

	test("maps interrupt to turn/cancel when turnId is known and runtime/abort otherwise", async () => {
		const c = client();
		const dispatch = createDaedalusCommandAdapter(c as never);
		await dispatch({ type: "thread.turn.interrupt", threadId: "session-1", turnId: "turn-1" } as never);
		await dispatch({ type: "thread.turn.interrupt", threadId: "session-2" } as never);
		expect(c.request).toHaveBeenNthCalledWith(1, "turn/cancel", { sessionId: "session-1", turnId: "turn-1" });
		expect(c.request).toHaveBeenNthCalledWith(2, "runtime/abort", { sessionId: "session-2" });
	});

	test("maps title archive and delete mutations to session routes", async () => {
		const c = client();
		const dispatch = createDaedalusCommandAdapter(c as never);
		await dispatch({ type: "thread.meta.update", threadId: "session-1", title: "Renamed" } as never);
		await dispatch({ type: "thread.archive", threadId: "session-1" } as never);
		await dispatch({ type: "thread.delete", threadId: "session-1" } as never);
		expect(c.request).toHaveBeenNthCalledWith(1, "session/rename", { sessionId: "session-1", name: "Renamed" });
		expect(c.request).toHaveBeenNthCalledWith(2, "session/archive", { sessionId: "session-1", archived: true });
		expect(c.request).toHaveBeenNthCalledWith(3, "session/delete", { sessionId: "session-1" });
	});

	test("confirms active thread delete before backend call", async () => {
		const c = client();
		const confirm = vi.fn(async () => false);
		const dispatch = createDaedalusCommandAdapter(c as never, { confirm, getActiveThreadId: () => "session-1" });
		await dispatch({ type: "thread.delete", threadId: "session-1" } as never);
		expect(confirm).toHaveBeenCalledOnce();
		expect(c.request).not.toHaveBeenCalled();
	});
});
