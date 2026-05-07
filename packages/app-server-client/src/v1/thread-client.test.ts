import { expect, test } from "bun:test";

import { AppServerClient } from "../client";
import { createInProcessTransport } from "../in-process-transport";
import { cancelTurn, createThread, getPayloadWindow, getThread, listThreads, replayThread, startTurn } from "./thread-client";
import { subscribeThread } from "./thread-subscriptions";

type AnyRequest = { readonly id: string | number; readonly method: string; readonly params: unknown };

test("v1 thread client helpers send Thread-only methods", async () => {
	const seen: Array<{ method: string; params: unknown }> = [];
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			const request = message as AnyRequest;
			seen.push({ method: request.method, params: request.params });
			const respond = (result: unknown) => send({ kind: "response", id: request.id, ok: true, result });
			if (request.method === "thread.create") {
				respond({
					thread: {
						threadId: "thread-1",
						projectId: "project-1",
						workspaceTargetId: "target-1",
						title: "Thread",
						status: "idle",
						updatedAt: "2026-04-30T00:00:00.000Z",
					},
				});
				return;
			}
			if (request.method === "thread.list") {
				respond({ threads: [] });
				return;
			}
			if (request.method === "thread.get") {
				respond({
					thread: {
						threadId: "thread-1",
						projectId: "project-1",
						workspaceTargetId: "target-1",
						title: "Thread",
						status: "idle",
						updatedAt: "2026-04-30T00:00:00.000Z",
					},
					turns: [],
					timeline: {
						threadId: "thread-1",
						entries: [],
						hasMoreAfter: false,
						hasMoreBefore: false,
					},
				});
				return;
			}
			if (request.method === "thread.replay") {
				respond({
					threadId: "thread-1",
					entries: [],
					nextCursor: { seq: 3 },
					hasMoreAfter: false,
					hasMoreBefore: false,
				});
				return;
			}
			if (request.method === "turn.start") {
				respond({
					turn: {
						threadId: "thread-1",
						turnId: "turn-1",
						status: "running",
						prompt: "Hello",
						createdAt: "2026-04-30T00:00:00.000Z",
						updatedAt: "2026-04-30T00:00:00.000Z",
					},
				});
				return;
			}
			if (request.method === "turn.cancel") {
				respond({
					turn: {
						threadId: "thread-1",
						turnId: "turn-1",
						status: "cancelled",
						createdAt: "2026-04-30T00:00:00.000Z",
						updatedAt: "2026-04-30T00:00:00.000Z",
					},
				});
				return;
			}
			if (request.method === "payload.window") {
				respond({
					threadId: "thread-1",
					toolCallId: "tool-1",
					chunks: [],
					hasMoreAfter: false,
					hasMoreBefore: false,
				});
				return;
			}
			respond({});
		}),
	});
	await expect(
		createThread(client, { projectId: "project-1", workspaceTargetId: "target-1", title: "Thread" }),
	).resolves.toMatchObject({ thread: { threadId: "thread-1" } });
	await expect(listThreads(client, { projectId: "project-1" })).resolves.toMatchObject({ threads: [] });
	await expect(getThread(client, { threadId: "thread-1" })).resolves.toMatchObject({
		thread: { threadId: "thread-1" },
	});
	await expect(replayThread(client, { threadId: "thread-1", limit: 10 })).resolves.toMatchObject({
		nextCursor: { seq: 3 },
	});
	await expect(startTurn(client, { threadId: "thread-1", prompt: "Hello" })).resolves.toMatchObject({
		turn: { turnId: "turn-1" },
	});
	await expect(cancelTurn(client, { threadId: "thread-1", turnId: "turn-1" })).resolves.toMatchObject({
		turn: { status: "cancelled" },
	});
	await expect(
		getPayloadWindow(client, { threadId: "thread-1", toolCallId: "tool-1", limit: 10 }),
	).resolves.toMatchObject({
		toolCallId: "tool-1",
	});
	expect(seen.map((request) => request.method)).toEqual([
		"thread.create",
		"thread.list",
		"thread.get",
		"thread.replay",
		"turn.start",
		"turn.cancel",
		"payload.window",
	]);
	expect(JSON.stringify(seen)).not.toContain("sessionId");
	await client.close();
});

test("subscribeThread replays first and ignores stale or wrong-thread live events", async () => {
	let sendToClient: ((message: unknown) => void) | undefined;
	const replayed: number[] = [];
	const live: string[] = [];
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			sendToClient = send;
			const request = message as AnyRequest;
			if (request.method === "thread.replay") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						threadId: "thread-1",
						entries: [],
						nextCursor: { seq: 5 },
						hasMoreAfter: false,
						hasMoreBefore: false,
					},
				});
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});
	const subscription = subscribeThread({
		client,
		threadId: "thread-1",
		onReplay: (window) => replayed.push(window.nextCursor?.seq ?? 0),
		onEntry: (entry) => live.push(entry.entryId),
	});
	await subscription.ready;
	sendToClient?.({
		kind: "notification",
		method: "thread.timeline",
		params: {
			threadId: "thread-1",
			nextCursor: { seq: 5 },
			entry: {
				entryId: "stale",
				threadId: "thread-1",
				sequence: 5,
				createdAt: "2026-04-30T00:00:00.000Z",
				kind: "activity",
				status: "running",
				title: "stale",
			},
		},
	});
	sendToClient?.({
		kind: "notification",
		method: "thread.timeline",
		params: {
			threadId: "other-thread",
			nextCursor: { seq: 6 },
			entry: {
				entryId: "wrong-thread",
				threadId: "other-thread",
				sequence: 6,
				createdAt: "2026-04-30T00:00:00.000Z",
				kind: "activity",
				status: "running",
				title: "wrong",
			},
		},
	});
	sendToClient?.({
		kind: "notification",
		method: "thread.timeline",
		params: {
			threadId: "thread-1",
			nextCursor: { seq: 6 },
			entry: {
				entryId: "live",
				threadId: "thread-1",
				sequence: 6,
				createdAt: "2026-04-30T00:00:00.000Z",
				kind: "activity",
				status: "running",
				title: "live",
			},
		},
	});
	expect(replayed).toEqual([5]);
	expect(live).toEqual(["live"]);
	subscription.unsubscribe();
	await client.close();
});
