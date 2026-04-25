import type { AppEvent, OrchestrationLane, OrchestrationProjection } from "@daedalus-pi/app-server-protocol";

export function projectOrchestration(events: readonly AppEvent[], now = new Date()): OrchestrationProjection {
	const lanes = new Map<string, OrchestrationLane>();
	let mode: OrchestrationProjection["mode"] = "build";
	for (const event of events) {
		const payload = asRecord(event.payload);
		if (event.type.includes("mode")) mode = readMode(payload) ?? mode;
		const lane = laneFromEvent(event, payload);
		if (lane) lanes.set(lane.id, { ...lanes.get(lane.id), ...lane });
	}
	const all = [...lanes.values()];
	return { mode, lanes: all, checkpoints: all.filter((lane) => lane.kind === "review"), updatedAt: now.toISOString() };
}

function laneFromEvent(event: AppEvent, payload: Record<string, unknown>): OrchestrationLane | undefined {
	const id = text(payload, "taskId") ?? text(payload, "laneId") ?? event.sessionId;
	if (!id) return undefined;
	const type = event.type.toLowerCase();
	const kind = type.includes("review")
		? "review"
		: type.includes("subagent")
			? "subagent"
			: type.includes("plan")
				? "plan"
				: type.includes("steering")
					? "steering"
					: "worker";
	return {
		id,
		sessionId: event.sessionId,
		kind,
		title: text(payload, "title") ?? text(payload, "name") ?? kind,
		status: status(payload, type),
		summary: sanitize(text(payload, "summary") ?? text(payload, "message")),
		dependencies: array(payload.dependencies),
		blockedBy: array(payload.blockedBy),
		artifacts: [{ kind: "transcript", id: event.id, label: event.type }],
		updatedAt: event.ts,
	};
}
function status(payload: Record<string, unknown>, type: string): OrchestrationLane["status"] {
	const value = text(payload, "status");
	if (value === "blocked" || value === "waiting" || value === "completed" || value === "failed" || value === "running")
		return value;
	if (type.includes("approval")) return "blocked";
	if (type.includes("completed") || type.includes("end")) return "completed";
	return "running";
}
function readMode(payload: Record<string, unknown>): OrchestrationProjection["mode"] | undefined {
	const value = text(payload, "mode");
	return value === "plan" || value === "build" || value === "yolo" ? value : undefined;
}
function sanitize(value?: string): string | undefined {
	return value?.replace(/<internal>[\s\S]*?<\/internal>/g, "[internal omitted]");
}
function text(record: Record<string, unknown>, key: string): string | undefined {
	const v = record[key];
	return typeof v === "string" ? v : undefined;
}
function array(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
