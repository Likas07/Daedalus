import { type Static, type TSchema, Type } from "@sinclair/typebox";
import {
	ApprovalIdSchema,
	DiffIdSchema,
	ProjectIdSchema,
	SessionIdSchema,
	TurnIdSchema,
	WorktreeIdSchema,
} from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ProjectionCursorSchema = StrictObject({
	seq: Type.Integer({ minimum: 0 }),
	updatedAt: Type.String({ minLength: 1 }),
});
export type ProjectionCursor = Static<typeof ProjectionCursorSchema>;

export const SafetySignalSchema = StrictObject({
	level: Type.Union([Type.Literal("info"), Type.Literal("warning"), Type.Literal("blocked")]),
	message: Type.String({ minLength: 1 }),
	code: Type.Optional(Type.String({ minLength: 1 })),
});
export type SafetySignal = Static<typeof SafetySignalSchema>;

export const ThreadActivitySchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	kind: Type.Union([
		Type.Literal("thinking"),
		Type.Literal("tool"),
		Type.Literal("terminal"),
		Type.Literal("diff"),
		Type.Literal("approval"),
		Type.Literal("system"),
	]),
	status: Type.Union([
		Type.Literal("running"),
		Type.Literal("completed"),
		Type.Literal("failed"),
		Type.Literal("cancelled"),
	]),
	title: Type.String({ minLength: 1 }),
	detail: Type.Optional(Type.String()),
	startedAt: Type.String({ minLength: 1 }),
	completedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type ThreadActivity = Static<typeof ThreadActivitySchema>;

export const ThreadPendingActionSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	kind: Type.Union([Type.Literal("approval"), Type.Literal("input"), Type.Literal("review")]),
	title: Type.String({ minLength: 1 }),
	summary: Type.Optional(Type.String()),
	approvalId: Type.Optional(ApprovalIdSchema),
});
export type ThreadPendingAction = Static<typeof ThreadPendingActionSchema>;

export const ThreadMessageSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	turnId: Type.Optional(TurnIdSchema),
	role: Type.Union([Type.Literal("user"), Type.Literal("assistant"), Type.Literal("system"), Type.Literal("tool")]),
	content: Type.String(),
	createdAt: Type.String({ minLength: 1 }),
});
export type ThreadMessage = Static<typeof ThreadMessageSchema>;

export const ShellThreadSummarySchema = StrictObject({
	threadId: Type.String({ minLength: 1 }),
	sessionId: SessionIdSchema,
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	title: Type.String({ minLength: 1 }),
	status: Type.Union([
		Type.Literal("idle"),
		Type.Literal("running"),
		Type.Literal("waiting"),
		Type.Literal("failed"),
		Type.Literal("completed"),
	]),
	lastMessage: Type.Optional(Type.String()),
	updatedAt: Type.String({ minLength: 1 }),
	pendingActionCount: Type.Integer({ minimum: 0 }),
	safetySignals: Type.Array(SafetySignalSchema),
});
export type ShellThreadSummary = Static<typeof ShellThreadSummarySchema>;

export const ShellSnapshotSchema = StrictObject({
	cursor: ProjectionCursorSchema,
	threads: Type.Array(ShellThreadSummarySchema),
	selectedThreadId: Type.Optional(Type.String({ minLength: 1 })),
});
export type ShellSnapshot = Static<typeof ShellSnapshotSchema>;

export const ShellEventSchema = StrictObject({
	seq: Type.Integer({ minimum: 1 }),
	cursor: ProjectionCursorSchema,
	type: Type.Union([
		Type.Literal("snapshot-invalidated"),
		Type.Literal("thread-upserted"),
		Type.Literal("thread-removed"),
	]),
	thread: Type.Optional(ShellThreadSummarySchema),
	threadId: Type.Optional(Type.String({ minLength: 1 })),
});
export type ShellEvent = Static<typeof ShellEventSchema>;

export const ThreadDetailSnapshotSchema = StrictObject({
	cursor: ProjectionCursorSchema,
	threadId: Type.String({ minLength: 1 }),
	sessionId: SessionIdSchema,
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	title: Type.String({ minLength: 1 }),
	status: Type.Union([
		Type.Literal("idle"),
		Type.Literal("running"),
		Type.Literal("waiting"),
		Type.Literal("failed"),
		Type.Literal("completed"),
	]),
	messages: Type.Array(ThreadMessageSchema),
	activity: Type.Array(ThreadActivitySchema),
	pendingActions: Type.Array(ThreadPendingActionSchema),
	safetySignals: Type.Array(SafetySignalSchema),
	diffIds: Type.Array(DiffIdSchema),
});
export type ThreadDetailSnapshot = Static<typeof ThreadDetailSnapshotSchema>;

export const ThreadDetailEventSchema = StrictObject({
	seq: Type.Integer({ minimum: 1 }),
	cursor: ProjectionCursorSchema,
	threadId: Type.String({ minLength: 1 }),
	sessionId: SessionIdSchema,
	type: Type.Union([
		Type.Literal("snapshot-invalidated"),
		Type.Literal("message-appended"),
		Type.Literal("activity-updated"),
		Type.Literal("pending-actions-updated"),
		Type.Literal("safety-signal"),
	]),
	message: Type.Optional(ThreadMessageSchema),
	activity: Type.Optional(ThreadActivitySchema),
	pendingActions: Type.Optional(Type.Array(ThreadPendingActionSchema)),
	safetySignal: Type.Optional(SafetySignalSchema),
});
export type ThreadDetailEvent = Static<typeof ThreadDetailEventSchema>;

export const ShellSnapshotParamsSchema = StrictObject({
	projectId: Type.Optional(ProjectIdSchema),
	cursor: Type.Optional(ProjectionCursorSchema),
});
export type ShellSnapshotParams = Static<typeof ShellSnapshotParamsSchema>;

export const ShellSnapshotResultSchema = StrictObject({ snapshot: ShellSnapshotSchema });
export type ShellSnapshotResult = Static<typeof ShellSnapshotResultSchema>;

export const ThreadSnapshotParamsSchema = StrictObject({
	threadId: Type.String({ minLength: 1 }),
	sessionId: Type.Optional(SessionIdSchema),
	cursor: Type.Optional(ProjectionCursorSchema),
});
export type ThreadSnapshotParams = Static<typeof ThreadSnapshotParamsSchema>;

export const ThreadSnapshotResultSchema = StrictObject({ snapshot: ThreadDetailSnapshotSchema });
export type ThreadSnapshotResult = Static<typeof ThreadSnapshotResultSchema>;
