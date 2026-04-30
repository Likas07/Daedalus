import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { CheckpointIdSchema, DiffIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";
import { DiffContentPayloadRefSchema } from "./payload-windows";
import { ReplayCursorSchema, ReplayDirectionSchema, ReplayWindowCursorsSchema } from "./replay";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const DiffStatusSchema = Type.Union([
	Type.Literal("clean"),
	Type.Literal("changed"),
	Type.Literal("large"),
	Type.Literal("target-mismatch"),
	Type.Literal("error"),
]);
export type DiffStatus = Static<typeof DiffStatusSchema>;

export const DiffFileStatusSchema = Type.Union([
	Type.Literal("added"),
	Type.Literal("modified"),
	Type.Literal("deleted"),
	Type.Literal("renamed"),
	Type.Literal("copied"),
	Type.Literal("unchanged"),
	Type.Literal("binary"),
]);
export type DiffFileStatus = Static<typeof DiffFileStatusSchema>;

const DiffScopeFields = {
	diffId: DiffIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	checkpointId: CheckpointIdSchema,
} satisfies Record<string, TSchema>;

export const DiffSummaryReferenceSchema = StrictObject({
	kind: Type.Literal("diff-summary"),
	...DiffScopeFields,
});
export type DiffSummaryReference = Static<typeof DiffSummaryReferenceSchema>;

export const DiffSummaryParamsSchema = StrictObject({
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	checkpointId: CheckpointIdSchema,
});
export type DiffSummaryParams = Static<typeof DiffSummaryParamsSchema>;

export const DiffFileSummarySchema = StrictObject({
	path: Type.String({ minLength: 1 }),
	oldPath: Type.Optional(Type.String({ minLength: 1 })),
	status: DiffFileStatusSchema,
	insertions: Type.Integer({ minimum: 0 }),
	deletions: Type.Integer({ minimum: 0 }),
	hunks: Type.Integer({ minimum: 0 }),
	byteLength: Type.Integer({ minimum: 0 }),
	isBinary: Type.Boolean(),
	isLarge: Type.Boolean(),
	payloadRef: Type.Optional(DiffContentPayloadRefSchema),
});
export type DiffFileSummary = Static<typeof DiffFileSummarySchema>;

export const DiffSummarySchema = StrictObject({
	...DiffScopeFields,
	status: DiffStatusSchema,
	title: Type.String({ minLength: 1 }),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
	baseRef: Type.Optional(Type.String({ minLength: 1 })),
	headRef: Type.Optional(Type.String({ minLength: 1 })),
	filesChanged: Type.Integer({ minimum: 0 }),
	insertions: Type.Integer({ minimum: 0 }),
	deletions: Type.Integer({ minimum: 0 }),
	totalBytes: Type.Integer({ minimum: 0 }),
	isLarge: Type.Boolean(),
	files: Type.Array(DiffFileSummarySchema),
	omittedFileCount: Type.Integer({ minimum: 0 }),
});
export type DiffSummary = Static<typeof DiffSummarySchema>;

export const DiffFailureCodeSchema = Type.Union([
	Type.Literal("target-mismatch"),
	Type.Literal("not-found"),
	Type.Literal("window-too-large"),
	Type.Literal("file-too-large"),
	Type.Literal("error"),
]);
export type DiffFailureCode = Static<typeof DiffFailureCodeSchema>;

export const DiffFailureSchema = StrictObject({
	ok: Type.Literal(false),
	code: DiffFailureCodeSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	checkpointId: Type.Optional(CheckpointIdSchema),
	diffId: Type.Optional(DiffIdSchema),
	message: Type.String({ minLength: 1 }),
	actualWorkspaceTargetId: Type.Optional(WorkspaceTargetIdSchema),
});
export type DiffFailure = Static<typeof DiffFailureSchema>;

export const DiffSummarySuccessSchema = StrictObject({
	ok: Type.Literal(true),
	summary: DiffSummarySchema,
});
export type DiffSummarySuccess = Static<typeof DiffSummarySuccessSchema>;

export const DiffSummaryResultSchema = Type.Union([DiffSummarySuccessSchema, DiffFailureSchema]);
export type DiffSummaryResult = Static<typeof DiffSummaryResultSchema>;

export const DiffFileWindowParamsSchema = StrictObject({
	...DiffScopeFields,
	filePath: Type.String({ minLength: 1 }),
	after: Type.Optional(ReplayCursorSchema),
	before: Type.Optional(ReplayCursorSchema),
	direction: Type.Optional(ReplayDirectionSchema),
	limit: Type.Integer({ minimum: 1, maximum: 1000 }),
});
export type DiffFileWindowParams = Static<typeof DiffFileWindowParamsSchema>;

export const DiffHunkWindowChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	oldStart: Type.Integer({ minimum: 0 }),
	oldLines: Type.Integer({ minimum: 0 }),
	newStart: Type.Integer({ minimum: 0 }),
	newLines: Type.Integer({ minimum: 0 }),
	text: Type.String(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type DiffHunkWindowChunk = Static<typeof DiffHunkWindowChunkSchema>;

export const DiffFileWindowSchema = StrictObject({
	...DiffScopeFields,
	filePath: Type.String({ minLength: 1 }),
	status: DiffFileStatusSchema,
	isBinary: Type.Boolean(),
	isLarge: Type.Boolean(),
	byteLength: Type.Integer({ minimum: 0 }),
	chunks: Type.Array(DiffHunkWindowChunkSchema),
	...ReplayWindowCursorsSchema.properties,
});
export type DiffFileWindow = Static<typeof DiffFileWindowSchema>;

export const DiffFileWindowSuccessSchema = StrictObject({
	ok: Type.Literal(true),
	window: DiffFileWindowSchema,
});
export type DiffFileWindowSuccess = Static<typeof DiffFileWindowSuccessSchema>;

export const DiffFileWindowResultSchema = Type.Union([DiffFileWindowSuccessSchema, DiffFailureSchema]);
export type DiffFileWindowResult = Static<typeof DiffFileWindowResultSchema>;

export const DiffSummaryNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	checkpointId: CheckpointIdSchema,
	diff: DiffSummaryReferenceSchema,
	status: DiffStatusSchema,
});
export type DiffSummaryNotification = Static<typeof DiffSummaryNotificationSchema>;
