import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import type { StoredEvent } from "../persistence/event-store";
import { projectStoredEventToTimelineEntry } from "../projections/thread-v1-projection";
import { getPayloadWindowV1 } from "./v1/payload-routes";
import {
	createDefaultV1Router,
	handleV1Request,
	type ThreadV1CancelTurnResult,
	type ThreadV1GetResult,
	type ThreadV1PayloadWindowResult,
	type ThreadV1ReplayResult,
	type ThreadV1StartTurnResult,
	type V1Method as ThreadV1Method,
	type V1Request as ThreadV1Request,
	type V1RouteContext as ThreadV1RouteOptions,
	type V1RouteResult as ThreadV1RouteResult,
	type V1RuntimeAuthority as ThreadV1RuntimeAuthority,
} from "./v1/router";
import { cancelTurnV1, getThreadV1, startTurnV1 } from "./v1/thread-routes";

export type {
	ThreadV1CancelTurnResult,
	ThreadV1GetResult,
	ThreadV1Method,
	ThreadV1PayloadWindowResult,
	ThreadV1ReplayResult,
	ThreadV1Request,
	ThreadV1RouteOptions,
	ThreadV1RouteResult,
	ThreadV1RuntimeAuthority,
	ThreadV1StartTurnResult,
};

export { cancelTurnV1, getPayloadWindowV1, getThreadV1, startTurnV1 };

export async function handleThreadV1Request(
	options: ThreadV1RouteOptions,
	request: unknown,
): Promise<ThreadV1RouteResult> {
	return handleV1Request(options, request, createDefaultV1Router());
}

export function notificationForThreadV1StoredEvent(event: StoredEvent):
	| {
			readonly kind: "notification";
			readonly method: "thread.timeline";
			readonly params: protocolV1.TimelineEntryNotification;
	  }
	| {
			readonly kind: "notification";
			readonly method: "thread.timeline.delta";
			readonly params: protocolV1.TimelineDeltaNotification;
	  }
	| undefined {
	const delta = projectStoredEventToTimelineDelta(event);
	if (delta) return { kind: "notification", method: "thread.timeline.delta", params: delta };
	const entry = projectStoredEventToTimelineEntry(event);
	if (!entry) return undefined;
	return {
		kind: "notification",
		method: "thread.timeline",
		params: { threadId: entry.threadId, entry, nextCursor: { seq: entry.sequence } },
	};
}

function projectStoredEventToTimelineDelta(event: StoredEvent): protocolV1.TimelineDeltaNotification | undefined {
	const payload = storedEventPayload(event);
	const threadId = text(payload, "sessionId", "session_id") ?? event.streamId;
	const turnId = text(payload, "turnId", "turn_id");
	if (!threadId || threadId === "app" || !turnId) return undefined;
	if (event.type === "agent/message_delta" || event.type === "agent/message_update") {
		const message = asRecord(payload.message);
		const assistantMessageEvent = asRecord(payload.assistantMessageEvent);
		const delta = text(payload, "delta") ?? text(assistantMessageEvent, "delta");
		if (delta === undefined) return undefined;
		const partial = asRecord(assistantMessageEvent.partial);
		const messageId =
			text(payload, "messageId", "message_id") ??
			text(message, "id", "messageId", "message_id", "responseId") ??
			text(partial, "id", "messageId", "message_id", "responseId") ??
			text(payload, "id") ??
			turnId;
		return {
			threadId,
			turnId,
			entryId: `message:${messageId}`,
			sequence: event.seq,
			kind: "assistant-message",
			delta,
		};
	}
	if (event.type === "agent/tool_delta" || event.type === "agent/tool_execution_update") {
		const toolCallId = text(payload, "toolCallId", "tool_call_id", "id") ?? turnId;
		const delta = text(payload, "delta", "content", "text", "summary");
		if (delta === undefined) return undefined;
		return {
			threadId,
			turnId,
			entryId: `tool:${toolCallId}`,
			sequence: event.seq,
			kind: "tool-output",
			delta,
		};
	}
	return undefined;
}

function storedEventPayload(event: StoredEvent): Record<string, unknown> {
	const envelope = asRecord(event.payload);
	const nestedPayload = asRecord(envelope.payload);
	if (Object.keys(nestedPayload).length === 0) return envelope;
	return { ...envelope, ...nestedPayload };
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(payload: Readonly<Record<string, unknown>>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
	}
	return undefined;
}
