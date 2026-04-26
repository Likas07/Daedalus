import { type Static, Type } from "@sinclair/typebox";

export const AccessModeSchema = Type.Union([
	Type.Literal("supervised"),
	Type.Literal("auto-accept"),
	Type.Literal("unrestricted"),
]);
export type AccessMode = Static<typeof AccessModeSchema>;

export const AccessPolicySchema = Type.Object({
	mode: AccessModeSchema,
	autoApproveSoftPrompts: Type.Boolean(),
	bypassHardBlocks: Type.Literal(false),
	auditRequired: Type.Literal(true),
});
export type AccessPolicy = Static<typeof AccessPolicySchema>;
