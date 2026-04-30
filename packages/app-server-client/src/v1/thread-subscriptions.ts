import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";
import type { Subscription } from "../subscriptions";
import { replayThread, type ThreadV1RequestClient } from "./thread-client";

export type ThreadV1NotificationClient = ThreadV1RequestClient &
	(
		| Pick<AppServerClient, "onNotification">
		| {
				readonly onNotification: (
					method: string,
					listener: (params: unknown, message: unknown) => void,
				) => () => void;
		  }
	);

export interface SubscribeThreadOptions {
	readonly client: ThreadV1NotificationClient;
	readonly threadId: string;
	readonly after?: protocolV1.ReplayCursor;
	readonly limit?: number;
	readonly onReplay?: (window: protocolV1.TimelineWindowResult) => void;
	readonly onEntry?: (entry: protocolV1.TimelineEntry, notification: protocolV1.TimelineEntryNotification) => void;
	readonly onError?: (error: unknown) => void;
}

export interface ThreadSubscription extends Subscription {
	readonly ready: Promise<protocolV1.TimelineWindowResult>;
}

export function subscribeThread(options: SubscribeThreadOptions): ThreadSubscription {
	let closed = false;
	let lastCursor = options.after?.seq ?? 0;
	const unsubscribe = onThreadV1Notification(options.client, "thread.timeline", (params) => {
		const notification = asTimelineNotification(params);
		if (!notification || notification.threadId !== options.threadId) return;
		if (notification.entry.threadId !== options.threadId) return;
		const nextSeq = notification.nextCursor?.seq ?? notification.entry.sequence;
		if (nextSeq <= lastCursor) return;
		lastCursor = nextSeq;
		options.onEntry?.(notification.entry, notification);
	});
	const ready = replayThread(options.client, {
		threadId: options.threadId,
		after: options.after,
		limit: options.limit ?? 100,
	})
		.then((window) => {
			if (closed) return window;
			lastCursor = Math.max(lastCursor, window.nextCursor?.seq ?? lastCursor);
			options.onReplay?.(window);
			return window;
		})
		.catch((error) => {
			options.onError?.(error);
			throw error;
		});
	return {
		ready,
		unsubscribe: () => {
			closed = true;
			unsubscribe();
		},
	};
}

function onThreadV1Notification(
	client: ThreadV1NotificationClient,
	method: string,
	listener: (params: unknown, message: unknown) => void,
): () => void {
	return (
		client.onNotification as (method: string, listener: (params: unknown, message: unknown) => void) => () => void
	)(method, listener);
}
function asTimelineNotification(value: unknown): protocolV1.TimelineEntryNotification | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Partial<protocolV1.TimelineEntryNotification>;
	if (typeof record.threadId !== "string" || !record.entry) return undefined;
	return record as protocolV1.TimelineEntryNotification;
}
