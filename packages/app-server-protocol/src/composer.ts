import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, SessionIdSchema, WorktreeIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ComposerAttachmentKindSchema = Type.Union([
	Type.Literal("image"),
	Type.Literal("text"),
	Type.Literal("file"),
]);
export type ComposerAttachmentKind = Static<typeof ComposerAttachmentKindSchema>;

export const ComposerAttachmentSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	kind: ComposerAttachmentKindSchema,
	filename: Type.String({ minLength: 1 }),
	mimeType: Type.Optional(Type.String()),
	size: Type.Integer({ minimum: 0 }),
	path: Type.Optional(Type.String()),
});
export type ComposerAttachment = Static<typeof ComposerAttachmentSchema>;

export const ComposerFileSearchParamsSchema = StrictObject({
	projectId: ProjectIdSchema,
	worktreeId: Type.Optional(WorktreeIdSchema),
	query: Type.String(),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
export type ComposerFileSearchParams = Static<typeof ComposerFileSearchParamsSchema>;

export const ComposerFileSearchItemSchema = StrictObject({
	path: Type.String({ minLength: 1 }),
	label: Type.String({ minLength: 1 }),
	kind: Type.Union([Type.Literal("file"), Type.Literal("directory")]),
	extension: Type.Optional(Type.String()),
});
export type ComposerFileSearchItem = Static<typeof ComposerFileSearchItemSchema>;

export const ComposerFileSearchResultSchema = StrictObject({ files: Type.Array(ComposerFileSearchItemSchema) });
export type ComposerFileSearchResult = Static<typeof ComposerFileSearchResultSchema>;

export const ComposerCommandListParamsSchema = StrictObject({ sessionId: Type.Optional(SessionIdSchema) });
export type ComposerCommandListParams = Static<typeof ComposerCommandListParamsSchema>;

export const ComposerCommandSummarySchema = StrictObject({
	name: Type.String({ minLength: 1 }),
	label: Type.String({ minLength: 1 }),
	description: Type.Optional(Type.String()),
	source: Type.Union([
		Type.Literal("extension"),
		Type.Literal("prompt-template"),
		Type.Literal("skill"),
		Type.Literal("built-in"),
	]),
});
export type ComposerCommandSummary = Static<typeof ComposerCommandSummarySchema>;

export const ComposerCommandListResultSchema = StrictObject({ commands: Type.Array(ComposerCommandSummarySchema) });
export type ComposerCommandListResult = Static<typeof ComposerCommandListResultSchema>;

export const ComposerAttachmentSaveParamsSchema = StrictObject({
	sessionId: Type.Optional(SessionIdSchema),
	filename: Type.String({ minLength: 1 }),
	mimeType: Type.Optional(Type.String()),
	dataBase64: Type.String({ minLength: 1 }),
});
export type ComposerAttachmentSaveParams = Static<typeof ComposerAttachmentSaveParamsSchema>;

export const ComposerAttachmentResultSchema = StrictObject({ attachment: ComposerAttachmentSchema });
export type ComposerAttachmentResult = Static<typeof ComposerAttachmentResultSchema>;
