import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ApprovalIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ApprovalRequestStatusSchema = Type.Union([
	Type.Literal("pending"),
	Type.Literal("approved"),
	Type.Literal("denied"),
	Type.Literal("expired"),
	Type.Literal("cancelled"),
]);
export type ApprovalRequestStatus = Static<typeof ApprovalRequestStatusSchema>;

export const ApprovalRequestKindSchema = Type.Union([
	Type.Literal("command"),
	Type.Literal("tool"),
	Type.Literal("workspace-change"),
	Type.Literal("checkpoint-restore"),
	Type.Literal("answer-input"),
]);
export type ApprovalRequestKind = Static<typeof ApprovalRequestKindSchema>;

export const ApprovalDecisionValueSchema = Type.Union([Type.Literal("approved"), Type.Literal("denied")]);
export type ApprovalDecisionValue = Static<typeof ApprovalDecisionValueSchema>;

export const ApprovalRequestReferenceSchema = StrictObject({
	kind: Type.Literal("approval-request"),
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
});
export type ApprovalRequestReference = Static<typeof ApprovalRequestReferenceSchema>;

export const ApprovalRequestSchema = StrictObject({
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	kind: ApprovalRequestKindSchema,
	status: ApprovalRequestStatusSchema,
	title: Type.String({ minLength: 1 }),
	summary: Type.Optional(Type.String()),
	question: Type.Optional(Type.String({ minLength: 1 })),
	createdAt: Type.String({ minLength: 1 }),
	expiresAt: Type.Optional(Type.String({ minLength: 1 })),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type ApprovalRequest = Static<typeof ApprovalRequestSchema>;

export const ApprovalListParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	status: Type.Optional(ApprovalRequestStatusSchema),
});
export type ApprovalListParams = Static<typeof ApprovalListParamsSchema>;

export const ApprovalListResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	requests: Type.Array(ApprovalRequestSchema),
});
export type ApprovalListResult = Static<typeof ApprovalListResultSchema>;

export const ApprovalDecisionParamsSchema = StrictObject({
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	decision: ApprovalDecisionValueSchema,
	message: Type.Optional(Type.String()),
	idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
});
export type ApprovalDecisionParams = Static<typeof ApprovalDecisionParamsSchema>;

export const ApprovalAnswerInputParamsSchema = StrictObject({
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	answer: Type.Optional(Type.String({ minLength: 1 })),
	answers: Type.Optional(Type.Record(Type.String({ minLength: 1 }), StrictObject({ answers: Type.Array(Type.String()) }))),
	idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
});
export type ApprovalAnswerInputParams = Static<typeof ApprovalAnswerInputParamsSchema>;

export const ApprovalDecisionRecordSchema = StrictObject({
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	decision: ApprovalDecisionValueSchema,
	message: Type.Optional(Type.String()),
	decidedAt: Type.String({ minLength: 1 }),
});
export type ApprovalDecisionRecord = Static<typeof ApprovalDecisionRecordSchema>;

export const ApprovalAnswerRecordSchema = StrictObject({
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	answer: Type.String({ minLength: 1 }),
	answeredAt: Type.String({ minLength: 1 }),
});
export type ApprovalAnswerRecord = Static<typeof ApprovalAnswerRecordSchema>;

export const ApprovalFailureCodeSchema = Type.Union([
	Type.Literal("stale"),
	Type.Literal("expired"),
	Type.Literal("duplicate"),
	Type.Literal("wrong-thread"),
	Type.Literal("not-found"),
]);
export type ApprovalFailureCode = Static<typeof ApprovalFailureCodeSchema>;

export const ApprovalFailureSchema = StrictObject({
	ok: Type.Literal(false),
	code: ApprovalFailureCodeSchema,
	approvalId: ApprovalIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	message: Type.String({ minLength: 1 }),
	currentStatus: Type.Optional(ApprovalRequestStatusSchema),
	requestThreadId: Type.Optional(ThreadIdSchema),
	latestApprovalId: Type.Optional(ApprovalIdSchema),
});
export type ApprovalFailure = Static<typeof ApprovalFailureSchema>;

export const ApprovalDecisionSuccessSchema = StrictObject({
	ok: Type.Literal(true),
	request: ApprovalRequestSchema,
	decision: ApprovalDecisionRecordSchema,
});
export type ApprovalDecisionSuccess = Static<typeof ApprovalDecisionSuccessSchema>;

export const ApprovalAnswerSuccessSchema = StrictObject({
	ok: Type.Literal(true),
	request: ApprovalRequestSchema,
	answer: ApprovalAnswerRecordSchema,
});
export type ApprovalAnswerSuccess = Static<typeof ApprovalAnswerSuccessSchema>;

export const ApprovalDecisionResultSchema = Type.Union([ApprovalDecisionSuccessSchema, ApprovalFailureSchema]);
export type ApprovalDecisionResult = Static<typeof ApprovalDecisionResultSchema>;

export const ApprovalAnswerInputResultSchema = Type.Union([ApprovalAnswerSuccessSchema, ApprovalFailureSchema]);
export type ApprovalAnswerInputResult = Static<typeof ApprovalAnswerInputResultSchema>;

export const ApprovalRequestNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	request: ApprovalRequestReferenceSchema,
	status: ApprovalRequestStatusSchema,
});
export type ApprovalRequestNotification = Static<typeof ApprovalRequestNotificationSchema>;
