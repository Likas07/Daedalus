import { type Static, Type } from "@sinclair/typebox";
import { ProjectIdSchema, SessionIdSchema, WorktreeIdSchema } from "./ids";

export const ComposerAttachmentKindSchema = Type.Union([
	Type.Literal("image"),
	Type.Literal("text"),
	Type.Literal("file"),
]);
export type ComposerAttachmentKind = Static<typeof ComposerAttachmentKindSchema>;

export const ComposerAttachmentSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	kind: ComposerAttachmentKindSchema,
	filename: Type.String({ minLength: 1 }),
	mimeType: Type.Optional(Type.String()),
	size: Type.Integer({ minimum: 0 }),
	path: Type.Optional(Type.String()),
});
export type ComposerAttachment = Static<typeof ComposerAttachmentSchema>;

export const ComposerFileSearchParamsSchema = Type.Object({
	projectId: ProjectIdSchema,
	worktreeId: Type.Optional(WorktreeIdSchema),
	query: Type.String(),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
export type ComposerFileSearchParams = Static<typeof ComposerFileSearchParamsSchema>;

export const ComposerCommandListParamsSchema = Type.Object({ sessionId: Type.Optional(SessionIdSchema) });
export type ComposerCommandListParams = Static<typeof ComposerCommandListParamsSchema>;

export const ComposerAttachmentSaveParamsSchema = Type.Object({
	sessionId: Type.Optional(SessionIdSchema),
	filename: Type.String({ minLength: 1 }),
	mimeType: Type.Optional(Type.String()),
	dataBase64: Type.String({ minLength: 1 }),
});
export type ComposerAttachmentSaveParams = Static<typeof ComposerAttachmentSaveParamsSchema>;
