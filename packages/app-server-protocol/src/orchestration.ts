import type { AppEvent } from "./events";
import type { SessionId } from "./ids";

export type OrchestrationLaneKind = "plan" | "worker" | "subagent" | "review" | "steering" | "follow-up";
export type OrchestrationLaneStatus =
	| "queued"
	| "running"
	| "waiting"
	| "blocked"
	| "reviewing"
	| "completed"
	| "failed";
export type DaedalusAutonomyMode = "plan" | "build" | "yolo";

export interface OrchestrationArtifactLink {
	readonly kind: "transcript" | "tool" | "diff" | "approval" | "commit" | "pr";
	readonly id: string;
	readonly label: string;
	readonly href?: string;
}
export interface OrchestrationLane {
	readonly id: string;
	readonly sessionId?: SessionId;
	readonly kind: OrchestrationLaneKind;
	readonly title: string;
	readonly status: OrchestrationLaneStatus;
	readonly summary?: string;
	readonly dependencies: readonly string[];
	readonly blockedBy?: readonly string[];
	readonly artifacts: readonly OrchestrationArtifactLink[];
	readonly updatedAt?: string;
}
export interface OrchestrationProjection {
	readonly sessionId?: SessionId;
	readonly mode: DaedalusAutonomyMode;
	readonly lanes: readonly OrchestrationLane[];
	readonly checkpoints: readonly OrchestrationLane[];
	readonly updatedAt?: string;
}
export interface OrchestrationEventPayload {
	readonly projection: OrchestrationProjection;
}

export function orchestrationEvent(event: AppEvent): OrchestrationEventPayload | undefined {
	return event.type === "orchestration/projected" && isRecord(event.payload)
		? (event.payload as unknown as OrchestrationEventPayload)
		: undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
