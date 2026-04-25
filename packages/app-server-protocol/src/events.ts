import { type Static, Type } from "@sinclair/typebox";
import { EventIdSchema, SessionIdSchema } from "./ids";

export const EventCursorSchema = Type.Object({
	after: Type.Optional(EventIdSchema),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});
export type EventCursor = Static<typeof EventCursorSchema>;

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
