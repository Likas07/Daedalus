import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, SessionIdSchema, TerminalIdSchema, WorktreeIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);

export const WorkflowFileStatusSchema = Type.Union([
	Type.Literal("added"),
	Type.Literal("modified"),
	Type.Literal("deleted"),
	Type.Literal("renamed"),
	Type.Literal("copied"),
	Type.Literal("untracked"),
	Type.Literal("conflicted"),
]);
export type WorkflowFileStatus = Static<typeof WorkflowFileStatusSchema>;

export const WorkflowRiskGroupSchema = Type.Union([
	Type.Literal("source"),
	Type.Literal("tests"),
	Type.Literal("config"),
	Type.Literal("secrets"),
	Type.Literal("lockfiles"),
	Type.Literal("generated"),
	Type.Literal("docs"),
	Type.Literal("other"),
]);
export type WorkflowRiskGroup = Static<typeof WorkflowRiskGroupSchema>;

export const WorkflowTerminalStatusSchema = Type.Union([
	Type.Literal("running"),
	Type.Literal("exited"),
	Type.Literal("killed"),
]);
export type WorkflowTerminalStatus = Static<typeof WorkflowTerminalStatusSchema>;

export const WorkflowWorktreeMetadataSchema = StrictObject({
	id: WorktreeIdSchema,
	projectId: ProjectIdSchema,
	branch: NullableStringSchema,
	path: Type.String({ minLength: 1 }),
	baseBranch: Type.Optional(NullableStringSchema),
	status: Type.Optional(Type.String({ minLength: 1 })),
	upstream: Type.Optional(NullableStringSchema),
	dirty: Type.Boolean(),
	dirtyCount: Type.Integer({ minimum: 0 }),
	activeSessionCount: Type.Integer({ minimum: 0 }),
	cleanupRequiresConfirmation: Type.Boolean(),
	createdAt: Type.Optional(Type.String({ minLength: 1 })),
	updatedAt: Type.Optional(Type.String({ minLength: 1 })),
});
export interface WorkflowWorktreeMetadata {
	readonly id: Static<typeof WorktreeIdSchema>;
	readonly projectId: Static<typeof ProjectIdSchema>;
	readonly branch: string | null;
	readonly path: string;
	readonly baseBranch?: string | null;
	readonly status?: string;
	readonly upstream?: string | null;
	readonly dirty: boolean;
	readonly dirtyCount: number;
	readonly activeSessionCount: number;
	readonly cleanupRequiresConfirmation: boolean;
	readonly createdAt?: string;
	readonly updatedAt?: string;
}

export const WorkflowTerminalMetadataSchema = StrictObject({
	terminalId: TerminalIdSchema,
	projectId: Type.Optional(ProjectIdSchema),
	worktreeId: Type.Optional(WorktreeIdSchema),
	sessionId: Type.Optional(SessionIdSchema),
	cwd: Type.String({ minLength: 1 }),
	shell: Type.String({ minLength: 1 }),
	status: WorkflowTerminalStatusSchema,
	attached: Type.Boolean(),
	owner: Type.Optional(Type.String({ minLength: 1 })),
	replayCursor: Type.Integer({ minimum: 0 }),
	elapsedMs: Type.Integer({ minimum: 0 }),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.String({ minLength: 1 }),
});
export interface WorkflowTerminalMetadata {
	readonly terminalId: Static<typeof TerminalIdSchema>;
	readonly projectId?: Static<typeof ProjectIdSchema>;
	readonly worktreeId?: Static<typeof WorktreeIdSchema>;
	readonly sessionId?: Static<typeof SessionIdSchema>;
	readonly cwd: string;
	readonly shell: string;
	readonly status: WorkflowTerminalStatus;
	readonly attached: boolean;
	readonly owner?: string;
	readonly replayCursor: number;
	readonly elapsedMs: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export const WorkflowChangedFileSchema = StrictObject({
	path: Type.String({ minLength: 1 }),
	previousPath: Type.Optional(Type.String({ minLength: 1 })),
	status: WorkflowFileStatusSchema,
	staged: Type.Boolean(),
	insertions: Type.Integer({ minimum: 0 }),
	deletions: Type.Integer({ minimum: 0 }),
	riskGroup: WorkflowRiskGroupSchema,
});
export interface WorkflowChangedFile {
	readonly path: string;
	readonly previousPath?: string;
	readonly status: WorkflowFileStatus;
	readonly staged: boolean;
	readonly insertions: number;
	readonly deletions: number;
	readonly riskGroup: WorkflowRiskGroup;
}

export const WorkflowGitStatusSchema = StrictObject({
	branch: NullableStringSchema,
	upstream: NullableStringSchema,
	ahead: Type.Integer({ minimum: 0 }),
	behind: Type.Integer({ minimum: 0 }),
	stagedCount: Type.Integer({ minimum: 0 }),
	unstagedCount: Type.Integer({ minimum: 0 }),
	files: Type.Array(WorkflowChangedFileSchema),
});
export interface WorkflowGitStatus {
	readonly branch: string | null;
	readonly upstream: string | null;
	readonly ahead: number;
	readonly behind: number;
	readonly stagedCount: number;
	readonly unstagedCount: number;
	readonly files: readonly WorkflowChangedFile[];
}

export const WorkflowDiffSummarySchema = StrictObject({
	branch: NullableStringSchema,
	upstream: NullableStringSchema,
	ahead: Type.Integer({ minimum: 0 }),
	behind: Type.Integer({ minimum: 0 }),
	stagedCount: Type.Integer({ minimum: 0 }),
	unstagedCount: Type.Integer({ minimum: 0 }),
	files: Type.Array(WorkflowChangedFileSchema),
	patch: Type.Optional(Type.String()),
	riskyGroups: Type.Array(WorkflowRiskGroupSchema),
});
export interface WorkflowDiffSummary extends WorkflowGitStatus {
	readonly patch?: string;
	readonly riskyGroups: readonly WorkflowRiskGroup[];
}

export const SafeCommitInputSchema = StrictObject({
	cwd: Type.String({ minLength: 1 }),
	message: Type.String({ minLength: 1 }),
	allowWithActiveSessions: Type.Optional(Type.Boolean()),
	activeSessionCount: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type SafeCommitInput = Static<typeof SafeCommitInputSchema>;

export const SafeCommitResultSchema = StrictObject({
	committed: Type.Boolean(),
	commit: Type.Optional(Type.String({ minLength: 1 })),
	warnings: Type.Array(Type.String()),
});
export type SafeCommitResult = Static<typeof SafeCommitResultSchema>;

export const StageFilesInputSchema = StrictObject({
	cwd: Type.String({ minLength: 1 }),
	paths: Type.Array(Type.String({ minLength: 1 })),
});
export type StageFilesInput = Static<typeof StageFilesInputSchema>;
export type UnstageFilesInput = StageFilesInput;
