import { type Static, type TSchema, Type } from "@sinclair/typebox";
import {
	ApprovalIdSchema,
	CheckpointIdSchema,
	DiffIdSchema,
	TerminalIdSchema,
	ThreadIdSchema,
	TurnIdSchema,
	WorkspaceTargetIdSchema,
} from "../ids";
import { ApprovalRequestReferenceSchema } from "./approval";
import { DiffSummaryReferenceSchema } from "./diff";
import {
	AuditDetailPayloadRefSchema,
	DiffContentPayloadRefSchema,
	PayloadReferenceSchema,
	TerminalOutputPayloadRefSchema,
	ToolOutputPayloadRefSchema,
} from "./payload-windows";
import { ReplayCursorSchema, ReplayDirectionSchema } from "./replay";
import { TerminalContextReferenceSchema, TerminalContextStatusSchema } from "./terminal";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

const TimelineEntryIdSchema = Type.String({ minLength: 1 });
const TimelinePayloadIdSchema = Type.String({ minLength: 1 });

const TimelineEntryBaseFields = {
	entryId: TimelineEntryIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	sequence: Type.Integer({ minimum: 0 }),
	createdAt: Type.String({ minLength: 1 }),
	sourceEventId: Type.Optional(Type.String({ minLength: 1 })),
} satisfies Record<string, TSchema>;

export const TimelineMessageRoleSchema = Type.Union([Type.Literal("user"), Type.Literal("assistant")]);
export type TimelineMessageRole = Static<typeof TimelineMessageRoleSchema>;

export const UserMessageTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("user-message"),
	role: Type.Literal("user"),
	turnId: TurnIdSchema,
	messageId: TimelinePayloadIdSchema,
	content: Type.String(),
});
export type UserMessageTimelineEntry = Static<typeof UserMessageTimelineEntrySchema>;

export const AssistantMessageTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("assistant-message"),
	role: Type.Literal("assistant"),
	turnId: TurnIdSchema,
	messageId: TimelinePayloadIdSchema,
	content: Type.String(),
});
export type AssistantMessageTimelineEntry = Static<typeof AssistantMessageTimelineEntrySchema>;

export const ActivityStatusSchema = Type.Union([
	Type.Literal("queued"),
	Type.Literal("running"),
	Type.Literal("waiting"),
	Type.Literal("completed"),
	Type.Literal("failed"),
]);
export type ActivityStatus = Static<typeof ActivityStatusSchema>;

export const ActivityTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("activity"),
	status: ActivityStatusSchema,
	title: Type.String({ minLength: 1 }),
	description: Type.Optional(Type.String()),
	payloadRef: Type.Optional(AuditDetailPayloadRefSchema),
});
export type ActivityTimelineEntry = Static<typeof ActivityTimelineEntrySchema>;

export const ToolStatusSchema = Type.Union([
	Type.Literal("queued"),
	Type.Literal("running"),
	Type.Literal("completed"),
	Type.Literal("failed"),
	Type.Literal("cancelled"),
]);
export type ToolStatus = Static<typeof ToolStatusSchema>;

export const ToolTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	entryId: Type.String({ minLength: 6, pattern: "^tool:.+" }),
	kind: Type.Literal("tool"),
	turnId: TurnIdSchema,
	toolCallId: TimelinePayloadIdSchema,
	toolName: Type.String({ minLength: 1 }),
	status: ToolStatusSchema,
	summary: Type.Optional(Type.String()),
	payloadRef: Type.Optional(ToolOutputPayloadRefSchema),
});
export type ToolTimelineEntry = Static<typeof ToolTimelineEntrySchema>;

export const TerminalOutputTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("terminal-output"),
	summary: Type.Optional(Type.String()),
	payloadRef: TerminalOutputPayloadRefSchema,
});
export type TerminalOutputTimelineEntry = Static<typeof TerminalOutputTimelineEntrySchema>;

export const TerminalContextTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("terminal"),
	terminalId: TerminalIdSchema,
	status: TerminalContextStatusSchema,
	title: Type.Optional(Type.String({ minLength: 1 })),
	summary: Type.Optional(Type.String()),
	contextRef: Type.Optional(TerminalContextReferenceSchema),
});
export type TerminalContextTimelineEntry = Static<typeof TerminalContextTimelineEntrySchema>;

export const ApprovalStatusSchema = Type.Union([
	Type.Literal("pending"),
	Type.Literal("approved"),
	Type.Literal("denied"),
	Type.Literal("cancelled"),
	Type.Literal("expired"),
]);
export type ApprovalStatus = Static<typeof ApprovalStatusSchema>;

export const ApprovalTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("approval"),
	approvalId: ApprovalIdSchema,
	status: ApprovalStatusSchema,
	title: Type.String({ minLength: 1 }),
	summary: Type.Optional(Type.String()),
	payloadRef: Type.Optional(AuditDetailPayloadRefSchema),
	requestRef: Type.Optional(ApprovalRequestReferenceSchema),
});
export type ApprovalTimelineEntry = Static<typeof ApprovalTimelineEntrySchema>;

