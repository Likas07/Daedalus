import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { AccessModeSchema, AccessPolicySchema } from "./access-policy";
import { AuditQuerySchema, AuditTrailProjectionSchema, AutomationProjectionSchema } from "./audit";
import {
	ComposerAttachmentResultSchema,
	ComposerAttachmentSaveParamsSchema,
	ComposerCommandListParamsSchema,
	ComposerCommandListResultSchema,
	ComposerFileSearchParamsSchema,
	ComposerFileSearchResultSchema,
} from "./composer";
import { DaedalusWorkflowStateSchema } from "./daedalus-workflow";
import { DiagnosticExportParamsSchema, DiagnosticExportResultSchema } from "./diagnostics";
import { EventReplayParamsSchema, EventReplayResultSchema } from "./events";
import { ExtensionUiRequestSchema, ExtensionUiResponseSchema } from "./extension-ui";
import {
	ApprovalIdSchema,
	CheckpointIdSchema,
	DiffIdSchema,
	ProjectIdSchema,
	ProtocolVersionSchema,
	RequestIdSchema,
	SessionIdSchema,
	TurnIdSchema,
	WorktreeIdSchema,
} from "./ids";
import {
	IntegrationConnectParamsSchema,
	IntegrationConnectResultSchema,
	IntegrationDisconnectParamsSchema,
	IntegrationDisconnectResultSchema,
	IntegrationImportParamsSchema,
	IntegrationListResultSchema,
	IntegrationManualLinkParamsSchema,
	IntegrationPullRequestCreateParamsSchema,
	IntegrationPullRequestCreateResultSchema,
	IntegrationPullRequestOpenParamsSchema,
	IntegrationPullRequestOpenResultSchema,
} from "./integration-messages";
import { OrchestrationProjectionSchema } from "./orchestration";
import {
	RuntimeAbortParamsSchema,
	RuntimeCommandsParamsSchema,
	RuntimeCompactParamsSchema,
	RuntimeControlResultSchemas,
	RuntimeCycleModelParamsSchema,
	RuntimeCycleThinkingParamsSchema,
	RuntimeKeybindingsParamsSchema,
	RuntimeReloadResourcesParamsSchema,
	RuntimeSetModelParamsSchema,
	RuntimeSetQueueModeParamsSchema,
	RuntimeSetThinkingParamsSchema,
	RuntimeSetToolsParamsSchema,
	RuntimeStateParamsSchema,
} from "./runtime-control";
import {
	SessionArchiveParamsSchema,
	SessionDeleteParamsSchema,
	SessionExportHtmlParamsSchema,
	SessionExportHtmlResultSchema,
	SessionExportJsonlParamsSchema,
	SessionExportJsonlResultSchema,
	SessionForkParamsSchema,
	SessionForkResultSchema,
	SessionImportJsonlParamsSchema,
	SessionImportJsonlResultSchema,
	SessionListParamsSchema,
	SessionListResultSchema,
	SessionMutationResultSchema,
	SessionRenameParamsSchema,
	SessionResumeParamsSchema,
	SessionResumeResultSchema,
	SessionStatsParamsSchema,
	SessionStatsResultSchema,
	SessionTreeParamsSchema,
	SessionTreeResultSchema,
} from "./session-store";
import {
	TerminalCreateParamsSchema,
	TerminalIdParamsSchema,
	TerminalInputParamsSchema,
	TerminalListParamsSchema,
	TerminalListResultSchema,
	TerminalReplayParamsSchema,
	TerminalReplayResultSchema,
	TerminalResizeParamsSchema,
	TerminalSnapshotResultSchema,
} from "./terminal";
import {
	RootBoundaryViolationSchema,
	WorkflowDiffSummarySchema,
	WorkflowRunsInTargetSchema,
	WorkflowWorktreeMetadataSchema,
	WorktreeCleanupRiskScanSchema,
	WorktreeConflictReasonSchema,
} from "./workflow";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const EmptyParamsSchema = StrictObject({});
export const EmptyResultSchema = StrictObject({});
const JsonObjectSchema = Type.Record(Type.String(), Type.Unknown());

const request = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	StrictObject({
		kind: Type.Literal("request"),
		id: RequestIdSchema,
		method: Type.Literal(method),
		params,
	});

const notification = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	StrictObject({
		kind: Type.Literal("notification"),
		method: Type.Literal(method),
		params,
	});

export const InitializeParamsSchema = StrictObject({
	protocolVersion: ProtocolVersionSchema,
	client: StrictObject({ name: Type.String({ minLength: 1 }), version: Type.Optional(Type.String()) }),
});
export type InitializeParams = Static<typeof InitializeParamsSchema>;

export const InitializeResultSchema = StrictObject({
	protocolVersion: ProtocolVersionSchema,
	server: StrictObject({ name: Type.String({ minLength: 1 }), version: Type.String() }),
	capabilities: Type.Record(Type.String(), Type.Boolean()),
});
export type InitializeResult = Static<typeof InitializeResultSchema>;

