import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { DiffIdSchema, TerminalIdSchema, ThreadIdSchema } from "../ids";
import { ReplayCursorSchema, ReplayDirectionSchema } from "./replay";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

const PayloadIdSchema = Type.String({ minLength: 1 });
const ContentTypeSchema = Type.String({ minLength: 1 });

export const TerminalOutputPayloadRefSchema = StrictObject({
	kind: Type.Literal("terminal-output"),
	terminalId: TerminalIdSchema,
	cursor: ReplayCursorSchema,
	byteLength: Type.Integer({ minimum: 0 }),
});
export type TerminalOutputPayloadRef = Static<typeof TerminalOutputPayloadRefSchema>;

export const DiffContentPayloadRefSchema = StrictObject({
	kind: Type.Literal("diff-content"),
	diffId: DiffIdSchema,
	filePath: Type.Optional(Type.String({ minLength: 1 })),
	byteLength: Type.Integer({ minimum: 0 }),
	contentHash: Type.Optional(Type.String({ minLength: 1 })),
});
export type DiffContentPayloadRef = Static<typeof DiffContentPayloadRefSchema>;

export const ToolOutputPayloadRefSchema = StrictObject({
	kind: Type.Literal("tool-output"),
	toolCallId: PayloadIdSchema,
	cursor: Type.Optional(ReplayCursorSchema),
	byteLength: Type.Integer({ minimum: 0 }),
	contentType: Type.Optional(ContentTypeSchema),
});
export type ToolOutputPayloadRef = Static<typeof ToolOutputPayloadRefSchema>;

export const AuditDetailPayloadRefSchema = StrictObject({
	kind: Type.Literal("audit-detail"),
	auditId: PayloadIdSchema,
	byteLength: Type.Integer({ minimum: 0 }),
	contentType: Type.Optional(ContentTypeSchema),
});
export type AuditDetailPayloadRef = Static<typeof AuditDetailPayloadRefSchema>;

export const PayloadReferenceSchema = Type.Union([
	TerminalOutputPayloadRefSchema,
	DiffContentPayloadRefSchema,
	ToolOutputPayloadRefSchema,
	AuditDetailPayloadRefSchema,
]);
export type PayloadReference = Static<typeof PayloadReferenceSchema>;

const PayloadWindowFields = {
	threadId: ThreadIdSchema,
	after: Type.Optional(ReplayCursorSchema),
	before: Type.Optional(ReplayCursorSchema),
	direction: Type.Optional(ReplayDirectionSchema),
	limit: Type.Integer({ minimum: 1, maximum: 500 }),
} satisfies Record<string, TSchema>;

const PayloadWindowCursorResultFields = {
	nextCursor: Type.Optional(ReplayCursorSchema),
	previousCursor: Type.Optional(ReplayCursorSchema),
	hasMoreAfter: Type.Boolean(),
	hasMoreBefore: Type.Boolean(),
} satisfies Record<string, TSchema>;

export const TerminalOutputWindowParamsSchema = StrictObject({
	...PayloadWindowFields,
	terminalId: TerminalIdSchema,
});
export type TerminalOutputWindowParams = Static<typeof TerminalOutputWindowParamsSchema>;

export const TerminalOutputChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	text: Type.String(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type TerminalOutputChunk = Static<typeof TerminalOutputChunkSchema>;

export const TerminalOutputWindowResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	terminalId: TerminalIdSchema,
	chunks: Type.Array(TerminalOutputChunkSchema),
	...PayloadWindowCursorResultFields,
});
export type TerminalOutputWindowResult = Static<typeof TerminalOutputWindowResultSchema>;

export const DiffContentWindowParamsSchema = StrictObject({
	...PayloadWindowFields,
	diffId: DiffIdSchema,
	filePath: Type.Optional(Type.String({ minLength: 1 })),
});
export type DiffContentWindowParams = Static<typeof DiffContentWindowParamsSchema>;

export const DiffContentChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	filePath: Type.String({ minLength: 1 }),
	hunk: Type.String(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type DiffContentChunk = Static<typeof DiffContentChunkSchema>;

export const DiffContentWindowResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	diffId: DiffIdSchema,
	chunks: Type.Array(DiffContentChunkSchema),
	...PayloadWindowCursorResultFields,
});
export type DiffContentWindowResult = Static<typeof DiffContentWindowResultSchema>;

export const ToolOutputWindowParamsSchema = StrictObject({
	...PayloadWindowFields,
	toolCallId: PayloadIdSchema,
});
export type ToolOutputWindowParams = Static<typeof ToolOutputWindowParamsSchema>;

export const ToolOutputChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	text: Type.String(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type ToolOutputChunk = Static<typeof ToolOutputChunkSchema>;

export const ToolOutputWindowResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	toolCallId: PayloadIdSchema,
	chunks: Type.Array(ToolOutputChunkSchema),
	...PayloadWindowCursorResultFields,
});
export type ToolOutputWindowResult = Static<typeof ToolOutputWindowResultSchema>;

export const AuditDetailWindowParamsSchema = StrictObject({
	...PayloadWindowFields,
	auditId: PayloadIdSchema,
});
export type AuditDetailWindowParams = Static<typeof AuditDetailWindowParamsSchema>;

export const AuditDetailChunkSchema = StrictObject({
	cursor: ReplayCursorSchema,
	data: Type.Unknown(),
	byteLength: Type.Integer({ minimum: 0 }),
});
export type AuditDetailChunk = Static<typeof AuditDetailChunkSchema>;

export const AuditDetailWindowResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	auditId: PayloadIdSchema,
	chunks: Type.Array(AuditDetailChunkSchema),
	...PayloadWindowCursorResultFields,
});
export type AuditDetailWindowResult = Static<typeof AuditDetailWindowResultSchema>;

export const PayloadWindowParamsSchema = Type.Union([
	TerminalOutputWindowParamsSchema,
	DiffContentWindowParamsSchema,
	ToolOutputWindowParamsSchema,
	AuditDetailWindowParamsSchema,
]);
export type PayloadWindowParams = Static<typeof PayloadWindowParamsSchema>;

export const PayloadWindowResultSchema = Type.Union([
	TerminalOutputWindowResultSchema,
	DiffContentWindowResultSchema,
	ToolOutputWindowResultSchema,
	AuditDetailWindowResultSchema,
]);
export type PayloadWindowResult = Static<typeof PayloadWindowResultSchema>;
