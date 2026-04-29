import { type Static, Type } from "@sinclair/typebox";
import { SessionIdSchema } from "./ids";
import { WorkflowRunsInTargetSchema, WorkflowValidationStatusSchema } from "./workflow";

export const SessionStoreSummarySchema = Type.Object({
	id: SessionIdSchema,
	cwd: Type.String(),
	name: Type.Optional(Type.String()),
	title: Type.Optional(Type.String()),
	parentSessionPath: Type.Optional(Type.String()),
	parentSessionId: Type.Optional(SessionIdSchema),
	projectId: Type.Optional(Type.String()),
	worktreeId: Type.Optional(Type.String()),
	worktreePath: Type.Optional(Type.String()),
	branch: Type.Optional(Type.String()),
	runsIn: Type.Optional(WorkflowRunsInTargetSchema),
	validationStatus: Type.Optional(WorkflowValidationStatusSchema),
	needsAttentionReason: Type.Optional(Type.String({ minLength: 1 })),
	created: Type.String(),
	modified: Type.String(),
	updatedAt: Type.Optional(Type.String()),
	messageCount: Type.Integer({ minimum: 0 }),
	firstMessage: Type.String(),
	latestMessage: Type.Optional(Type.String()),
	allMessagesText: Type.String(),
	status: Type.Optional(Type.String()),
	activeTurnId: Type.Optional(Type.String()),
	pendingApprovalCount: Type.Optional(Type.Integer({ minimum: 0 })),
	pendingUserInput: Type.Optional(Type.Boolean()),
	archived: Type.Optional(Type.Boolean()),
});
export type SessionStoreSummary = Static<typeof SessionStoreSummarySchema>;

export const SessionListParamsSchema = Type.Object({
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	includeArchived: Type.Optional(Type.Boolean()),
	limit: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type SessionListParams = Static<typeof SessionListParamsSchema>;

export const SessionListResultSchema = Type.Object({ sessions: Type.Array(SessionStoreSummarySchema) });
export type SessionListResult = Static<typeof SessionListResultSchema>;

export const SessionImportJsonlParamsSchema = Type.Object({
	content: Type.String({ minLength: 1 }),
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	overwrite: Type.Optional(Type.Boolean()),
});
export type SessionImportJsonlParams = Static<typeof SessionImportJsonlParamsSchema>;

export const SessionImportJsonlResultSchema = Type.Object({ sessionId: SessionIdSchema });
export type SessionImportJsonlResult = Static<typeof SessionImportJsonlResultSchema>;

export const SessionExportJsonlParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type SessionExportJsonlParams = Static<typeof SessionExportJsonlParamsSchema>;
export const SessionExportJsonlResultSchema = Type.Object({ content: Type.String(), filename: Type.String() });
export type SessionExportJsonlResult = Static<typeof SessionExportJsonlResultSchema>;

export const SessionExportHtmlParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type SessionExportHtmlParams = Static<typeof SessionExportHtmlParamsSchema>;
export const SessionExportHtmlResultSchema = Type.Object({ content: Type.String(), filename: Type.String() });
export type SessionExportHtmlResult = Static<typeof SessionExportHtmlResultSchema>;

export const SessionResumeIdentityStatusSchema = Type.Union([
	Type.Literal("matched"),
	Type.Literal("mismatched"),
	Type.Literal("missing"),
	Type.Literal("unknown"),
]);
export type SessionResumeIdentityStatus = Static<typeof SessionResumeIdentityStatusSchema>;

export const SessionResumeIdentitySchema = Type.Object({
	status: SessionResumeIdentityStatusSchema,
	sessionId: SessionIdSchema,
	storedCwd: Type.Optional(Type.String({ minLength: 1 })),
	currentCwd: Type.Optional(Type.String({ minLength: 1 })),
	storedProjectId: Type.Optional(Type.String({ minLength: 1 })),
	currentProjectId: Type.Optional(Type.String({ minLength: 1 })),
	storedWorktreeId: Type.Optional(Type.String({ minLength: 1 })),
	currentWorktreeId: Type.Optional(Type.String({ minLength: 1 })),
	storedCanonicalPath: Type.Optional(Type.String({ minLength: 1 })),
	currentCanonicalPath: Type.Optional(Type.String({ minLength: 1 })),
	storedBranch: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
	currentBranch: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
	storedIsolationMode: Type.Optional(Type.String({ minLength: 1 })),
	currentIsolationMode: Type.Optional(Type.String({ minLength: 1 })),
	storedSessionFile: Type.Optional(Type.String({ minLength: 1 })),
	currentSessionFile: Type.Optional(Type.String({ minLength: 1 })),
	message: Type.Optional(Type.String({ minLength: 1 })),
});
export type SessionResumeIdentity = Static<typeof SessionResumeIdentitySchema>;

export const SessionResumeParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	prompt: Type.Optional(Type.String()),
});
export type SessionResumeParams = Static<typeof SessionResumeParamsSchema>;
export const SessionResumeResultSchema = Type.Object({
	sessionId: SessionIdSchema,
	status: Type.String(),
	identity: Type.Optional(SessionResumeIdentitySchema),
});
export type SessionResumeResult = Static<typeof SessionResumeResultSchema>;

export const SessionForkParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	prompt: Type.Optional(Type.String()),
});
export type SessionForkParams = Static<typeof SessionForkParamsSchema>;
export const SessionForkResultSchema = Type.Object({ sessionId: SessionIdSchema, status: Type.String() });
export type SessionForkResult = Static<typeof SessionForkResultSchema>;

export const SessionRenameParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	name: Type.Optional(Type.String()),
});
export type SessionRenameParams = Static<typeof SessionRenameParamsSchema>;
export const SessionMutationResultSchema = Type.Object({ ok: Type.Boolean() });
export type SessionMutationResult = Static<typeof SessionMutationResultSchema>;

export const SessionArchiveParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	archived: Type.Optional(Type.Boolean()),
});
export type SessionArchiveParams = Static<typeof SessionArchiveParamsSchema>;
export const SessionDeleteParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type SessionDeleteParams = Static<typeof SessionDeleteParamsSchema>;

export const SessionStatsParamsSchema = Type.Object({ sessionId: Type.Optional(SessionIdSchema) });
export type SessionStatsParams = Static<typeof SessionStatsParamsSchema>;
export const SessionStatsResultSchema = Type.Object({
	sessionCount: Type.Integer({ minimum: 0 }),
	archivedCount: Type.Integer({ minimum: 0 }),
	messageCount: Type.Integer({ minimum: 0 }),
});
export type SessionStatsResult = Static<typeof SessionStatsResultSchema>;

export const SessionTreeParamsSchema = Type.Object({
	rootSessionId: Type.Optional(SessionIdSchema),
	includeArchived: Type.Optional(Type.Boolean()),
});
export type SessionTreeParams = Static<typeof SessionTreeParamsSchema>;
export const SessionTreeNodeSchema = Type.Recursive((Self) =>
	Type.Object({ session: SessionStoreSummarySchema, children: Type.Array(Self) }),
);
export const SessionTreeResultSchema = Type.Object({ roots: Type.Array(SessionTreeNodeSchema) });
export type SessionTreeResult = Static<typeof SessionTreeResultSchema>;
