import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { EventIdSchema, SessionIdSchema } from "./ids";
import {
	ApprovalRequestNotificationSchema as ProtocolV1ApprovalRequestNotificationSchema,
	DiffSummaryNotificationSchema as ProtocolV1DiffSummaryNotificationSchema,
	TerminalContextNotificationSchema as ProtocolV1TerminalContextNotificationSchema,
	TerminalOutputNotificationSchema as ProtocolV1TerminalOutputNotificationSchema,
	TimelineEntryNotificationSchema as ProtocolV1TimelineEntryNotificationSchema,
} from "./v1";
import { WorkflowNeedsAttentionSchema, WorkflowRunsInTargetSchema } from "./workflow";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const EventCursorSchema = Type.Object({
	after: Type.Optional(EventIdSchema),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});
export type EventCursor = Static<typeof EventCursorSchema>;

export const SessionStartedEventPayloadSchema = Type.Object({
	sessionId: SessionIdSchema,
	runsIn: Type.Optional(WorkflowRunsInTargetSchema),
});
export type SessionStartedEventPayload = Static<typeof SessionStartedEventPayloadSchema>;

export const WorkflowNeedsAttentionEventPayloadSchema = Type.Object({
	sessionId: Type.Optional(SessionIdSchema),
	attention: WorkflowNeedsAttentionSchema,
});
export type WorkflowNeedsAttentionEventPayload = Static<typeof WorkflowNeedsAttentionEventPayloadSchema>;

export const ProtocolV1Phase3AppEventPayloadSchema = Type.Union([
	StrictObject({ kind: Type.Literal("timeline.entry"), data: ProtocolV1TimelineEntryNotificationSchema }),
	StrictObject({ kind: Type.Literal("approval.changed"), data: ProtocolV1ApprovalRequestNotificationSchema }),
	StrictObject({ kind: Type.Literal("diff.changed"), data: ProtocolV1DiffSummaryNotificationSchema }),
	StrictObject({ kind: Type.Literal("terminal.changed"), data: ProtocolV1TerminalContextNotificationSchema }),
	StrictObject({ kind: Type.Literal("terminal.output"), data: ProtocolV1TerminalOutputNotificationSchema }),
]);
export type ProtocolV1Phase3AppEventPayload = Static<typeof ProtocolV1Phase3AppEventPayloadSchema>;

export const AppEventSchema = Type.Object({
	id: EventIdSchema,
	type: Type.String({ minLength: 1 }),
	ts: Type.String({ minLength: 1 }),
	sessionId: Type.Optional(SessionIdSchema),
	payload: Type.Unknown(),
});
export type AppEvent = Static<typeof AppEventSchema>;

export const EventReplayParamsSchema = Type.Object({
	cursor: Type.Optional(EventCursorSchema),
	types: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});
export type EventReplayParams = Static<typeof EventReplayParamsSchema>;

export const EventReplayResultSchema = Type.Object({
	events: Type.Array(AppEventSchema),
	next: Type.Optional(EventCursorSchema),
});
export type EventReplayResult = Static<typeof EventReplayResultSchema>;
