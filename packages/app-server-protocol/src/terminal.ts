import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, SessionIdSchema, TerminalIdSchema, WorktreeIdSchema } from "./ids";
import { RootBoundaryViolationSchema, RootScopedTargetSchema } from "./workflow";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const TerminalStatusSchema = Type.Union([
	Type.Literal("starting"),
	Type.Literal("running"),
	Type.Literal("exited"),
	Type.Literal("killed"),
	Type.Literal("error"),
]);
export type TerminalStatus = Static<typeof TerminalStatusSchema>;

export const TerminalDimensionsSchema = StrictObject({
	cols: Type.Integer({ minimum: 20, maximum: 400 }),
	rows: Type.Integer({ minimum: 5, maximum: 200 }),
});
export type TerminalDimensions = Static<typeof TerminalDimensionsSchema>;

export const TerminalCursorSchema = StrictObject({
	nextSeq: Type.Integer({ minimum: 1 }),
	replayCursor: Type.Integer({ minimum: 0 }),
});
export type TerminalCursor = Static<typeof TerminalCursorSchema>;

export const TerminalOutputChunkSchema = StrictObject({
	seq: Type.Integer({ minimum: 1 }),
	data: Type.String(),
});
export type TerminalOutputChunk = Static<typeof TerminalOutputChunkSchema>;

export const TerminalGuardStatusSchema = Type.Union([
	Type.Literal("unchecked"),
	Type.Literal("valid"),
	Type.Literal("blocked"),
	Type.Literal("violated"),
]);
export type TerminalGuardStatus = Static<typeof TerminalGuardStatusSchema>;

export const TerminalSnapshotSchema = StrictObject({
	terminalId: TerminalIdSchema,
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	sessionId: Type.Optional(SessionIdSchema),
	cwd: Type.String({ minLength: 1 }),
	shell: Type.String({ minLength: 1 }),
	dimensions: TerminalDimensionsSchema,
	status: TerminalStatusSchema,
	history: Type.String(),
	cursor: TerminalCursorSchema,
	attached: Type.Boolean(),
	pid: Type.Optional(Type.Integer({ minimum: 0 })),
	exitCode: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
	exitSignal: Type.Optional(Type.Union([Type.String(), Type.Null()])),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.String({ minLength: 1 }),
	elapsedMs: Type.Integer({ minimum: 0 }),
	guardStatus: Type.Optional(TerminalGuardStatusSchema),
	guardTarget: Type.Optional(RootScopedTargetSchema),
	boundaryViolation: Type.Optional(RootBoundaryViolationSchema),
	rejectedReason: Type.Optional(Type.String()),
});
export type TerminalSnapshot = Static<typeof TerminalSnapshotSchema>;

export const TerminalCreateParamsSchema = StrictObject({
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	sessionId: Type.Optional(SessionIdSchema),
	cwd: Type.String({ minLength: 1 }),
	shell: Type.Optional(Type.String({ minLength: 1 })),
	cols: Type.Optional(Type.Integer({ minimum: 20, maximum: 400 })),
	rows: Type.Optional(Type.Integer({ minimum: 5, maximum: 200 })),
	guardTarget: Type.Optional(RootScopedTargetSchema),
	requireRootBoundary: Type.Optional(Type.Boolean()),
});
export type TerminalCreateParams = Static<typeof TerminalCreateParamsSchema>;

export const TerminalListParamsSchema = StrictObject({
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
});
export type TerminalListParams = Static<typeof TerminalListParamsSchema>;

export const TerminalIdParamsSchema = StrictObject({ terminalId: TerminalIdSchema });
export type TerminalIdParams = Static<typeof TerminalIdParamsSchema>;

export const TerminalInputParamsSchema = StrictObject({ terminalId: TerminalIdSchema, data: Type.String() });
export type TerminalInputParams = Static<typeof TerminalInputParamsSchema>;

export const TerminalResizeParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	cols: Type.Integer({ minimum: 20, maximum: 400 }),
	rows: Type.Integer({ minimum: 5, maximum: 200 }),
});
export type TerminalResizeParams = Static<typeof TerminalResizeParamsSchema>;

export const TerminalReplayParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	afterSeq: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type TerminalReplayParams = Static<typeof TerminalReplayParamsSchema>;

export const TerminalSnapshotResultSchema = StrictObject({ terminal: TerminalSnapshotSchema });
export type TerminalSnapshotResult = Static<typeof TerminalSnapshotResultSchema>;

export const TerminalListResultSchema = StrictObject({ terminals: Type.Array(TerminalSnapshotSchema) });
export type TerminalListResult = Static<typeof TerminalListResultSchema>;

export const TerminalReplayResultSchema = StrictObject({
	chunks: Type.Array(TerminalOutputChunkSchema),
	nextSeq: Type.Integer({ minimum: 1 }),
	status: TerminalStatusSchema,
	replayCursor: Type.Integer({ minimum: 0 }),
});
export type TerminalReplayResult = Static<typeof TerminalReplayResultSchema>;
