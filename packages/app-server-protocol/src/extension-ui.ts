import { type Static, Type } from "@sinclair/typebox";
import { ExtensionIdSchema, ExtensionUiRequestIdSchema, SessionIdSchema } from "./ids";

export const ExtensionUiFieldSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	label: Type.String(),
	type: Type.Union([
		Type.Literal("text"),
		Type.Literal("textarea"),
		Type.Literal("password"),
		Type.Literal("number"),
		Type.Literal("boolean"),
		Type.Literal("select"),
	]),
	required: Type.Optional(Type.Boolean()),
	placeholder: Type.Optional(Type.String()),
	defaultValue: Type.Optional(Type.Unknown()),
	options: Type.Optional(
		Type.Array(
			Type.Object({
				label: Type.String(),
				value: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
			}),
		),
	),
});
export type ExtensionUiField = Static<typeof ExtensionUiFieldSchema>;

export const ExtensionUiRequestSchema = Type.Object({
	requestId: ExtensionUiRequestIdSchema,
	extensionId: ExtensionIdSchema,
	sessionId: Type.Optional(SessionIdSchema),
	title: Type.String(),
	description: Type.Optional(Type.String()),
	fields: Type.Array(ExtensionUiFieldSchema),
	actions: Type.Array(
		Type.Object({
			id: Type.String({ minLength: 1 }),
			label: Type.String(),
			style: Type.Optional(Type.Union([Type.Literal("primary"), Type.Literal("secondary"), Type.Literal("danger")])),
		}),
	),
});
export type ExtensionUiRequest = Static<typeof ExtensionUiRequestSchema>;

export const ExtensionUiResponseSchema = Type.Object({
	requestId: ExtensionUiRequestIdSchema,
	actionId: Type.String({ minLength: 1 }),
	values: Type.Record(Type.String(), Type.Unknown()),
});
export type ExtensionUiResponse = Static<typeof ExtensionUiResponseSchema>;
