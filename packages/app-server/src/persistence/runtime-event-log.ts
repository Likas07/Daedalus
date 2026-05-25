import type { AppEvent, ServerNotification } from "@daedalus-pi/app-server-protocol";
import { projectAppEventToProjectionEvents } from "../projections/projection-events";
import { notificationForThreadV1StoredEvent } from "../server/thread-v1-routes";
import type { AppServerDatabase } from "./database";
import { type AppendEventInput, appendEvent, type EventPayload, type StoredEvent } from "./event-store";
import { type ProjectionResult, projectRuntimeEvents } from "./projector";

export type RuntimeEventLogPublish = (message: AppEvent | ServerNotification) => void;

export interface RuntimeEventLogOptions {
	readonly database: AppServerDatabase;
	readonly publish?: RuntimeEventLogPublish;
}

export interface RuntimeEventLogAppendResult<TPayload extends EventPayload = EventPayload> {
	readonly event: StoredEvent<TPayload>;
	readonly projection: ProjectionResult;
}

export class RuntimeEventLog {
	constructor(private readonly options: RuntimeEventLogOptions) {}

	append<TPayload extends EventPayload>(input: AppendEventInput<TPayload>): RuntimeEventLogAppendResult<TPayload> {
		const event = appendEvent(this.options.database, input);
		const projection = projectRuntimeEvents(this.options.database);
		return { event, projection };
	}

	appendAndPublishAppEvent(event: AppEvent): StoredEvent {
		const streamId = event.sessionId ?? "app";
		const stored = this.append({
			streamId,
			type: event.type,
			payload: event as unknown as EventPayload,
		}).event;
		this.options.publish?.({
			kind: "notification",
			method: "event/appended",
			params: { event: { ...event, seq: stored.seq } },
		});
		const threadV1Notification = notificationForThreadV1StoredEvent({
			seq: stored.seq,
			streamId,
			type: event.type,
			payload: event as unknown as EventPayload,
			createdAt: event.ts ?? new Date().toISOString(),
		});
		if (threadV1Notification) this.options.publish?.(threadV1Notification as unknown as ServerNotification);
		const projectionEvents = projectAppEventToProjectionEvents({ event, seq: stored.seq });
		for (const shellEvent of projectionEvents.shell) {
			this.options.publish?.({ kind: "notification", method: "shell/event", params: shellEvent });
		}
		for (const threadEvent of projectionEvents.thread) {
			this.options.publish?.({ kind: "notification", method: "thread/event", params: threadEvent });
		}
		return stored;
	}
}
