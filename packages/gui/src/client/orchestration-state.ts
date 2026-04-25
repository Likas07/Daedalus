import type { AppEvent, OrchestrationProjection } from "@daedalus-pi/app-server-protocol";

export function orchestrationFromEvents(events: readonly AppEvent[]): OrchestrationProjection {
	const lanes = events
		.filter(
			(event) =>
				event.type.includes("orchestration") || event.type.includes("agent") || event.type.includes("approval"),
		)
		.map((event) => ({
			id: event.sessionId ?? event.id,
			sessionId: event.sessionId,
			kind: event.type.includes("review")
				? ("review" as const)
				: event.type.includes("approval")
					? ("steering" as const)
					: ("worker" as const),
			title: event.type,
			status: event.type.includes("approval")
				? ("blocked" as const)
				: event.type.includes("end")
					? ("completed" as const)
					: ("running" as const),
			summary:
				typeof event.payload === "object" && event.payload
					? String((event.payload as { summary?: unknown }).summary ?? "")
					: "",
			dependencies: [],
			artifacts: [{ kind: "transcript" as const, id: event.id, label: event.type }],
			updatedAt: event.ts,
		}));
	return {
		mode: "build",
		lanes,
		checkpoints: lanes.filter((lane) => lane.kind === "review"),
		updatedAt: events.at(-1)?.ts,
	};
}
export const autonomyLabels = { plan: "Plan", build: "Build", yolo: "Yolo" } as const;
