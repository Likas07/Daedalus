import { expect, test } from "bun:test";
import type { ClientRequest, ShellEvent, ShellSnapshot, ThreadDetailEvent, ThreadDetailSnapshot } from "@daedalus-pi/app-server-protocol";
import { AppServerClient } from "./client";
import { createInProcessTransport } from "./in-process-transport";
import { subscribeShell, subscribeThread } from "./projections";

const cursor = (seq: number) => ({ seq, updatedAt: `2026-04-30T00:00:0${seq}.000Z` });
const shellSnapshot = (seq: number): ShellSnapshot => ({ cursor: cursor(seq), threads: [] });
const threadSnapshot = (seq: number, threadId = "thread-1"): ThreadDetailSnapshot => ({
	cursor: cursor(seq),
	threadId,
	sessionId: "session-1",
	title: "Thread",
	status: "running",
	messages: [],
	activity: [],
	pendingActions: [],
	safetySignals: [],
	diffIds: [],
});
const shellEvent = (seq: number): ShellEvent => ({ seq, cursor: cursor(seq), type: "snapshot-invalidated" });
const threadEvent = (seq: number, threadId = "thread-1"): ThreadDetailEvent => ({
	seq,
	cursor: cursor(seq),
	threadId,
	sessionId: "session-1",
	type: "snapshot-invalidated",
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("subscribeShell emits snapshot before buffered events and suppresses stale duplicates", async () => {
	let sendToClient: ((message: unknown) => void) | undefined;
	let resolveSnapshot: (() => void) | undefined;
	const releaseSnapshot = new Promise<void>((resolve) => (resolveSnapshot = resolve));
	const client = new AppServerClient({
		transport: createInProcessTransport(async (message, send) => {
			sendToClient = send;
			const request = message as ClientRequest;
			if (request.method === "shell/snapshot") {
				send({ kind: "notification", method: "shell/event", params: shellEvent(2) });
				send({ kind: "notification", method: "shell/event", params: shellEvent(2) });
				send({ kind: "notification", method: "shell/event", params: shellEvent(1) });
				await releaseSnapshot;
				send({ kind: "response", id: request.id, ok: true, result: { snapshot: shellSnapshot(1) } });
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	const delivered: string[] = [];
	subscribeShell(client, {}, {
		onSnapshot: (snapshot) => delivered.push(`snapshot:${snapshot.cursor.seq}`),
		onEvent: (event) => delivered.push(`event:${event.seq}`),
	});
	await Promise.resolve();
	expect(delivered).toEqual([]);
	resolveSnapshot?.();
	await flush();
	sendToClient?.({ kind: "notification", method: "shell/event", params: shellEvent(2) });
	sendToClient?.({ kind: "notification", method: "shell/event", params: shellEvent(3) });
	expect(delivered).toEqual(["snapshot:1", "event:2", "event:3"]);
	await client.close();
});

test("subscribeThread suppresses wrong-thread, duplicate, and stale events", async () => {
	let resolveSnapshot: (() => void) | undefined;
	const releaseSnapshot = new Promise<void>((resolve) => (resolveSnapshot = resolve));
	let sendToClient: ((message: unknown) => void) | undefined;
	const client = new AppServerClient({
		transport: createInProcessTransport(async (message, send) => {
			sendToClient = send;
			const request = message as ClientRequest;
			if (request.method === "thread/snapshot") {
				send({ kind: "notification", method: "thread/event", params: threadEvent(2, "other-thread") });
				send({ kind: "notification", method: "thread/event", params: threadEvent(2) });
				send({ kind: "notification", method: "thread/event", params: threadEvent(2) });
				await releaseSnapshot;
				send({ kind: "response", id: request.id, ok: true, result: { snapshot: threadSnapshot(1) } });
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	const delivered: string[] = [];
	subscribeThread(client, { threadId: "thread-1" }, {
		onSnapshot: (snapshot) => delivered.push(`snapshot:${snapshot.cursor.seq}`),
		onEvent: (event) => delivered.push(`${event.threadId}:${event.seq}`),
	});
	await Promise.resolve();
	resolveSnapshot?.();
	await flush();
	sendToClient?.({ kind: "notification", method: "thread/event", params: threadEvent(2) });
	sendToClient?.({ kind: "notification", method: "thread/event", params: threadEvent(3, "other-thread") });
	sendToClient?.({ kind: "notification", method: "thread/event", params: threadEvent(3) });
	expect(delivered).toEqual(["snapshot:1", "thread-1:2", "thread-1:3"]);
	await client.close();
});

test("subscription unsubscribe cleans up listeners and buffered events", async () => {
	let sendToClient: ((message: unknown) => void) | undefined;
	let resolveSnapshot: (() => void) | undefined;
	const releaseSnapshot = new Promise<void>((resolve) => (resolveSnapshot = resolve));
	const client = new AppServerClient({
		transport: createInProcessTransport(async (message, send) => {
			sendToClient = send;
			const request = message as ClientRequest;
			if (request.method === "shell/snapshot") {
				send({ kind: "notification", method: "shell/event", params: shellEvent(2) });
				await releaseSnapshot;
				send({ kind: "response", id: request.id, ok: true, result: { snapshot: shellSnapshot(1) } });
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	const delivered: string[] = [];
	const subscription = subscribeShell(client, {}, {
		onSnapshot: (snapshot) => delivered.push(`snapshot:${snapshot.cursor.seq}`),
		onEvent: (event) => delivered.push(`event:${event.seq}`),
	});
	await Promise.resolve();
	subscription.unsubscribe();
	resolveSnapshot?.();
	await flush();
	sendToClient?.({ kind: "notification", method: "shell/event", params: shellEvent(3) });
	expect(delivered).toEqual([]);
	await client.close();
});
