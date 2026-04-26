import type { AppEvent, OrchestrationProjection } from "@daedalus-pi/app-server-protocol";

export function orchestrationFromEvents(events: readonly AppEvent[]): OrchestrationProjection {
	for (const event of [...events].reverse()) {
		if (event.type !== "orchestration/projected") continue;
		const payload =
			typeof event.payload === "object" && event.payload ? (event.payload as { projection?: unknown }) : {};
		if (isProjection(payload.projection)) return payload.projection;
	}
	return { mode: "build", lanes: [], checkpoints: [], updatedAt: events.at(-1)?.ts };
}
function isProjection(value: unknown): value is OrchestrationProjection {
	return typeof value === "object" && value !== null && Array.isArray((value as { lanes?: unknown }).lanes);
}
export const autonomyLabels = { plan: "Plan", build: "Build", yolo: "Yolo" } as const;
