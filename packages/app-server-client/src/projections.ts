import type {
	ShellEvent,
	ShellSnapshot,
	ShellSnapshotParams,
	ThreadDetailEvent,
	ThreadDetailSnapshot,
	ThreadSnapshotParams,
} from "@daedalus-pi/app-server-protocol";
import type { AppServerClient, RequestResultMap } from "./client";
import type { Subscription } from "./subscriptions";

export interface ShellSubscriptionHandlers {
	onSnapshot(snapshot: ShellSnapshot): void;
	onEvent?(event: ShellEvent): void;
}

export interface ThreadSubscriptionHandlers {
	onSnapshot(snapshot: ThreadDetailSnapshot): void;
	onEvent?(event: ThreadDetailEvent): void;
}

export function readShellSnapshot(
	client: AppServerClient,
	params: ShellSnapshotParams = {},
): Promise<RequestResultMap["shell/snapshot"]> {
	return client.request("shell/snapshot", params);
}

export function readThreadSnapshot(
	client: AppServerClient,
	params: ThreadSnapshotParams,
): Promise<RequestResultMap["thread/snapshot"]> {
	return client.request("thread/snapshot", params);
}

export function subscribeShell(
	client: AppServerClient,
	params: ShellSnapshotParams,
	handlers: ShellSubscriptionHandlers,
): Subscription {
	let active = true;
	let replaying = false;
	let lastSeq = params.cursor?.seq ?? 0;
	const buffered: ShellEvent[] = [];

	const deliver = (event: ShellEvent) => {
		if (!active || event.seq <= lastSeq) return;
		lastSeq = event.seq;
		handlers.onEvent?.(event);
	};

	const unsubscribe = client.onNotification("shell/event", (event) => {
		if (!active || event.seq <= lastSeq) return;
		if (replaying) deliver(event);
		else buffered.push(event);
	});

	void readShellSnapshot(client, params).then(({ snapshot }) => {
		if (!active) return;
		lastSeq = Math.max(lastSeq, snapshot.cursor.seq);
		handlers.onSnapshot(snapshot);
		replaying = true;
		for (const event of buffered) deliver(event);
		buffered.length = 0;
	});

	return {
		unsubscribe() {
			if (!active) return;
			active = false;
			buffered.length = 0;
			unsubscribe();
		},
	};
}

export function subscribeThread(
	client: AppServerClient,
	params: ThreadSnapshotParams,
	handlers: ThreadSubscriptionHandlers,
): Subscription {
	let active = true;
	let replaying = false;
	let lastSeq = params.cursor?.seq ?? 0;
	const buffered: ThreadDetailEvent[] = [];

	const matches = (event: ThreadDetailEvent) => event.threadId === params.threadId;
	const deliver = (event: ThreadDetailEvent) => {
		if (!active || !matches(event) || event.seq <= lastSeq) return;
		lastSeq = event.seq;
		handlers.onEvent?.(event);
	};

	const unsubscribe = client.onNotification("thread/event", (event) => {
		if (!active || !matches(event) || event.seq <= lastSeq) return;
		if (replaying) deliver(event);
		else buffered.push(event);
	});

	void readThreadSnapshot(client, params).then(({ snapshot }) => {
		if (!active) return;
		lastSeq = Math.max(lastSeq, snapshot.cursor.seq);
		handlers.onSnapshot(snapshot);
		replaying = true;
		for (const event of buffered) deliver(event);
		buffered.length = 0;
	});

	return {
		unsubscribe() {
			if (!active) return;
			active = false;
			buffered.length = 0;
			unsubscribe();
		},
	};
}
