import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { SessionIdSchema } from "./ids";
import { OrchestrationProjectionSchema } from "./orchestration";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const DaedalusTodoStatusSchema = Type.Union([
	Type.Literal("pending"),
	Type.Literal("in_progress"),
	Type.Literal("completed"),
	Type.Literal("blocked"),
	Type.Literal("cancelled"),
]);
export type DaedalusTodoStatus = Static<typeof DaedalusTodoStatusSchema>;

export const DaedalusPlanStatusSchema = Type.Union([
	Type.Literal("draft"),
	Type.Literal("ready"),
	Type.Literal("executing"),
	Type.Literal("completed"),
	Type.Literal("blocked"),
]);
export type DaedalusPlanStatus = Static<typeof DaedalusPlanStatusSchema>;

export const DaedalusQuestionStatusSchema = Type.Union([
	Type.Literal("open"),
	Type.Literal("answered"),
	Type.Literal("cancelled"),
]);
export type DaedalusQuestionStatus = Static<typeof DaedalusQuestionStatusSchema>;

export const DaedalusSemanticStatusSchema = Type.Union([
	Type.Literal("idle"),
	Type.Literal("indexing"),
	Type.Literal("ready"),
	Type.Literal("error"),
]);
export type DaedalusSemanticStatus = Static<typeof DaedalusSemanticStatusSchema>;

export const DaedalusTodoItemSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	title: Type.String(),
	status: DaedalusTodoStatusSchema,
	summary: Type.Optional(Type.String()),
	dependencies: Type.Array(Type.String({ minLength: 1 })),
});
export type DaedalusTodoItem = Static<typeof DaedalusTodoItemSchema>;

export const DaedalusPlanStateSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	title: Type.String(),
	status: DaedalusPlanStatusSchema,
	path: Type.Optional(Type.String()),
	taskIds: Type.Array(Type.String({ minLength: 1 })),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type DaedalusPlanState = Static<typeof DaedalusPlanStateSchema>;

export const DaedalusQuestionPromptSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	kind: Type.Union([Type.Literal("question"), Type.Literal("questionnaire")]),
	prompt: Type.String(),
	status: DaedalusQuestionStatusSchema,
	choices: Type.Array(Type.String()),
	answer: Type.Optional(Type.String()),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type DaedalusQuestionPrompt = Static<typeof DaedalusQuestionPromptSchema>;

export const DaedalusSemanticWorkspaceStateSchema = StrictObject({
	status: DaedalusSemanticStatusSchema,
	indexedPath: Type.Optional(Type.String()),
	indexName: Type.Optional(Type.String()),
	summary: Type.Optional(Type.String()),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type DaedalusSemanticWorkspaceState = Static<typeof DaedalusSemanticWorkspaceStateSchema>;

export const DaedalusWorkflowStateSchema = StrictObject({
	sessionId: SessionIdSchema,
	plans: Type.Array(DaedalusPlanStateSchema),
	todos: Type.Array(DaedalusTodoItemSchema),
	questions: Type.Array(DaedalusQuestionPromptSchema),
	semanticWorkspace: DaedalusSemanticWorkspaceStateSchema,
	orchestration: OrchestrationProjectionSchema,
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export type DaedalusWorkflowState = Static<typeof DaedalusWorkflowStateSchema>;
