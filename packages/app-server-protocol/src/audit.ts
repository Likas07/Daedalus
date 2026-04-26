import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { SessionIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const AuditEntryKindSchema = Type.Union([
	Type.Literal("transcript"),
	Type.Literal("tool"),
	Type.Literal("approval"),
	Type.Literal("file-edit"),
	Type.Literal("diff"),
	Type.Literal("terminal"),
	Type.Literal("git"),
	Type.Literal("pr"),
	Type.Literal("diagnostic"),
	Type.Literal("extension"),
	Type.Literal("automation"),
]);
export type AuditEntryKind = Static<typeof AuditEntryKindSchema>;

export const AutomationRuleKindSchema = Type.Union([
	Type.Literal("background-agent"),
	Type.Literal("post-run-review"),
	Type.Literal("test-status"),
	Type.Literal("cleanup"),
]);
export type AutomationRuleKind = Static<typeof AutomationRuleKindSchema>;

export const AuditEntrySchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	ts: Type.String({ minLength: 1 }),
	kind: AuditEntryKindSchema,
	title: Type.String(),
	summary: Type.String(),
	sessionId: Type.Optional(SessionIdSchema),
	actor: Type.Optional(Type.String()),
	target: Type.Optional(Type.String()),
	destructive: Type.Optional(Type.Boolean()),
	metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type AuditEntry = Static<typeof AuditEntrySchema>;

export const AuditTrailProjectionSchema = StrictObject({
	entries: Type.Array(AuditEntrySchema),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type AuditTrailProjection = Static<typeof AuditTrailProjectionSchema>;

export const AutomationRuleSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	kind: AutomationRuleKindSchema,
	title: Type.String(),
	description: Type.String(),
	enabled: Type.Boolean(),
	requiresConfirmation: Type.Boolean(),
	destructive: Type.Optional(Type.Boolean()),
});
export type AutomationRule = Static<typeof AutomationRuleSchema>;

export const AutomationProjectionSchema = StrictObject({
	rules: Type.Array(AutomationRuleSchema),
	suggestions: Type.Array(AuditEntrySchema),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type AutomationProjection = Static<typeof AutomationProjectionSchema>;

export const AuditQuerySchema = StrictObject({
	sessionId: Type.Optional(SessionIdSchema),
	kinds: Type.Optional(Type.Array(AuditEntryKindSchema)),
	text: Type.Optional(Type.String()),
	limit: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type AuditQuery = Static<typeof AuditQuerySchema>;
