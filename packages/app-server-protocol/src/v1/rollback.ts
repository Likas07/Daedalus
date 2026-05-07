import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { CheckpointIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ThreadRollbackParamsSchema = StrictObject({
	threadId: ThreadIdSchema,
	numTurns: Type.Integer({ minimum: 1 }),
	workspaceTargetId: WorkspaceTargetIdSchema,
	idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
});
export const ThreadRollbackResultSchema = StrictObject({
	threadId: ThreadIdSchema,
	restoredCheckpointId: CheckpointIdSchema,
	restoredToTurnId: Type.Optional(TurnIdSchema),
	status: Type.Union([Type.Literal("completed"), Type.Literal("approval-required")]),
	approvalId: Type.Optional(Type.String({ minLength: 1 })),
});
export type ThreadRollbackParams = Static<typeof ThreadRollbackParamsSchema>;
export type ThreadRollbackResult = Static<typeof ThreadRollbackResultSchema>;