export const PromptContextParamsSchema = {
	attachmentIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	filePaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	model: Type.Optional(Type.String()),
	effort: Type.Optional(Type.String()),
	accessMode: Type.Optional(AccessModeSchema),
	mode: Type.Optional(Type.String()),
	fastMode: Type.Optional(Type.Boolean()),
	draftState: Type.Optional(JsonObjectSchema),
} satisfies Record<string, TSchema>;

export const SessionStartTargetSchema = Type.Union([
	StrictObject({
		mode: Type.Literal("isolated-worktree"),
		projectId: ProjectIdSchema,
		worktreeId: WorktreeIdSchema,
	}),
	StrictObject({
		mode: Type.Literal("base-checkout"),
		projectId: ProjectIdSchema,
		confirmation: StrictObject({
			confirmed: Type.Literal(true),
			evidence: Type.String({ minLength: 1 }),
		}),
	}),
]);
export type SessionStartTarget = Static<typeof SessionStartTargetSchema>;

export const SessionStartParamsSchema = Type.Union([
	StrictObject({
		startTarget: SessionStartTargetSchema,
		prompt: Type.Optional(Type.String({ minLength: 1 })),
		...PromptContextParamsSchema,
	}),
	StrictObject({
		// Transitional compatibility for app-server before Safe Worktree Loop Task 3 moves routing to startTarget.
		// Keep legacy top-level worktreeId rejected by intentionally allowing only projectId here.
		projectId: ProjectIdSchema,
		startTarget: Type.Optional(SessionStartTargetSchema),
		prompt: Type.Optional(Type.String({ minLength: 1 })),
		...PromptContextParamsSchema,
	}),
]);
export type SessionStartParams = Static<typeof SessionStartParamsSchema>;

export const SessionStartResultSchema = StrictObject({
	sessionId: SessionIdSchema,
	runsIn: Type.Optional(WorkflowRunsInTargetSchema),
});
export type SessionStartResult = Static<typeof SessionStartResultSchema>;

export const TurnStartParamsSchema = StrictObject({
	sessionId: SessionIdSchema,
	prompt: Type.String({ minLength: 1 }),
	...PromptContextParamsSchema,
});
export type TurnStartParams = Static<typeof TurnStartParamsSchema>;

export const TurnStartResultSchema = StrictObject({ turnId: TurnIdSchema });
export type TurnStartResult = Static<typeof TurnStartResultSchema>;

export const ProjectSummarySchema = StrictObject({
	id: ProjectIdSchema,
	name: Type.String({ minLength: 1 }),
	path: Type.String({ minLength: 1 }),
	createdAt: Type.String({ minLength: 1 }),
	updatedAt: Type.String({ minLength: 1 }),
});
export type ProjectSummary = Static<typeof ProjectSummarySchema>;

export const ProjectOpenParamsSchema = StrictObject({ path: Type.String({ minLength: 1 }) });
export type ProjectOpenParams = Static<typeof ProjectOpenParamsSchema>;

export const ProjectOpenResultSchema = StrictObject({ projectId: ProjectIdSchema });
export type ProjectOpenResult = Static<typeof ProjectOpenResultSchema>;

export const ProjectListResultSchema = StrictObject({ projects: Type.Array(ProjectSummarySchema) });
export type ProjectListResult = Static<typeof ProjectListResultSchema>;

export const WorktreeListParamsSchema = StrictObject({ projectId: ProjectIdSchema });
export type WorktreeListParams = Static<typeof WorktreeListParamsSchema>;

export const WorktreeCreateParamsSchema = StrictObject({
	projectId: ProjectIdSchema,
	branch: Type.String({ minLength: 1 }),
	path: Type.Optional(Type.String({ minLength: 1 })),
	baseBranch: Type.Optional(Type.String({ minLength: 1 })),
});
export type WorktreeCreateParams = Static<typeof WorktreeCreateParamsSchema>;

export const WorktreeCleanupScanParamsSchema = StrictObject({
	worktreeId: WorktreeIdSchema,
	operationId: Type.Optional(Type.String({ minLength: 1 })),
});
export type WorktreeCleanupScanParams = Static<typeof WorktreeCleanupScanParamsSchema>;

export const WorktreeCleanupScanResultSchema = StrictObject({ cleanupRisk: WorktreeCleanupRiskScanSchema });
export type WorktreeCleanupScanResult = Static<typeof WorktreeCleanupScanResultSchema>;

export const WorktreeCleanupParamsSchema = StrictObject({
	worktreeId: WorktreeIdSchema,
	operationId: Type.Optional(Type.String({ minLength: 1 })),
	confirmationToken: Type.Optional(Type.String({ minLength: 1 })),
	force: Type.Optional(Type.Boolean()),
});
export type WorktreeCleanupParams = Static<typeof WorktreeCleanupParamsSchema>;

export const WorktreeCleanupResultSchema = StrictObject({ ok: Type.Literal(true) });
export type WorktreeCleanupResult = Static<typeof WorktreeCleanupResultSchema>;

