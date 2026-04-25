import type { AppEvent, AuditEntry, AuditQuery, AuditTrailProjection } from "@daedalus-pi/app-server-protocol";

export function projectAuditTrail(events: readonly AppEvent[], query: AuditQuery = {}): AuditTrailProjection {
	let entries = events.map(auditEntryFromEvent).filter((entry): entry is AuditEntry => entry !== undefined);
	if (query.sessionId) entries = entries.filter((entry) => entry.sessionId === query.sessionId);
	if (query.kinds?.length) entries = entries.filter((entry) => query.kinds?.includes(entry.kind));
	if (query.text)
		entries = entries.filter((entry) =>
			`${entry.title} ${entry.summary}`.toLowerCase().includes(query.text?.toLowerCase() ?? ""),
		);
	return { entries: entries.slice(-(query.limit ?? 200)), updatedAt: new Date().toISOString() };
}

export function auditEntryFromEvent(event: AppEvent): AuditEntry | undefined {
	const payload = asRecord(event.payload);
	const kind = event.type.includes("tool")
		? "tool"
		: event.type.includes("approval")
			? "approval"
			: event.type.includes("terminal")
				? "terminal"
				: event.type.includes("git") || event.type.includes("commit")
					? "git"
					: event.type.includes("diff")
						? "diff"
						: event.type.includes("diagnostic")
							? "diagnostic"
							: event.type.includes("extension")
								? "extension"
								: "transcript";
	return {
		id: event.id,
		ts: event.ts,
		kind,
		title: text(payload, "title") ?? event.type,
		summary: sanitize(text(payload, "summary") ?? text(payload, "message") ?? text(payload, "content") ?? event.type),
		sessionId: event.sessionId,
		actor: text(payload, "actor"),
		target: text(payload, "target") ?? text(payload, "path") ?? text(payload, "command"),
		destructive: Boolean(payload.destructive),
		metadata: { eventType: event.type },
	};
}
function sanitize(value: string): string {
	return value.replace(/<internal>[\s\S]*?<\/internal>/g, "[internal omitted]").slice(0, 1000);
}
function text(record: Record<string, unknown>, key: string): string | undefined {
	const v = record[key];
	return typeof v === "string" ? v : undefined;
}
function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
