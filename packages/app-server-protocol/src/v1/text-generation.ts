import { type Static, type TSchema, Type } from "@sinclair/typebox";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

const TextGenerationContextSchema = StrictObject({
	message: Type.Optional(Type.String()),
	diff: Type.Optional(Type.String()),
	files: Type.Optional(Type.Array(Type.String())),
	model: Type.Optional(Type.String()),
	effort: Type.Optional(Type.String()),
	fastMode: Type.Optional(Type.Boolean()),
});

export const TextGenerateThreadTitleParamsSchema = TextGenerationContextSchema;
export const TextGenerateThreadTitleResultSchema = StrictObject({
	title: Type.String({ minLength: 1, maxLength: 120 }),
});
export const TextGenerateBranchNameParamsSchema = TextGenerationContextSchema;
export const TextGenerateBranchNameResultSchema = StrictObject({
	branch: Type.String({ minLength: 1, maxLength: 80 }),
});
export const TextGenerateCommitMessageParamsSchema = TextGenerationContextSchema;
export const TextGenerateCommitMessageResultSchema = StrictObject({
	subject: Type.String({ minLength: 1, maxLength: 120 }),
	body: Type.Optional(Type.String()),
});
export const TextGeneratePrContentParamsSchema = TextGenerationContextSchema;
export const TextGeneratePrContentResultSchema = StrictObject({
	title: Type.String({ minLength: 1, maxLength: 120 }),
	body: Type.String({ minLength: 1 }),
});

export type TextGenerateThreadTitleParams = Static<typeof TextGenerateThreadTitleParamsSchema>;
export type TextGenerateThreadTitleResult = Static<typeof TextGenerateThreadTitleResultSchema>;
export type TextGenerateBranchNameParams = Static<typeof TextGenerateBranchNameParamsSchema>;
export type TextGenerateBranchNameResult = Static<typeof TextGenerateBranchNameResultSchema>;
export type TextGenerateCommitMessageParams = Static<typeof TextGenerateCommitMessageParamsSchema>;
export type TextGenerateCommitMessageResult = Static<typeof TextGenerateCommitMessageResultSchema>;
export type TextGeneratePrContentParams = Static<typeof TextGeneratePrContentParamsSchema>;
export type TextGeneratePrContentResult = Static<typeof TextGeneratePrContentResultSchema>;