export const WorktreeListResultSchema = StrictObject({ worktrees: Type.Array(WorkflowWorktreeMetadataSchema) });
export type WorktreeListResult = Static<typeof WorktreeListResultSchema>;

export const WorktreeCreateOutcomeSchema = Type.Union([
	StrictObject({
		outcome: Type.Literal("created"),
		worktree: WorkflowWorktreeMetadataSchema,
		operationId: Type.Optional(Type.String({ minLength: 1 })),
	}),
	StrictObject({
		outcome: Type.Literal("adopted-existing"),
		worktree: WorkflowWorktreeMetadataSchema,
		operationId: Type.Optional(Type.String({ minLength: 1 })),
		reason: Type.Optional(Type.String({ minLength: 1 })),
	}),
	StrictObject({
		outcome: Type.Literal("conflict"),
		reason: WorktreeConflictReasonSchema,
		message: Type.String({ minLength: 1 }),
		operationId: Type.Optional(Type.String({ minLength: 1 })),
		existingPath: Type.Optional(Type.String({ minLength: 1 })),
		existingBranch: Type.Optional(Type.String({ minLength: 1 })),
		boundaryViolation: Type.Optional(RootBoundaryViolationSchema),
	}),
	StrictObject({
		outcome: Type.Literal("rolled-back"),
		message: Type.String({ minLength: 1 }),
		operationId: Type.String({ minLength: 1 }),
		reason: Type.Optional(WorktreeConflictReasonSchema),
		rollbackPath: Type.Optional(Type.String({ minLength: 1 })),
	}),
	StrictObject({
		outcome: Type.Literal("failed"),
		message: Type.String({ minLength: 1 }),
		operationId: Type.Optional(Type.String({ minLength: 1 })),
		reason: Type.Optional(WorktreeConflictReasonSchema),
		recoverable: Type.Optional(Type.Boolean()),
	}),
]);
export type WorktreeCreateOutcome = Static<typeof WorktreeCreateOutcomeSchema>;

export const WorktreeCreateResultSchema = Type.Union([
	StrictObject({ worktree: WorkflowWorktreeMetadataSchema }),
	WorktreeCreateOutcomeSchema,
]);
export type WorktreeCreateResult = Static<typeof WorktreeCreateResultSchema>;

export const SettingsScopeSchema = Type.Union([Type.Literal("global"), Type.Literal("project")]);
export type SettingsScope = Static<typeof SettingsScopeSchema>;

export const SettingsSetParamsSchema = StrictObject({
	scope: SettingsScopeSchema,
	key: Type.String({ minLength: 1 }),
	value: Type.Unknown(),
});
export type SettingsSetParams = Static<typeof SettingsSetParamsSchema>;

export const SettingsResetParamsSchema = StrictObject({
	scope: SettingsScopeSchema,
	key: Type.String({ minLength: 1 }),
});
export type SettingsResetParams = Static<typeof SettingsResetParamsSchema>;

export const ModelSummarySchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	provider: Type.Optional(Type.String()),
	available: Type.Optional(Type.Boolean()),
	contextWindow: Type.Optional(Type.Integer({ minimum: 0 })),
	maxTokens: Type.Optional(Type.Integer({ minimum: 0 })),
	reasoning: Type.Optional(Type.Boolean()),
	reasoningLevels: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	supportsFastMode: Type.Optional(Type.Boolean()),
	diagnostic: Type.Optional(Type.String()),
	capabilities: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	diagnostics: Type.Optional(Type.Array(Type.String())),
});
export type ModelSummary = Static<typeof ModelSummarySchema>;

export const SettingsKeybindingSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	description: Type.String(),
	defaultKeys: Type.Array(Type.String()),
	keys: Type.Array(Type.String()),
	overridden: Type.Boolean(),
});
export type SettingsKeybinding = Static<typeof SettingsKeybindingSchema>;

export const SettingsSchemaEntrySchema = StrictObject({
	key: Type.String({ minLength: 1 }),
	label: Type.String({ minLength: 1 }),
	type: Type.Union([
		Type.Literal("string"),
		Type.Literal("boolean"),
		Type.Literal("string[]"),
		Type.Literal("keybindings"),
	]),
	scopes: Type.Array(SettingsScopeSchema),
	values: Type.Optional(Type.Array(Type.String())),
	resourceReload: Type.Optional(Type.Boolean()),
});

export const SettingsSnapshotResultSchema = StrictObject({
	global: Type.Record(Type.String(), Type.Unknown()),
	project: Type.Record(Type.String(), Type.Unknown()),
	effective: Type.Record(Type.String(), Type.Unknown()),
	diagnostics: Type.Array(Type.String()),
	models: Type.Array(ModelSummarySchema),
	selectedProvider: Type.Optional(Type.String()),
	selectedModel: Type.Optional(Type.String()),
	enabledModels: Type.Optional(Type.Array(Type.String())),
	thinkingLevels: Type.Array(Type.String({ minLength: 1 })),
	keybindings: Type.Array(SettingsKeybindingSchema),
	schema: Type.Array(SettingsSchemaEntrySchema),
});
export type SettingsSnapshotResult = Static<typeof SettingsSnapshotResultSchema>;

