import { describe, expect, mock, test } from "bun:test";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

mock.module("react", () => ({
	default: {
		useEffect: () => undefined,
		useRef: () => ({ current: undefined }),
		useState: <T,>(initial: T | (() => T)) => [
			typeof initial === "function" ? (initial as () => T)() : initial,
			() => undefined,
		],
	},
}));

const thread: protocolV1.Thread = {
	threadId: "thread-1",
	projectId: "project-1",
	workspaceTargetId: "target-1",
	title: "Smoke thread",
	status: "idle",
	createdAt: "2026-04-30T00:00:00.000Z",
	updatedAt: "2026-04-30T00:00:00.000Z",
};

const replayEntry: protocolV1.TimelineEntry = {
	entryId: "entry-1",
	threadId: "thread-1",
	sequence: 1,
	createdAt: "2026-04-30T00:00:01.000Z",
	kind: "user-message",
	role: "user",
	content: "hello",
};

function windowWith(entries: readonly protocolV1.TimelineEntry[]): protocolV1.TimelineWindowResult {
	return {
		threadId: "thread-1",
		entries: [...entries],
		nextCursor: entries.at(-1) ? { seq: entries.at(-1)!.sequence } : undefined,
		previousCursor: entries.at(0) ? { seq: entries.at(0)!.sequence } : undefined,
		hasMoreAfter: false,
		hasMoreBefore: false,
	};
}

class FakeThreadClient {
	readonly requests: Array<{ method: string; params: unknown }> = [];
	private readonly listeners = new Set<(params: unknown, message: unknown) => void>();
	failReplay = false;

	async request(method: string, params: unknown): Promise<unknown> {
		this.requests.push({ method, params });
		if (method === "thread.get") return { thread, turns: [], timeline: windowWith([replayEntry]) };
		if (method === "thread.replay") {
			if (this.failReplay) throw new Error("replay failed");
			return windowWith([]);
		}
		if (method === "turn.start") {
			return {
				turn: {
					turnId: "turn-2",
					threadId: "thread-1",
					status: "running",
					prompt: (params as { prompt: string }).prompt,
					createdAt: "2026-04-30T00:00:02.000Z",
					updatedAt: "2026-04-30T00:00:02.000Z",
				},
			};
		}
		if (method === "turn.cancel") {
			return {
				turn: {
					turnId: (params as { turnId: string }).turnId,
					threadId: "thread-1",
					status: "cancelled",
					createdAt: "2026-04-30T00:00:02.000Z",
					updatedAt: "2026-04-30T00:00:03.000Z",
					completedAt: "2026-04-30T00:00:03.000Z",
				},
			};
		}
		throw new Error(`Unexpected method ${method}`);
	}

	onNotification(method: string, listener: (params: unknown, message: unknown) => void): () => void {
		expect(method).toBe("thread.timeline");
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(entry: protocolV1.TimelineEntry): void {
		const notification: protocolV1.TimelineEntryNotification = {
			threadId: entry.threadId,
			entry,
			nextCursor: { seq: entry.sequence },
		};
		for (const listener of this.listeners)
			listener(notification, { kind: "notification", method: "thread.timeline" });
	}
}

describe("React thread loop controller", () => {
	test("loads replayed entries, applies streaming updates, submits and cancels a turn", async () => {
		const { createThreadLoopController } = await import("./useThreadLoop");
		const client = new FakeThreadClient();
		const controller = createThreadLoopController({ client, threadId: "thread-1" });
		await controller.load();

		expect(controller.viewModel.timeline.map((entry) => entry.body)).toContain("hello");
		expect(controller.viewModel.isLive).toBe(true);

		client.emit({
			entryId: "entry-2",
			threadId: "thread-1",
			sequence: 2,
			createdAt: "2026-04-30T00:00:02.000Z",
			kind: "assistant-message",
			role: "assistant",
			content: "streamed reply",
		});
		expect(controller.viewModel.timeline.map((entry) => entry.body)).toContain("streamed reply");

		await controller.submitTurn("continue");
		expect(client.requests).toContainEqual({
			method: "turn.start",
			params: { threadId: "thread-1", prompt: "continue" },
		});
		expect(controller.activeTurnId).toBe("turn-2");

		await controller.cancelActiveTurn();
		expect(client.requests).toContainEqual({
			method: "turn.cancel",
			params: { threadId: "thread-1", turnId: "turn-2" },
		});
		expect(controller.activeTurnId).toBeUndefined();
		controller.dispose();
	});

	test("reports replay errors and can reconnect", async () => {
		const { createThreadLoopController } = await import("./useThreadLoop");
		const client = new FakeThreadClient();
		client.failReplay = true;
		const controller = createThreadLoopController({ client, threadId: "thread-1" });
		await controller.load();
		expect(controller.viewModel.error).toBe("replay failed");

		client.failReplay = false;
		await controller.reconnect();
		expect(controller.viewModel.error).toBeUndefined();
		expect(controller.viewModel.isLive).toBe(true);
		controller.dispose();
	});
});
