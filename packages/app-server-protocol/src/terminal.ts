import { type Static, Type } from "@sinclair/typebox";
import { ProjectIdSchema, TerminalIdSchema, WorktreeIdSchema } from "./ids";

export const TerminalStatusSchema = Type.Union([
	Type.Literal("starting"),
	Type.Literal("running"),
	Type.Literal("exited"),
	Type.Literal("killed"),
	Type.Literal("error"),
]);
export type TerminalStatus = Static<typeof TerminalStatusSchema>;

export const TerminalSnapshotSchema = Type.Object({
	terminalId: TerminalIdSchema,
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	cwd: Type.String({ minLength: 1 }),
	cols: Type.Integer({ minimum: 20, maximum: 400 }),
	rows: Type.Integer({ minimum: 5, maximum: 200 }),
	status: TerminalStatusSchema,
	history: Type.String(),
	updatedAt: Type.String({ minLength: 1 }),
});
export type TerminalSnapshot = Static<typeof TerminalSnapshotSchema>;
