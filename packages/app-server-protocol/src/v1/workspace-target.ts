import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, WorkspaceTargetIdSchema, WorktreeIdSchema } from "../ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);

export const SafetySignalLevelSchema = Type.Union([
	Type.Literal("info"),
	Type.Literal("warning"),
	Type.Literal("blocked"),
]);
export type SafetySignalLevel = Static<typeof SafetySignalLevelSchema>;

export const SafetySignalSchema = StrictObject({
	level: SafetySignalLevelSchema,
	message: Type.String({ minLength: 1 }),
	code: Type.Optional(Type.String({ minLength: 1 })),
});
export type SafetySignal = Static<typeof SafetySignalSchema>;

export const WorkspaceTargetKindSchema = Type.Union([Type.Literal("base-checkout"), Type.Literal("worktree")]);
export type WorkspaceTargetKind = Static<typeof WorkspaceTargetKindSchema>;

export const WorkspaceTargetValidationStatusSchema = Type.Union([
	Type.Literal("valid"),
	Type.Literal("needs-confirmation"),
	Type.Literal("needs-attention"),
	Type.Literal("blocked"),
	Type.Literal("unknown"),
]);
export type WorkspaceTargetValidationStatus = Static<typeof WorkspaceTargetValidationStatusSchema>;

export const WorkspaceTargetDirtyStateSchema = Type.Union([
	Type.Literal("clean"),
	Type.Literal("dirty"),
	Type.Literal("conflicted"),
	Type.Literal("unknown"),
]);
export type WorkspaceTargetDirtyState = Static<typeof WorkspaceTargetDirtyStateSchema>;

const WorkspaceTargetBaseFields = {
	id: WorkspaceTargetIdSchema,
	projectId: ProjectIdSchema,
	path: Type.String({ minLength: 1 }),
	branch: NullableStringSchema,
	validationStatus: WorkspaceTargetValidationStatusSchema,
	dirtyState: WorkspaceTargetDirtyStateSchema,
	activeThreadCount: Type.Integer({ minimum: 0 }),
	safetySignals: Type.Array(SafetySignalSchema),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
} satisfies Record<string, TSchema>;

export const BaseCheckoutWorkspaceTargetSchema = StrictObject({
	...WorkspaceTargetBaseFields,
	kind: Type.Literal("base-checkout"),
});
export type BaseCheckoutWorkspaceTarget = Static<typeof BaseCheckoutWorkspaceTargetSchema>;

export const WorktreeWorkspaceTargetSchema = StrictObject({
	...WorkspaceTargetBaseFields,
	kind: Type.Literal("worktree"),
	worktreeId: Type.Optional(WorktreeIdSchema),
	baseBranch: Type.Optional(NullableStringSchema),
});
export type WorktreeWorkspaceTarget = Static<typeof WorktreeWorkspaceTargetSchema>;

export const WorkspaceTargetSchema = Type.Union([BaseCheckoutWorkspaceTargetSchema, WorktreeWorkspaceTargetSchema]);
export type WorkspaceTarget = Static<typeof WorkspaceTargetSchema>;

export const WorkspaceTargetListParamsSchema = StrictObject({
	projectId: ProjectIdSchema,
});
export type WorkspaceTargetListParams = Static<typeof WorkspaceTargetListParamsSchema>;

export const WorkspaceTargetListResultSchema = StrictObject({
	targets: Type.Array(WorkspaceTargetSchema),
});
export type WorkspaceTargetListResult = Static<typeof WorkspaceTargetListResultSchema>;

export const WorkspaceTargetValidateParamsSchema = StrictObject({
	workspaceTargetId: WorkspaceTargetIdSchema,
});
export type WorkspaceTargetValidateParams = Static<typeof WorkspaceTargetValidateParamsSchema>;

export const WorkspaceTargetValidateResultSchema = StrictObject({
	workspaceTarget: WorkspaceTargetSchema,
});
export type WorkspaceTargetValidateResult = Static<typeof WorkspaceTargetValidateResultSchema>;
