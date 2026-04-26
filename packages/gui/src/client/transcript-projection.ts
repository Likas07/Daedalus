import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { projectSessionEntries, type SessionEntryLike, type TimelineRow, type TimelineRowKind } from "./session-entry-projection";

export type TranscriptKind = TimelineRowKind | "diff" | "terminal" | "subagent" | "error";
export type TranscriptRow = Omit<TimelineRow, "kind"> & { readonly kind: TranscriptKind; readonly containsSensitiveRaw?: boolean };

export function projectTranscriptEvents(events: readonly AppEvent[]): TranscriptRow[] {
	const rows = new Map<string, TranscriptRow>();
	for (const event of events) {
		for (const row of projectTranscriptEvent(event)) rows.set(row.id, row);
	}
	return [...rows.values()];
}

export function projectTranscriptEvent(event: AppEvent): TranscriptRow[] {
	const entries = entriesFromEvent(event);
	if (entries.length > 0) return projectSessionEntries(entries, event.sessionId).map((row) => ({ ...row, eventId: event.id, containsSensitiveRaw: rawLooksSensitive(row.raw) }));
	const payload = record(event.payload);
	const streamId = stringField(payload.messageId) || stringField(payload.responseId) || stringField(payload.id);
	const id = streamId && isAssistantStream(event.type) ? `stream:${event.sessionId ?? "global"}:${streamId}` : event.id;
	return [{
		id,
		kind: kindForEvent(event),
		sessionId: event.sessionId,
		title: titleForEvent(event.type),
		summary: safeSummary(event.payload),
		content: safeSummary(event.payload),
		timestamp: event.ts,
		raw: event,
		eventId: event.id,
		messageId: streamId || undefined,
		status: stringField(payload.status) || undefined,
		live: isLiveEvent(event.type),
		containsSensitiveRaw: rawLooksSensitive(event),
	}];
}

export function rawLooksSensitive(value: unknown): boolean {
	const text = JSON.stringify(value)?.toLowerCase() ?? "";
	return /secret|token|api[_-]?key|authorization|password|credential|oauth/.test(text);
}

function entriesFromEvent(event: AppEvent): SessionEntryLike[] {
	const payload = record(event.payload);
	const session = record(payload.session);
	const candidates = [payload.entry, payload.entries, payload.sessionEntries, session.entries, payload.message && { type: "message", id: stringField(payload.messageId) || event.id, timestamp: event.ts, message: payload.message }];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) return candidate.filter(isEntryLike);
		if (isEntryLike(candidate)) return [candidate];
	}
	return [];
}
function isEntryLike(value: unknown): value is SessionEntryLike { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && typeof (value as { id?: unknown }).id === "string"; }
function kindForEvent(event: AppEvent): TranscriptKind {
	const type = event.type.toLowerCase();
	const payload = record(event.payload);
	if (type.includes("debug")) return "debug";
	if (type.startsWith("approval/")) return "approval";
	if (type.startsWith("diff/")) return "diff";
	if (type.startsWith("terminal/")) return "terminal";
	if (type.includes("subagent")) return "subagent";
	if (type.includes("skill")) return "skill";
	if (type.includes("bash")) return "bash";
	if (type.includes("error") || type.includes("diagnostic")) return "error";
	if (type.includes("tool")) return "tool";
	if (payload.role === "user" || type.includes("user")) return "user";
	if (payload.role === "assistant" || type.includes("assistant") || type.includes("message_delta")) return "assistant";
	if (type.includes("model")) return "model";
	if (type.includes("thinking")) return "thinking";
	if (type.includes("fast")) return "fast-mode";
	return "system";
}
function titleForEvent(type: string): string { return type.split("/").map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " ")).join(" · "); }
function safeSummary(payload: unknown): string {
	if (typeof payload === "string") return payload;
	const value = record(payload);
	for (const candidate of [value.summary, value.message, value.delta, value.content, value.command, value.path, value.title]) if (typeof candidate === "string" && candidate.length > 0) return candidate;
	return Object.keys(value).length ? "Event recorded. Open debug to inspect raw payload." : "";
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function stringField(value: unknown): string { return typeof value === "string" ? value : ""; }
function isAssistantStream(type: string): boolean { return type.includes("message_delta") || type.includes("message_start") || type.includes("message_end"); }
function isLiveEvent(type: string): boolean { return type.includes("delta") || type.includes("output") || type.includes("start"); }