export const DiffTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("diff"),
	diffId: DiffIdSchema,
	workspaceTargetId: Type.Optional(WorkspaceTargetIdSchema),
	checkpointId: Type.Optional(CheckpointIdSchema),
	title: Type.String({ minLength: 1 }),
	filesChanged: Type.Integer({ minimum: 0 }),
	insertions: Type.Optional(Type.Integer({ minimum: 0 })),
	deletions: Type.Optional(Type.Integer({ minimum: 0 })),
	payloadRef: DiffContentPayloadRefSchema,
	diffRef: Type.Optional(DiffSummaryReferenceSchema),
});
export type DiffTimelineEntry = Static<typeof DiffTimelineEntrySchema>;

export const PlanStatusSchema = Type.Union([
	Type.Literal("draft"),
	Type.Literal("active"),
	Type.Literal("updated"),
	Type.Literal("completed"),
	Type.Literal("blocked"),
]);
export type PlanStatus = Static<typeof PlanStatusSchema>;

export const PlanTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("plan"),
	planId: TimelinePayloadIdSchema,
	status: PlanStatusSchema,
	title: Type.String({ minLength: 1 }),
	summary: Type.Optional(Type.String()),
	payloadRef: Type.Optional(AuditDetailPayloadRefSchema),
});
export type PlanTimelineEntry = Static<typeof PlanTimelineEntrySchema>;

export const SafetyLevelSchema = Type.Union([Type.Literal("info"), Type.Literal("warning"), Type.Literal("blocked")]);
export type SafetyLevel = Static<typeof SafetyLevelSchema>;

export const SafetyTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("safety"),
	level: SafetyLevelSchema,
	message: Type.String({ minLength: 1 }),
	code: Type.Optional(Type.String({ minLength: 1 })),
	payloadRef: Type.Optional(AuditDetailPayloadRefSchema),
});
export type SafetyTimelineEntry = Static<typeof SafetyTimelineEntrySchema>;

export const SystemTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("system-event"),
	eventType: Type.String({ minLength: 1 }),
	message: Type.Optional(Type.String()),
	payloadRef: Type.Optional(PayloadReferenceSchema),
});
export type SystemTimelineEntry = Static<typeof SystemTimelineEntrySchema>;

export const RecoveryStatusSchema = Type.Union([
	Type.Literal("started"),
	Type.Literal("restored"),
	Type.Literal("failed"),
	Type.Literal("skipped"),
]);
export type RecoveryStatus = Static<typeof RecoveryStatusSchema>;

export const RecoveryTimelineEntrySchema = StrictObject({
	...TimelineEntryBaseFields,
	kind: Type.Literal("recovery-event"),
	status: RecoveryStatusSchema,
	message: Type.String({ minLength: 1 }),
	payloadRef: Type.Optional(AuditDetailPayloadRefSchema),
});
export type RecoveryTimelineEntry = Static<typeof RecoveryTimelineEntrySchema>;

export const TimelineEntrySchema = Type.Union([
	UserMessageTimelineEntrySchema,
	AssistantMessageTimelineEntrySchema,
	ActivityTimelineEntrySchema,
	ToolTimelineEntrySchema,
	TerminalOutputTimelineEntrySchema,
	TerminalContextTimelineEntrySchema,
	ApprovalTimelineEntrySchema,
	DiffTimelineEntrySchema,
	PlanTimelineEntrySchema,
	SafetyTimelineEntrySchema,
	SystemTimelineEntrySchema,
	RecoveryTimelineEntrySchema,
]);
export type TimelineEntry = Static<typeof TimelineEntrySchema>;

export const TimelineWindowParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	after: Type.Optional(ReplayCursorSchema),
	before: Type.Optional(ReplayCursorSchema),
	direction: Type.Optional(ReplayDirectionSchema),
	limit: Type.Integer({ minimum: 1, maximum: 500 }),
});
export type TimelineWindowParams = Static<typeof TimelineWindowParamsSchema>;

export const TimelineWindowResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	entries: Type.Array(TimelineEntrySchema),
	nextCursor: Type.Optional(ReplayCursorSchema),
	previousCursor: Type.Optional(ReplayCursorSchema),
	hasMoreAfter: Type.Boolean(),
	hasMoreBefore: Type.Boolean(),
});
export type TimelineWindowResult = Static<typeof TimelineWindowResultSchema>;

export const TimelineEntryNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	entry: TimelineEntrySchema,
	nextCursor: Type.Optional(ReplayCursorSchema),
});
export type TimelineEntryNotification = Static<typeof TimelineEntryNotificationSchema>;

export const TimelineDeltaKindSchema = Type.Union([
	Type.Literal("assistant-message"),
	Type.Literal("reasoning"),
	Type.Literal("plan"),
	Type.Literal("tool-output"),
	Type.Literal("command-output"),
	Type.Literal("file-change"),
]);
export type TimelineDeltaKind = Static<typeof TimelineDeltaKindSchema>;

export const TimelineDeltaNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	entryId: TimelineEntryIdSchema,
	sequence: Type.Integer({ minimum: 0 }),
	kind: TimelineDeltaKindSchema,
	delta: Type.String({ description: "Incremental live-stream chunk only; never cumulative materialized text." }),
	payloadRef: Type.Optional(PayloadReferenceSchema),
});
export type TimelineDeltaNotification = Static<typeof TimelineDeltaNotificationSchema>;