export const ModelListResultSchema = StrictObject({
	models: Type.Array(ModelSummarySchema),
	selectedModel: Type.Optional(Type.String()),
});
export type ModelListResult = Static<typeof ModelListResultSchema>;

export const ModelSelectParamsSchema = StrictObject({ model: Type.String({ minLength: 1 }) });
export type ModelSelectParams = Static<typeof ModelSelectParamsSchema>;

export const ModelSelectResultSchema = StrictObject({ model: Type.String({ minLength: 1 }) });
export type ModelSelectResult = Static<typeof ModelSelectResultSchema>;

export const ProviderAuthStatusValueSchema = Type.Union([
	Type.Literal("ready"),
	Type.Literal("missing-auth"),
	Type.Literal("env-key"),
	Type.Literal("oauth"),
	Type.Literal("unavailable"),
	Type.Literal("error"),
]);
export const ProviderAuthMethodSchema = Type.Union([
	Type.Literal("oauth"),
	Type.Literal("api-key"),
	Type.Literal("env"),
	Type.Literal("config"),
]);
export const ProviderAuthModelSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	available: Type.Boolean(),
	capabilities: Type.Array(Type.String({ minLength: 1 })),
	diagnostics: Type.Array(Type.String()),
});
export type ProviderAuthModel = Static<typeof ProviderAuthModelSchema>;
export const ProviderAuthStatusSchema = StrictObject({
	provider: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	enabled: Type.Boolean(),
	authenticated: Type.Boolean(),
	status: ProviderAuthStatusValueSchema,
	authMethod: Type.Optional(ProviderAuthMethodSchema),
	actionable: Type.Boolean(),
	canLogin: Type.Boolean(),
	canLogout: Type.Boolean(),
	canRelogin: Type.Boolean(),
	instruction: Type.Optional(Type.String()),
	message: Type.Optional(Type.String()),
	source: Type.Optional(Type.String()),
	version: Type.Optional(Type.String()),
	modelCount: Type.Integer({ minimum: 0 }),
	models: Type.Array(ProviderAuthModelSchema),
	capabilities: Type.Array(Type.String({ minLength: 1 })),
	diagnostics: Type.Array(Type.String()),
	updatedAt: Type.String({ minLength: 1 }),
});
export type ProviderAuthStatus = Static<typeof ProviderAuthStatusSchema>;

export const AuthStatusParamsSchema = StrictObject({ provider: Type.Optional(Type.String()) });
export type AuthStatusParams = Static<typeof AuthStatusParamsSchema>;

export const AuthStatusResultSchema = StrictObject({ providers: Type.Array(ProviderAuthStatusSchema) });
export type AuthStatusResult = Static<typeof AuthStatusResultSchema>;

export const AccessPolicyResultSchema = StrictObject({ policy: AccessPolicySchema });
export type AccessPolicyResult = Static<typeof AccessPolicyResultSchema>;

export const ConfigGetParamsSchema = StrictObject({ key: Type.Optional(Type.String()) });
export type ConfigGetParams = Static<typeof ConfigGetParamsSchema>;
export const ConfigSetParamsSchema = StrictObject({ key: Type.String({ minLength: 1 }), value: Type.Unknown() });
export type ConfigSetParams = Static<typeof ConfigSetParamsSchema>;
export const ConfigResultSchema = StrictObject({ config: Type.Record(Type.String(), Type.Unknown()) });
export type ConfigResult = Static<typeof ConfigResultSchema>;

export const ResourceKindSchema = Type.Union([
	Type.Literal("extension"),
	Type.Literal("skill"),
	Type.Literal("prompt-template"),
	Type.Literal("theme"),
	Type.Literal("package"),
]);
export const ResourceOperationParamsSchema = StrictObject({
	kind: ResourceKindSchema,
	id: Type.String({ minLength: 1 }),
	sourcePath: Type.Optional(Type.String({ minLength: 1 })),
});
export type ResourceOperationParams = Static<typeof ResourceOperationParamsSchema>;

export const ManagedResourceSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	name: Type.String({ minLength: 1 }),
	kind: ResourceKindSchema,
	status: Type.Union([
		Type.Literal("enabled"),
		Type.Literal("disabled"),
		Type.Literal("error"),
		Type.Literal("missing"),
	]),
	enabled: Type.Boolean(),
	source: Type.Union([
		Type.Literal("global"),
		Type.Literal("project"),
		Type.Literal("built-in"),
		Type.Literal("package"),
	]),
	sourcePath: Type.Optional(Type.String()),
	version: Type.Optional(Type.String()),
	diagnostics: Type.Array(Type.String()),
	disabledReason: Type.Optional(Type.String()),
});
export type ManagedResource = Static<typeof ManagedResourceSchema>;

