import type { AppEvent, ProjectionCursor, ShellEvent, ThreadDetailEvent, ThreadMessage } from "@daedalus-pi/app-server-protocol";

export interface ProjectionEvents {
	readonly shell: readonly ShellEvent[];
	readonly thread: readonly ThreadDetailEvent[];
}

export interface ProjectAppEventOptions {
	readonly event: AppEvent;
	readonly seq: number;
}

export function projectAppEventToProjectionEvents(options: ProjectAppEventOptions): ProjectionEvents {
	const { event, seq } = options;
	const cursor = { seq, updatedAt: event.ts } satisfies ProjectionCursor;
	const sessionId = event.sessionId ?? text(payloadRecord(event.payload), "sessionId", "session_id");
	const threadId = sessionId;
	const shell: ShellEvent[] = [];
	const thread: ThreadDetailEvent[] = [];

	const invalidateShell = () => shell.push({ seq, cursor, type: "snapshot-invalidated", threadId });
	const invalidateThread = () => {
		if (threadId && sessionId) thread.push({ seq, cursor, type: "snapshot-invalidated", threadId, sessionId });
	};
	const safetySignal = () => {
		if (!threadId || !sessionId) return;
		thread.push({
			seq,
			cursor,
			type: "safety-signal",
			threadId,
			sessionId,
			safetySignal: safetySignalFromEvent(event),
		});
	};

	switch (event.type) {
		case "agent/message_start":
		case "agent/message_update":
		case "agent/message_end": {
			if (!threadId || !sessionId) break;
			thread.push({
				seq,
				cursor,
				threadId,
				sessionId,
				type: event.type === "agent/message_end" ? "message-appended" : "activity-updated",
				...(event.type === "agent/message_end" ? { message: messageFromEvent(event, seq) } : { activity: messageActivityFromEvent(event) }),
			});
			break;
		}
		case "approval/requested":
		case "approval/resolved":
			invalidateShell();
			if (threadId && sessionId) {
				thread.push({ seq, cursor, type: "pending-actions-updated", threadId, sessionId });
				thread.push({
					seq,
					cursor,
					type: "activity-updated",
					threadId,
					sessionId,
					activity: approvalActivityFromEvent(event),
				});
			}
			break;
		case "session/started":
		case "turn/started":
		case "turn/completed":
			invalidateShell();
			invalidateThread();
			break;
		case "session/resume-identity-mismatched":
			invalidateShell();
			safetySignal();
			break;
		default:
			if (event.type.includes("target") || event.type.includes("diagnostic") || event.type.includes("needs-attention")) {
				invalidateShell();
				safetySignal();
			}
	}

	return { shell, thread };
}

function messageFromEvent(event: AppEvent, seq: number): ThreadMessage {
	const payload = payloadRecord(event.payload);
	return {
		id: text(payload, "messageId", "message_id", "id") ?? event.id,
		turnId: text(payload, "turnId", "turn_id"),
		role: role(text(payload, "role")),
		content: text(payload, "content", "text", "message") ?? "",
		createdAt: event.ts,
	};
}

function messageActivityFromEvent(event: AppEvent) {
	const payload = payloadRecord(event.payload);
	const status = event.type === "agent/message_start" ? "running" : "running";
	return {
		id: text(payload, "messageId", "message_id", "id") ?? event.id,
		kind: "thinking" as const,
		status: status as "running",
		title: event.type === "agent/message_start" ? "Assistant message started" : "Assistant message updated",
		detail: text(payload, "delta", "content", "text"),
		startedAt: event.ts,
	};
}

function approvalActivityFromEvent(event: AppEvent) {
	const payload = payloadRecord(event.payload);
	const request = payloadRecord(payload.request);
	const title = text(request, "summary", "action", "command") ?? text(payload, "summary") ?? "Approval required";
	const resolved = event.type === "approval/resolved";
	return {
		id: text(payload, "approvalId", "approval_id", "id") ?? event.id,
		kind: "approval" as const,
		status: resolved ? (text(payload, "decision") === "denied" ? "cancelled" as const : "completed" as const) : "running" as const,
		title,
		detail: typeof payload.request === "string" ? payload.request : undefined,
		startedAt: event.ts,
		...(resolved ? { completedAt: event.ts } : {}),
	};
}

function safetySignalFromEvent(event: AppEvent) {
	const payload = payloadRecord(event.payload);
	const message = text(payload, "reason", "message", "diagnostic", "needsAttentionReason") ?? "Target state changed";
	return { level: "warning" as const, message, code: event.type.includes("diagnostic") ? "diagnostic" : "target-validation" };
}

function payloadRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(record: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function role(value: string | undefined): ThreadMessage["role"] {
	return value === "user" || value === "system" || value === "tool" ? value : "assistant";
}
