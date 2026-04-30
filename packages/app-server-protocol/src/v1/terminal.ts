import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { TerminalIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";
import { ReplayCursorSchema, ReplayDirectionSchema, ReplayWindowCursorsSchema } from "./replay";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const TerminalContextStatusSchema = Type.Union([
	Type.Literal("opening"),
	Type.Literal("open"),
	Type.Literal("running"),
	Type.Literal("idle"),
	Type.Literal("closing"),
	Type.Literal("closed"),
	Type.Literal("killed"),
	Type.Literal("guard-blocked"),
	Type.Literal("error"),
]);
export type TerminalContextStatus = Static<typeof TerminalContextStatusSchema>;

export const TerminalGuardCodeSchema = Type.Union([
	Type.Literal("workspace-target-blocked"),
	Type.Literal("cwd-outside-workspace"),
	Type.Literal("command-blocked"),
	Type.Literal("terminal-disabled"),
]);
export type TerminalGuardCode = Static<typeof TerminalGuardCodeSchema>;

export const TerminalErrorCodeSchema = Type.Union([
	TerminalGuardCodeSchema,
	Type.Literal("killed"),
	Type.Literal("not-found"),
	Type.Literal("wrong-thread"),
	Type.Literal("io-error"),
]);
export type TerminalErrorCode = Static<typeof TerminalErrorCodeSchema>;

const TerminalScopeFields = {
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
} satisfies Record<string, TSchema>;

export const TerminalContextReferenceSchema = StrictObject({
	kind: Type.Literal("terminal-context"),
	...TerminalScopeFields,
});
export type TerminalContextReference = Static<typeof TerminalContextReferenceSchema>;

export const TerminalGuardErrorSchema = StrictObject({
	code: TerminalGuardCodeSchema,
	message: Type.String({ minLength: 1 }),
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
});
export type TerminalGuardError = Static<typeof TerminalGuardErrorSchema>;

export const TerminalContextErrorSchema = StrictObject({
	code: TerminalErrorCodeSchema,
	message: Type.String({ minLength: 1 }),
});
export type TerminalContextError = Static<typeof TerminalContextErrorSchema>;

export const TerminalContextSchema = StrictObject({
	...TerminalScopeFields,
	title: Type.String({ minLength: 1 }),
	status: TerminalContextStatusSchema,
	cwd: Type.String({ minLength: 1 }),
	rows: Type.Integer({ minimum: 1, maximum: 1000 }),
	cols: Type.Integer({ minimum: 1, maximum: 1000 }),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.String({ minLength: 1 }),
	closedAt: Type.Optional(Type.String({ minLength: 1 })),
	killedAt: Type.Optional(Type.String({ minLength: 1 })),
	exitCode: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
	guard: Type.Optional(TerminalGuardErrorSchema),
	error: Type.Optional(TerminalContextErrorSchema),
	lastOutputCursor: Type.Optional(ReplayCursorSchema),
});
export type TerminalContext = Static<typeof TerminalContextSchema>;

export const TerminalOpenParamsSchema = StrictObject({
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	title: Type.Optional(Type.String({ minLength: 1 })),
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	rows: Type.Integer({ minimum: 1, maximum: 1000 }),
	cols: Type.Integer({ minimum: 1, maximum: 1000 }),
	route: Type.Union([Type.Literal("workspace-shell"), Type.Literal("agent-command")]),
	initialInput: Type.Optional(Type.String()),
});
export type TerminalOpenParams = Static<typeof TerminalOpenParamsSchema>;

export const TerminalInputParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	input: Type.String(),
});
export type TerminalInputParams = Static<typeof TerminalInputParamsSchema>;

export const TerminalResizeParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	rows: Type.Integer({ minimum: 1, maximum: 1000 }),
	cols: Type.Integer({ minimum: 1, maximum: 1000 }),
});
export type TerminalResizeParams = Static<typeof TerminalResizeParamsSchema>;

export const TerminalCloseParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	reason: Type.Optional(
		Type.Union([Type.Literal("user"), Type.Literal("turn-ended"), Type.Literal("guard"), Type.Literal("error")]),
	),
});
export type TerminalCloseParams = Static<typeof TerminalCloseParamsSchema>;

export const TerminalReplayParamsSchema = StrictObject({
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	after: Type.Optional(ReplayCursorSchema),
	before: Type.Optional(ReplayCursorSchema),
	direction: Type.Optional(ReplayDirectionSchema),
	limit: Type.Integer({ minimum: 1, maximum: 1000 }),
});
export type TerminalReplayParams = Static<typeof TerminalReplayParamsSchema>;

export const TerminalReplayOutputChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	text: Type.String(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type TerminalReplayOutputChunk = Static<typeof TerminalReplayOutputChunkSchema>;

export const TerminalFailureSchema = StrictObject({
	ok: Type.Literal(false),
	code: TerminalErrorCodeSchema,
	terminalId: Type.Optional(TerminalIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	message: Type.String({ minLength: 1 }),
	context: Type.Optional(TerminalContextReferenceSchema),
	guard: Type.Optional(TerminalGuardErrorSchema),
});
export type TerminalFailure = Static<typeof TerminalFailureSchema>;

export const TerminalContextSuccessSchema = StrictObject({
	ok: Type.Literal(true),
	context: TerminalContextSchema,
});
export type TerminalContextSuccess = Static<typeof TerminalContextSuccessSchema>;

export const TerminalCommandResultSchema = Type.Union([TerminalContextSuccessSchema, TerminalFailureSchema]);
export type TerminalCommandResult = Static<typeof TerminalCommandResultSchema>;

export const TerminalReplaySuccessSchema = StrictObject({
	ok: Type.Literal(true),
	context: TerminalContextSchema,
	chunks: Type.Array(TerminalReplayOutputChunkSchema),
	watermark: ReplayCursorSchema,
	...ReplayWindowCursorsSchema.properties,
});
export type TerminalReplaySuccess = Static<typeof TerminalReplaySuccessSchema>;

export const TerminalReplayResultSchema = Type.Union([TerminalReplaySuccessSchema, TerminalFailureSchema]);
export type TerminalReplayResult = Static<typeof TerminalReplayResultSchema>;

export const TerminalContextNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	terminal: TerminalContextReferenceSchema,
	status: TerminalContextStatusSchema,
});
export type TerminalContextNotification = Static<typeof TerminalContextNotificationSchema>;

export const TerminalOutputNotificationSchema = StrictObject({
	terminalId: TerminalIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	cursor: ReplayCursorSchema,
	byteLength: Type.Integer({ minimum: 0 }),
});
export type TerminalOutputNotification = Static<typeof TerminalOutputNotificationSchema>;