export const ResourceListResultSchema = StrictObject({
	resources: Type.Array(ManagedResourceSchema),
	diagnostics: Type.Array(Type.String()),
});
export type ResourceListResult = Static<typeof ResourceListResultSchema>;
export const ResourceOperationResultSchema = StrictObject({ resource: ManagedResourceSchema });
export type ResourceOperationResult = Static<typeof ResourceOperationResultSchema>;
export const ResourceRemoveResultSchema = StrictObject({ ok: Type.Literal(true) });
export type ResourceRemoveResult = Static<typeof ResourceRemoveResultSchema>;

export const DiffTargetSchema = Type.Union([
	StrictObject({ kind: Type.Literal("project"), projectId: ProjectIdSchema }),
	StrictObject({ kind: Type.Literal("worktree"), projectId: ProjectIdSchema, worktreeId: WorktreeIdSchema }),
	StrictObject({
		kind: Type.Literal("session"),
		sessionId: SessionIdSchema,
		projectId: Type.Optional(ProjectIdSchema),
	}),
]);
export type DiffTarget = Static<typeof DiffTargetSchema>;
export const DiffGetParamsSchema = Type.Union([
	StrictObject({ target: DiffTargetSchema }),
	StrictObject({
		// Transitional compatibility for current app-server router; structured target remains the explicit contract.
		diffId: DiffIdSchema,
		target: Type.Optional(DiffTargetSchema),
	}),
]);
export type DiffGetParams = Static<typeof DiffGetParamsSchema>;
export const DiffGetResultSchema = StrictObject({ diff: WorkflowDiffSummarySchema });
export type DiffGetResult = Static<typeof DiffGetResultSchema>;

export const GitPathsParamsSchema = StrictObject({
	diffId: DiffIdSchema,
	paths: Type.Array(Type.String({ minLength: 1 })),
});
export type GitPathsParams = Static<typeof GitPathsParamsSchema>;
export const GitCommitParamsSchema = StrictObject({ diffId: DiffIdSchema, message: Type.String() });
export type GitCommitParams = Static<typeof GitCommitParamsSchema>;
export const GitCheckpointRestoreParamsSchema = StrictObject({
	diffId: DiffIdSchema,
	checkpointRef: Type.String({ minLength: 1 }),
});
export type GitCheckpointRestoreParams = Static<typeof GitCheckpointRestoreParamsSchema>;
export const GitMutationResultSchema = StrictObject({
	ok: Type.Literal(true),
	approvalId: ApprovalIdSchema,
	diff: WorkflowDiffSummarySchema,
});
export type GitMutationResult = Static<typeof GitMutationResultSchema>;

export const CheckpointSummarySchema = StrictObject({
	checkpointId: CheckpointIdSchema,
	sessionId: SessionIdSchema,
	worktreeId: Type.Optional(WorktreeIdSchema),
	label: Type.Optional(Type.Union([Type.String(), Type.Null()])),
	ref: Type.Optional(Type.String({ minLength: 1 })),
	commit: Type.Optional(Type.String({ minLength: 1 })),
	metadata: Type.Record(Type.String(), Type.Unknown()),
	createdAt: Type.String({ minLength: 1 }),
});
export type CheckpointSummary = Static<typeof CheckpointSummarySchema>;
export const CheckpointCreateParamsSchema = StrictObject({
	sessionId: SessionIdSchema,
	turnId: TurnIdSchema,
	label: Type.Optional(Type.String()),
});
export type CheckpointCreateParams = Static<typeof CheckpointCreateParamsSchema>;
export const CheckpointCreateResultSchema = StrictObject({
	checkpoint: StrictObject({
		checkpointId: CheckpointIdSchema,
		ref: Type.String({ minLength: 1 }),
		commit: Type.String({ minLength: 1 }),
	}),
});
export type CheckpointCreateResult = Static<typeof CheckpointCreateResultSchema>;
export const CheckpointListParamsSchema = StrictObject({ sessionId: SessionIdSchema });
export type CheckpointListParams = Static<typeof CheckpointListParamsSchema>;
export const CheckpointListResultSchema = StrictObject({ checkpoints: Type.Array(CheckpointSummarySchema) });
export type CheckpointListResult = Static<typeof CheckpointListResultSchema>;
export const CheckpointRestoreParamsSchema = StrictObject({
	sessionId: SessionIdSchema,
	checkpointId: CheckpointIdSchema,
});
export type CheckpointRestoreParams = Static<typeof CheckpointRestoreParamsSchema>;
export const CheckpointRestoreResultSchema = StrictObject({
	ok: Type.Literal(true),
	approvalId: ApprovalIdSchema,
	checkpoint: CheckpointSummarySchema,
	diff: WorkflowDiffSummarySchema,
});
export type CheckpointRestoreResult = Static<typeof CheckpointRestoreResultSchema>;

