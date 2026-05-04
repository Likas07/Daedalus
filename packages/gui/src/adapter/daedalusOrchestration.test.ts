import { describe, expect, test, vi } from "vitest";
import { createOrchestrationApi } from "./daedalusOrchestration";

const now = "2026-05-04T00:00:00.000Z";

function createClient() {
	const listeners = new Map<string, Set<(event: any) => void>>();
	const request = vi.fn(async (method: string, params: any) => {
		if (method === "project/list")
			return { projects: [{ id: "p1", name: "Demo", path: "/repo", createdAt: now, updatedAt: now }] };
		if (method === "shell/snapshot")
			return { snapshot: { cursor: { seq: 1, updatedAt: now }, threads: [], selectedThreadId: undefined } };
		if (method === "thread/snapshot") {
			return {
				snapshot: {
					cursor: { seq: 2, updatedAt: now },
					threadId: params.threadId,
					sessionId: "s1",
					projectId: "p1",
					title: "Existing",
					status: "running",
					messages: [{ id: "m1", role: "user", content: "hello", createdAt: now }],
					activity: [],
					pendingActions: [],
					safetySignals: [],
					diffIds: [],
				},
			};
		}
		if (method === "event/replay") return { events: [], cursor: { seq: 2, updatedAt: now } };
		throw new Error(`unexpected method ${method}`);
	});
	return {
		request,
		onNotification: vi.fn((method: string, listener: (event: any) => void) => {
			const set = listeners.get(method) ?? new Set();
			set.add(listener);
			listeners.set(method, set);
			return () => set.delete(listener);
		}),
		emit(method: string, event: any) {
			for (const listener of listeners.get(method) ?? []) listener(event);
		},
	};
}

describe("daedalus orchestration adapter", () => {
	test("subscribes to read-only shell snapshot and events", async () => {
		const client = createClient();
		const api = createOrchestrationApi(client as never);
		const seen: any[] = [];
		const unsubscribe = api.subscribeShell((item) => seen.push(item));
		await vi.waitFor(() => expect(seen).toHaveLength(1));
		expect(client.request).toHaveBeenCalledWith("project/list", {});
		expect(client.request).toHaveBeenCalledWith("shell/snapshot", {});
		expect(seen[0]).toMatchObject({ kind: "snapshot", snapshot: { projects: [{ id: "p1" }] } });

		client.emit("shell/event", {
			seq: 2,
			cursor: { seq: 2, updatedAt: now },
			type: "thread-upserted",
			thread: {
				threadId: "t1",
				sessionId: "s1",
				projectId: "p1",
				title: "Existing",
				status: "completed",
				updatedAt: now,
				pendingActionCount: 0,
				safetySignals: [],
			},
		});
		expect(seen[1]).toMatchObject({ kind: "thread-upserted", thread: { id: "t1" } });
		unsubscribe();
	});

	test("subscribes to read-only thread snapshot and thread events", async () => {
		const client = createClient();
		const api = createOrchestrationApi(client as never);
		const seen: any[] = [];
		const unsubscribe = api.subscribeThread({ threadId: "t1" }, (item) => seen.push(item));
		await vi.waitFor(() => expect(seen).toHaveLength(1));
		expect(client.request).toHaveBeenCalledWith("thread/snapshot", { threadId: "t1" });
		expect(client.request).toHaveBeenCalledWith("event/replay", { cursor: { after: 2 } });
		expect(seen[0].thread.messages[0].text).toBe("hello");

		client.emit("thread/event", {
			seq: 3,
			cursor: { seq: 3, updatedAt: now },
			threadId: "t1",
			sessionId: "s1",
			type: "message-appended",
			message: { id: "m2", role: "assistant", content: "hi", createdAt: now },
		});
		expect(seen[1].thread.messages.map((message: any) => message.text)).toEqual(["hello", "hi"]);

		client.emit("thread/event", {
			seq: 4,
			cursor: { seq: 4, updatedAt: now },
			threadId: "other",
			sessionId: "s2",
			type: "message-appended",
			message: { id: "m3", role: "assistant", content: "ignored", createdAt: now },
		});
		expect(seen).toHaveLength(2);
		unsubscribe();
	});
});
