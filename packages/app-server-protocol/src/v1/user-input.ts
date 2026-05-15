import { type Static, type TSchema, Type } from "@sinclair/typebox";
import {
	ExtensionIdSchema,
	ExtensionUiRequestIdSchema,
	ThreadIdSchema,
	TurnIdSchema,
	WorkspaceTargetIdSchema,
} from "../ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const UserInputFieldTypeSchema = Type.Union([
	Type.Literal("text"),
	Type.Literal("textarea"),
	Type.Literal("password"),
	Type.Literal("number"),
	Type.Literal("boolean"),
	Type.Literal("select"),
]);
export type UserInputFieldType = Static<typeof UserInputFieldTypeSchema>;

export const UserInputFieldSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	label: Type.String(),
	type: UserInputFieldTypeSchema,
	required: Type.Optional(Type.Boolean()),
	placeholder: Type.Optional(Type.String()),
	defaultValue: Type.Optional(Type.Unknown()),
	options: Type.Optional(
		Type.Array(
			StrictObject({
				label: Type.String(),
				value: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
			}),
		),
	),
});
export type UserInputField = Static<typeof UserInputFieldSchema>;

export const UserInputActionSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	label: Type.String(),
	style: Type.Optional(Type.Union([Type.Literal("primary"), Type.Literal("secondary"), Type.Literal("danger")])),
});
export type UserInputAction = Static<typeof UserInputActionSchema>;

export const UserInputRequestSchema = StrictObject({
	inputId: ExtensionUiRequestIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	extensionId: ExtensionIdSchema,
	title: Type.String(),
	description: Type.Optional(Type.String()),
	fields: Type.Array(UserInputFieldSchema),
	actions: Type.Array(UserInputActionSchema),
	createdAt: Type.String({ minLength: 1 }),
});
export type UserInputRequest = Static<typeof UserInputRequestSchema>;

export const UserInputResponseParamsSchema = StrictObject({
	inputId: ExtensionUiRequestIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	actionId: Type.String({ minLength: 1 }),
	values: Type.Record(Type.String(), Type.Unknown()),
	idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
});
export type UserInputResponseParams = Static<typeof UserInputResponseParamsSchema>;

export const UserInputResponseRecordSchema = StrictObject({
	inputId: ExtensionUiRequestIdSchema,
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	actionId: Type.String({ minLength: 1 }),
	values: Type.Record(Type.String(), Type.Unknown()),
	respondedAt: Type.String({ minLength: 1 }),
});
export type UserInputResponseRecord = Static<typeof UserInputResponseRecordSchema>;

export const UserInputFailureCodeSchema = Type.Union([
	Type.Literal("stale"),
	Type.Literal("duplicate"),
	Type.Literal("wrong-thread"),
	Type.Literal("not-found"),
]);
export type UserInputFailureCode = Static<typeof UserInputFailureCodeSchema>;

export const UserInputFailureSchema = StrictObject({
	ok: Type.Literal(false),
	code: UserInputFailureCodeSchema,
	inputId: ExtensionUiRequestIdSchema,
	threadId: ThreadIdSchema,
	workspaceTargetId: WorkspaceTargetIdSchema,
	message: Type.String({ minLength: 1 }),
	requestThreadId: Type.Optional(ThreadIdSchema),
});
export type UserInputFailure = Static<typeof UserInputFailureSchema>;

export const UserInputResponseSuccessSchema = StrictObject({
	ok: Type.Literal(true),
	response: UserInputResponseRecordSchema,
});
export type UserInputResponseSuccess = Static<typeof UserInputResponseSuccessSchema>;

export const UserInputResponseResultSchema = Type.Union([UserInputResponseSuccessSchema, UserInputFailureSchema]);
export type UserInputResponseResult = Static<typeof UserInputResponseResultSchema>;

export const UserInputRequestNotificationSchema = StrictObject({
	threadId: ThreadIdSchema,
	turnId: Type.Optional(TurnIdSchema),
	workspaceTargetId: WorkspaceTargetIdSchema,
	request: UserInputRequestSchema,
});
export type UserInputRequestNotification = Static<typeof UserInputRequestNotificationSchema>;
