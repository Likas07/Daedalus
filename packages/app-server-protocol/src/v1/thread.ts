import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";
import { TimelineWindowResultSchema } from "./timeline";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });
const JsonObjectSchema = Type.Record(Type.String(), Type.Unknown());

export const ThreadStatusSchema = Type.Union([
	Type.Literal("idle"),
	Type.Literal("running"),
	Type.Literal("waiting"),
	Type.Literal("failed"),
	Type.Literal("completed"),
]);
export type ThreadStatus = Static<typeof ThreadStatusSchema>;

export const TurnStatusSchema = Type.Union([
	Type.Literal("queued"),
	Type.Literal("running"),
	Type.Literal("waiting"),
	Type.Literal("failed"),
	Type.Literal("completed"),
	Type.Literal("cancelled"),
]);
export type TurnStatus = Static<typeof TurnStatusSchema>;

export const ThreadSchema = StrictObject({
	threadId: ThreadIdSchema,
	projectId: ProjectIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	title: Type.String({ minLength: 1 }),
	status: ThreadStatusSchema,
	updatedAt: Type.String({ minLength: 1 }),
	createdAt: Type.Optional(Type.String({ minLength: 1 })),
	lastTurnId: Type.Optional(TurnIdSchema),
});
export type Thread = Static<typeof ThreadSchema>;

export const TurnSchema = StrictObject({
	turnId: TurnIdSchema,
	threadId: ThreadIdSchema,
	status: TurnStatusSchema,
	prompt: Type.Optional(Type.String({ minLength: 1 })),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.String({ minLength: 1 }),
	completedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type Turn = Static<typeof TurnSchema>;

export const ThreadCreateParamsSchema = StrictObject({
	projectId: ProjectIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	title: Type.Optional(Type.String({ minLength: 1 })),
	prompt: Type.Optional(Type.String({ minLength: 1 })),
	model: Type.Optional(Type.String({ minLength: 1 })),
	effort: Type.Optional(Type.String({ minLength: 1 })),
	draftState: Type.Optional(JsonObjectSchema),
});
export type ThreadCreateParams = Static<typeof ThreadCreateParamsSchema>;

export const ThreadCreateResultSchema = StrictObject({
	thread: ThreadSchema,
	turn: Type.Optional(TurnSchema),
});
export type ThreadCreateResult = Static<typeof ThreadCreateResultSchema>;

export const ThreadListParamsSchema = StrictObject({
	projectId: ProjectIdSchema,
	workspaceTargetId: Type.Optional(WorkspaceTargetIdSchema),
});
export type ThreadListParams = Static<typeof ThreadListParamsSchema>;

export const ThreadListResultSchema = StrictObject({
	threads: Type.Array(ThreadSchema),
});
export type ThreadListResult = Static<typeof ThreadListResultSchema>;

export const ThreadResumeParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	prompt: Type.Optional(Type.String({ minLength: 1 })),
	model: Type.Optional(Type.String({ minLength: 1 })),
	effort: Type.Optional(Type.String({ minLength: 1 })),
	draftState: Type.Optional(JsonObjectSchema),
});
export type ThreadResumeParams = Static<typeof ThreadResumeParamsSchema>;

export const ThreadResumeResultSchema = StrictObject({
	thread: ThreadSchema,
	turn: Type.Optional(TurnSchema),
});
export type ThreadResumeResult = Static<typeof ThreadResumeResultSchema>;

export const ThreadGetParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
});
export type ThreadGetParams = Static<typeof ThreadGetParamsSchema>;

export const ThreadGetResultSchema = StrictObject({
	thread: ThreadSchema,
	turns: Type.Array(TurnSchema),
	timeline: TimelineWindowResultSchema,
});
export type ThreadGetResult = Static<typeof ThreadGetResultSchema>;

export const TurnStartParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	prompt: Type.String({ minLength: 1 }),
	attachmentIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	attachments: Type.Optional(
		Type.Array(
			StrictObject({
				type: Type.Literal("image"),
				url: Type.String({ minLength: 1 }),
			}),
		),
	),
	filePaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	model: Type.Optional(Type.String({ minLength: 1 })),
	effort: Type.Optional(Type.String({ minLength: 1 })),
	draftState: Type.Optional(JsonObjectSchema),
});
export type TurnStartParams = Static<typeof TurnStartParamsSchema>;

export const TurnStartResultSchema = StrictObject({
	turn: TurnSchema,
});
export type TurnStartResult = Static<typeof TurnStartResultSchema>;

export const TurnCancelParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
});
export type TurnCancelParams = Static<typeof TurnCancelParamsSchema>;

export const TurnCancelResultSchema = StrictObject({
	turn: TurnSchema,
});
export type TurnCancelResult = Static<typeof TurnCancelResultSchema>;