export const ClientRequestSchema = Type.Union([
	request("initialize", InitializeParamsSchema),
	request("project/list", EmptyParamsSchema),
	request("project/open", ProjectOpenParamsSchema),
	request("worktree/list", WorktreeListParamsSchema),
	request("worktree/create", WorktreeCreateParamsSchema),
	request("worktree/cleanup-scan", WorktreeCleanupScanParamsSchema),
	request("worktree/cleanup", WorktreeCleanupParamsSchema),
	request("session/start", SessionStartParamsSchema),
	request("session/stop", StrictObject({ sessionId: SessionIdSchema })),
	request("session/list", SessionListParamsSchema),
	request("session/import-jsonl", SessionImportJsonlParamsSchema),
	request("session/export-jsonl", SessionExportJsonlParamsSchema),
	request("session/export-html", SessionExportHtmlParamsSchema),
	request("session/resume", SessionResumeParamsSchema),
	request("session/fork", SessionForkParamsSchema),
	request("session/rename", SessionRenameParamsSchema),
	request("session/archive", SessionArchiveParamsSchema),
	request("session/delete", SessionDeleteParamsSchema),
	request("session/stats", SessionStatsParamsSchema),
	request("session/tree", SessionTreeParamsSchema),
	request("turn/start", TurnStartParamsSchema),
	request("turn/cancel", StrictObject({ sessionId: SessionIdSchema, turnId: TurnIdSchema })),
	request("runtime/get-state", RuntimeStateParamsSchema),
	request("runtime/set-model", RuntimeSetModelParamsSchema),
	request("runtime/cycle-model", RuntimeCycleModelParamsSchema),
	request("runtime/set-thinking", RuntimeSetThinkingParamsSchema),
	request("runtime/cycle-thinking", RuntimeCycleThinkingParamsSchema),
	request("runtime/set-tools", RuntimeSetToolsParamsSchema),
	request("runtime/set-steering-mode", RuntimeSetQueueModeParamsSchema),
	request("runtime/set-follow-up-mode", RuntimeSetQueueModeParamsSchema),
	request("runtime/compact", RuntimeCompactParamsSchema),
	request("runtime/abort", RuntimeAbortParamsSchema),
	request("runtime/reload-resources", RuntimeReloadResourcesParamsSchema),
	request("runtime/get-commands", RuntimeCommandsParamsSchema),
	request("runtime/get-keybindings", RuntimeKeybindingsParamsSchema),
	request("settings/read", EmptyParamsSchema),
	request("settings/set", SettingsSetParamsSchema),
	request("settings/reset", SettingsResetParamsSchema),
	request("settings/reload-resources", EmptyParamsSchema),
	request("resources/list", EmptyParamsSchema),
	request("resources/reload", EmptyParamsSchema),
	request("resources/install", ResourceOperationParamsSchema),
	request("resources/remove", ResourceOperationParamsSchema),
	request("resources/update", ResourceOperationParamsSchema),
	request("resources/enable", ResourceOperationParamsSchema),
	request("resources/disable", ResourceOperationParamsSchema),
	request("approval/list", StrictObject({ sessionId: Type.Optional(SessionIdSchema) })),
	request(
		"approval/respond",
		StrictObject({
			approvalId: ApprovalIdSchema,
			decision: Type.Union([Type.Literal("approved"), Type.Literal("denied")]),
			message: Type.Optional(Type.String()),
		}),
	),
	request("extension/ui/respond", ExtensionUiResponseSchema),
	request("checkpoint/list", CheckpointListParamsSchema),
	request("checkpoint/create", CheckpointCreateParamsSchema),
	request("checkpoint/restore", CheckpointRestoreParamsSchema),
	request("diff/get", DiffGetParamsSchema),
	request("git/stage", GitPathsParamsSchema),
	request("git/unstage", GitPathsParamsSchema),
	request("git/discard", GitPathsParamsSchema),
	request("git/commit", GitCommitParamsSchema),
	request("git/checkpoint-restore", GitCheckpointRestoreParamsSchema),
	request("composer/file-search", ComposerFileSearchParamsSchema),
	request("composer/command-list", ComposerCommandListParamsSchema),
	request("composer/attachment/save", ComposerAttachmentSaveParamsSchema),
	request("composer/attachment/get", StrictObject({ attachmentId: Type.String({ minLength: 1 }) })),
	request("terminal/create", TerminalCreateParamsSchema),
	request("terminal/list", TerminalListParamsSchema),
	request("terminal/attach", TerminalIdParamsSchema),
	request("terminal/detach", TerminalIdParamsSchema),
	request("terminal/input", TerminalInputParamsSchema),
	request("terminal/resize", TerminalResizeParamsSchema),
	request("terminal/kill", TerminalIdParamsSchema),
	request("terminal/replay", TerminalReplayParamsSchema),
	request("config/get", ConfigGetParamsSchema),
	request("config/set", ConfigSetParamsSchema),
	request("model/list", EmptyParamsSchema),
	request("model/select", ModelSelectParamsSchema),
	request("auth/status", AuthStatusParamsSchema),
	request("auth/login", StrictObject({ provider: Type.String({ minLength: 1 }) })),
	request("auth/logout", StrictObject({ provider: Type.String({ minLength: 1 }) })),
	request("access/get", EmptyParamsSchema),
	request("access/set", StrictObject({ mode: AccessModeSchema })),
	request("integration/list", StrictObject({ projectId: Type.Optional(ProjectIdSchema) })),
	request("integration/connect", IntegrationConnectParamsSchema),
	request("integration/disconnect", IntegrationDisconnectParamsSchema),
	request("integration/link", IntegrationManualLinkParamsSchema),
	request("integration/import", IntegrationImportParamsSchema),
	request("integration/pr-create", IntegrationPullRequestCreateParamsSchema),
	request("integration/pr-open", IntegrationPullRequestOpenParamsSchema),
	request("diagnostics/export", DiagnosticExportParamsSchema),
	request("orchestration/read", EmptyParamsSchema),
	request("daedalus/workflow/read", StrictObject({ sessionId: SessionIdSchema })),
	request("audit/query", AuditQuerySchema),
	request("automation/read", EmptyParamsSchema),
	request("event/replay", EventReplayParamsSchema),
]);
export type ClientRequest = Static<typeof ClientRequestSchema>;

