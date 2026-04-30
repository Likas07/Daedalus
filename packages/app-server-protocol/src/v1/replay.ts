import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ThreadIdSchema } from "../ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ReplayCursorSchema = StrictObject({
	seq: Type.Integer({ minimum: 0 }),
});
export type ReplayCursor = Static<typeof ReplayCursorSchema>;

export const ReplayDirectionSchema = Type.Union([Type.Literal("forward"), Type.Literal("backward")]);
export type ReplayDirection = Static<typeof ReplayDirectionSchema>;

export const ThreadReplayParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	after: Type.Optional(ReplayCursorSchema),
	before: Type.Optional(ReplayCursorSchema),
	direction: Type.Optional(ReplayDirectionSchema),
	limit: Type.Integer({ minimum: 1, maximum: 500 }),
});
export type ThreadReplayParams = Static<typeof ThreadReplayParamsSchema>;

export const ReplayWindowCursorsSchema = StrictObject({
	nextCursor: Type.Optional(ReplayCursorSchema),
	previousCursor: Type.Optional(ReplayCursorSchema),
	hasMoreAfter: Type.Boolean(),
	hasMoreBefore: Type.Boolean(),
});
export type ReplayWindowCursors = Static<typeof ReplayWindowCursorsSchema>;
