import { type Static, type TSchema, Type } from "@sinclair/typebox";
import type { AppEvent } from "./events";
import { SessionIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const OrchestrationLaneKindSchema = Type.Union([
	Type.Literal("plan"),
	Type.Literal("worker"),
	Type.Literal("subagent"),
	Type.Literal("review"),
	Type.Literal("steering"),
	Type.Literal("follow-up"),
]);
export type OrchestrationLaneKind = Static<typeof OrchestrationLaneKindSchema>;

export const OrchestrationLaneStatusSchema = Type.Union([
	Type.Literal("queued"),
	Type.Literal("running"),
	Type.Literal("waiting"),
	Type.Literal("blocked"),
	Type.Literal("reviewing"),
	Type.Literal("completed"),
	Type.Literal("failed"),
]);
export type OrchestrationLaneStatus = Static<typeof OrchestrationLaneStatusSchema>;

export const DaedalusAutonomyModeSchema = Type.Union([
	Type.Literal("plan"),
	Type.Literal("build"),
	Type.Literal("yolo"),
]);
export type DaedalusAutonomyMode = Static<typeof DaedalusAutonomyModeSchema>;

export const OrchestrationArtifactLinkSchema = StrictObject({
	kind: Type.Union([
		Type.Literal("transcript"),
		Type.Literal("tool"),
		Type.Literal("diff"),
		Type.Literal("approval"),
		Type.Literal("commit"),
		Type.Literal("pr"),
	]),
	id: Type.String({ minLength: 1 }),
	label: Type.String(),
	href: Type.Optional(Type.String()),
});
export type OrchestrationArtifactLink = Static<typeof OrchestrationArtifactLinkSchema>;

export const OrchestrationLaneSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	sessionId: Type.Optional(SessionIdSchema),
	kind: OrchestrationLaneKindSchema,
	title: Type.String(),
	status: OrchestrationLaneStatusSchema,
	summary: Type.Optional(Type.String()),
	dependencies: Type.Array(Type.String({ minLength: 1 })),
	blockedBy: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	artifacts: Type.Array(OrchestrationArtifactLinkSchema),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type OrchestrationLane = Static<typeof OrchestrationLaneSchema>;

export const OrchestrationProjectionSchema = StrictObject({
	sessionId: Type.Optional(SessionIdSchema),
	mode: DaedalusAutonomyModeSchema,
	lanes: Type.Array(OrchestrationLaneSchema),
	checkpoints: Type.Array(OrchestrationLaneSchema),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type OrchestrationProjection = Static<typeof OrchestrationProjectionSchema>;

export const OrchestrationEventPayloadSchema = StrictObject({ projection: OrchestrationProjectionSchema });
export type OrchestrationEventPayload = Static<typeof OrchestrationEventPayloadSchema>;

export function orchestrationEvent(event: AppEvent): OrchestrationEventPayload | undefined {
	return event.type === "orchestration/projected" && isRecord(event.payload)
		? (event.payload as unknown as OrchestrationEventPayload)
		: undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