export const ClientRequestResultSchemas = {
	initialize: InitializeResultSchema,
	"project/list": ProjectListResultSchema,
	"project/open": ProjectOpenResultSchema,
	"worktree/list": WorktreeListResultSchema,
	"worktree/create": WorktreeCreateResultSchema,
	"worktree/cleanup-scan": WorktreeCleanupScanResultSchema,
	"worktree/cleanup": WorktreeCleanupResultSchema,
	"session/start": SessionStartResultSchema,
	"session/stop": EmptyResultSchema,
	"session/list": SessionListResultSchema,
	"session/import-jsonl": SessionImportJsonlResultSchema,
	"session/export-jsonl": SessionExportJsonlResultSchema,
	"session/export-html": SessionExportHtmlResultSchema,
	"session/resume": SessionResumeResultSchema,
	"session/fork": SessionForkResultSchema,
	"session/rename": SessionMutationResultSchema,
	"session/archive": SessionMutationResultSchema,
	"session/delete": SessionMutationResultSchema,
	"session/stats": SessionStatsResultSchema,
	"session/tree": SessionTreeResultSchema,
	"turn/start": TurnStartResultSchema,
	"turn/cancel": EmptyResultSchema,
	...RuntimeControlResultSchemas,
	"settings/read": SettingsSnapshotResultSchema,
	"settings/set": SettingsSnapshotResultSchema,
	"settings/reset": SettingsSnapshotResultSchema,
	"settings/reload-resources": SettingsSnapshotResultSchema,
	"resources/list": ResourceListResultSchema,
	"resources/reload": ResourceListResultSchema,
	"resources/install": ResourceOperationResultSchema,
	"resources/remove": ResourceRemoveResultSchema,
	"resources/update": ResourceOperationResultSchema,
	"resources/enable": ResourceOperationResultSchema,
	"resources/disable": ResourceOperationResultSchema,
	"approval/list": StrictObject({ approvals: Type.Array(Type.Any()) }),
	"approval/respond": EmptyResultSchema,
	"extension/ui/respond": EmptyResultSchema,
	"checkpoint/list": CheckpointListResultSchema,
	"checkpoint/create": CheckpointCreateResultSchema,
	"checkpoint/restore": CheckpointRestoreResultSchema,
	"diff/get": DiffGetResultSchema,
	"git/stage": GitMutationResultSchema,
	"git/unstage": GitMutationResultSchema,
	"git/discard": GitMutationResultSchema,
	"git/commit": GitMutationResultSchema,
	"git/checkpoint-restore": GitMutationResultSchema,
	"composer/file-search": ComposerFileSearchResultSchema,
	"composer/command-list": ComposerCommandListResultSchema,
	"composer/attachment/save": ComposerAttachmentResultSchema,
	"composer/attachment/get": ComposerAttachmentResultSchema,
	"terminal/create": TerminalSnapshotResultSchema,
	"terminal/list": TerminalListResultSchema,
	"terminal/attach": TerminalSnapshotResultSchema,
	"terminal/detach": TerminalSnapshotResultSchema,
	"terminal/input": EmptyResultSchema,
	"terminal/resize": TerminalSnapshotResultSchema,
	"terminal/kill": TerminalSnapshotResultSchema,
	"terminal/replay": TerminalReplayResultSchema,
	"config/get": ConfigResultSchema,
	"config/set": ConfigResultSchema,
	"model/list": ModelListResultSchema,
	"model/select": ModelSelectResultSchema,
	"auth/status": AuthStatusResultSchema,
	"auth/login": ProviderAuthStatusSchema,
	"auth/logout": ProviderAuthStatusSchema,
	"access/get": AccessPolicyResultSchema,
	"access/set": AccessPolicyResultSchema,
	"integration/list": IntegrationListResultSchema,
	"integration/connect": IntegrationConnectResultSchema,
	"integration/disconnect": IntegrationDisconnectResultSchema,
	"integration/link": IntegrationConnectResultSchema,
	"integration/import": IntegrationConnectResultSchema,
	"integration/pr-create": IntegrationPullRequestCreateResultSchema,
	"integration/pr-open": IntegrationPullRequestOpenResultSchema,
	"diagnostics/export": DiagnosticExportResultSchema,
	"orchestration/read": OrchestrationProjectionSchema,
	"daedalus/workflow/read": DaedalusWorkflowStateSchema,
	"audit/query": AuditTrailProjectionSchema,
	"automation/read": AutomationProjectionSchema,
	"event/replay": EventReplayResultSchema,
} as const;

export type ClientRequestResultMap = {
	[Method in keyof typeof ClientRequestResultSchemas]: Static<(typeof ClientRequestResultSchemas)[Method]>;
};
export type ClientRequestResult<Method extends ClientRequest["method"]> = Method extends keyof ClientRequestResultMap
	? ClientRequestResultMap[Method]
	: unknown;

export function resultSchemaForMethod(method: ClientRequest["method"]): TSchema | undefined {
	return ClientRequestResultSchemas[method as keyof typeof ClientRequestResultSchemas];
}

export const ResponseErrorSchema = StrictObject({
	code: Type.String({ minLength: 1 }),
	message: Type.String(),
	data: Type.Optional(Type.Unknown()),
});
export type ResponseError = Static<typeof ResponseErrorSchema>;

export const ServerResponseSchema = Type.Union([
	StrictObject({
		kind: Type.Literal("response"),
		id: RequestIdSchema,
		ok: Type.Literal(true),
		result: Type.Unknown(),
	}),
	StrictObject({
		kind: Type.Literal("response"),
		id: RequestIdSchema,
		ok: Type.Literal(false),
		error: ResponseErrorSchema,
	}),
]);
export type ServerResponse = Static<typeof ServerResponseSchema>;

export const ServerRequestSchema = Type.Union([request("extension/ui/request", ExtensionUiRequestSchema)]);
export type ServerRequest = Static<typeof ServerRequestSchema>;

export const ServerNotificationSchema = Type.Union([
	notification("project/changed", StrictObject({ projectId: ProjectIdSchema })),
	notification("worktree/changed", StrictObject({ worktreeId: WorktreeIdSchema })),
	notification("session/changed", StrictObject({ sessionId: SessionIdSchema, status: Type.String() })),
	notification(
		"turn/changed",
		StrictObject({ sessionId: SessionIdSchema, turnId: TurnIdSchema, status: Type.String() }),
	),
	notification(
		"approval/requested",
		StrictObject({ approvalId: ApprovalIdSchema, sessionId: SessionIdSchema, summary: Type.String() }),
	),
	notification("extension/ui/cancelled", StrictObject({ requestId: Type.String({ minLength: 1 }) })),
	notification("checkpoint/created", StrictObject({ checkpointId: CheckpointIdSchema, sessionId: SessionIdSchema })),
	notification("diff/changed", StrictObject({ diffId: DiffIdSchema })),
	notification(
		"terminal/output",
		StrictObject({
			terminalId: Type.String({ minLength: 1 }),
			seq: Type.Integer({ minimum: 1 }),
			data: Type.String(),
		}),
	),
	notification("terminal/closed", StrictObject({ terminalId: Type.String({ minLength: 1 }), status: Type.String() })),
	notification("terminal/event", StrictObject({ terminalId: Type.String({ minLength: 1 }), event: Type.Unknown() })),
	notification("config/changed", StrictObject({ key: Type.String() })),
	notification("model/changed", StrictObject({ model: Type.String() })),
	notification("auth/changed", StrictObject({ provider: Type.String(), authenticated: Type.Boolean() })),
	notification("integration/changed", StrictObject({ provider: Type.String(), status: Type.String() })),
	notification("access/changed", StrictObject({ mode: AccessModeSchema })),
	notification("event/appended", StrictObject({ event: Type.Unknown() })),
	notification(
		"runtime/changed",
		StrictObject({ sessionId: SessionIdSchema, control: Type.String(), payload: Type.Unknown() }),
	),
]);
export type ServerNotification = Static<typeof ServerNotificationSchema>;

export const ClientNotificationSchema = Type.Union([
	notification("terminal/closed", StrictObject({ terminalId: Type.String({ minLength: 1 }) })),
	notification("extension/ui/closed", StrictObject({ requestId: Type.String({ minLength: 1 }) })),
]);
export type ClientNotification = Static<typeof ClientNotificationSchema>;

export const EventReplayResponseSchema = StrictObject({
	kind: Type.Literal("response"),
	id: RequestIdSchema,
	ok: Type.Literal(true),
	result: EventReplayResultSchema,
});
export type EventReplayResponse = Static<typeof EventReplayResponseSchema>;
