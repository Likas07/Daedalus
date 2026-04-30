export interface AppServerOptions {
	readonly databasePath: string;
}

export { ALLOWED_IMAGE_MIME_TYPES, AttachmentService, MAX_GUI_ATTACHMENT_BYTES } from "./composer/attachment-service";
export { CommandService, type ComposerCommandSummary } from "./composer/command-service";
export { type ComposerFileSearchResult, FileSearchService } from "./composer/file-search-service";
export { PromptContextService } from "./composer/prompt-context-service";
export { type ExtensionCommandDescriptor, ExtensionCommandRegistry } from "./extensions/extension-commands";
export {
	type ExtensionErrorRecord,
	type ExtensionMetadata,
	ExtensionRegistry,
	type ExtensionRegistryOptions,
	type ExtensionRegistrySnapshot,
	type ExtensionReloadDiagnostics,
	type ExtensionToolDescriptor,
} from "./extensions/extension-registry";
export {
	type ExtensionBridgeCompatibilityWarning,
	type ExtensionBridgeEmit,
	type ExtensionBridgeWarningSink,
	ExtensionUIBridge,
	type ExtensionUIBridgeOptions,
} from "./extensions/extension-ui-bridge";
export { CiAdapter, type CiAdapterOptions, normalizeCheckState } from "./integrations/ci";
export { GitHubAdapter, type GitHubAdapterOptions, parseGitHubRemote } from "./integrations/github";
export type {
	CiCheck,
	CommandRunner,
	IntegrationAdapter,
	IntegrationProvider,
	IntegrationRepository,
	IntegrationState,
	IntegrationStatus,
	LinkedIssue,
	PullRequestCreateRequest,
	PullRequestCreateResult,
	PullRequestStatus,
} from "./integrations/integration-api";
export { IntegrationService, type IntegrationServiceOptions } from "./integrations/integration-service";
export { type AppServerDatabase, openAppServerDatabase } from "./persistence/database";
export {
	type AppendEventInput,
	appendEvent,
	type EventPayload,
	type ReadEventsOptions,
	readEvents,
	readEventsAfter,
	type StoredEvent,
} from "./persistence/event-store";
export { runMigrations } from "./persistence/migrations";
export { type ProjectionResult, projectRuntimeEvents } from "./persistence/projector";
export {
	type ApprovalReadModel,
	type IntegrationResourceReadModel,
	listActiveApprovals,
	listIntegrationResources,
	listProjectSessions,
	listProjects,
	listSessionTurns,
	listTerminalSessions,
	listWorktrees,
	type ProjectReadModel,
	type SessionReadModel,
	type TerminalSessionReadModel,
	type TurnReadModel,
	type WorktreeReadModel,
} from "./persistence/read-model";
export { type AccessPolicy, AccessPolicyService, toPolicy } from "./runtime/access-policy-service";
export { type ApprovalRequestInput, ApprovalService } from "./runtime/approval-service";
export { createCodingAgentRuntimeFactory } from "./runtime/coding-agent-runtime";
export {
	type MapRuntimeEventOptions,
	mapRuntimeEvent,
	type RuntimeAgentEvent,
	type RuntimeEventEnvelope,
} from "./runtime/event-mapper";
export { GuiConfigService } from "./runtime/gui-config-service";
export { type OperationBeginResult, OperationIdempotencyService } from "./runtime/operation-idempotency-service";

export {
	createSessionRuntimeFactory,
	type SessionRuntime,
	type SessionRuntimeCreator,
	type SessionRuntimeFactory,
	type SessionRuntimeFactoryInput,
} from "./runtime/runtime-factory";
export {
	type ControlledSessionRuntime,
	type InterruptTurnInput,
	type PromptContextInput,
	type PromptContextResolver,
	type ResumeSessionInput,
	type RuntimeControllerMessage,
	type RuntimeEventSink,
	type RuntimeFactory,
	type RuntimeFactoryInput,
	type RuntimeSessionManager,
	SessionController,
	type SessionControllerOptions,
	type SessionControllerState,
	type StartSessionInput,
	type StartTurnInput,
} from "./runtime/session-controller";

export {
	classifyToolRisk,
	ToolApprovalGate,
	type ToolApprovalGateOptions,
	type ToolApprovalInput,
} from "./runtime/tool-approval-gate";
export {
	WorkspaceSelectionService,
	type WorkspaceSelectionServiceOptions,
} from "./runtime/workspace-selection-service";
export { type AppServerInstance, type CreateAppServerOptions, startAppServer } from "./server/app-server";
export {
	type AuthOptions,
	authenticateRequest,
	createCapabilityToken,
	isAllowedOrigin,
	isLoopbackHost,
} from "./server/auth";
export { AppRouter, type AppRouterOptions, type OutboundMessage, type Publish } from "./server/router";
export {
	type GuiSessionReadModel,
	type ProjectGuiSessionReadModelOptions,
	projectGuiSessionReadModel,
	type RuntimeSessionEvent,
	toGuiSessionReadModelRow,
} from "./sessions/session-read-model";
export {
	GUI_SESSION_TABLES,
	type GuiSessionApprovalRow,
	type GuiSessionAttachmentRow,
	type GuiSessionEntry,
	type GuiSessionEntryRow,
	type GuiSessionExportRow,
	type GuiSessionHeader,
	type GuiSessionReadModelRow,
	type GuiSessionRow,
	type GuiSessionStatus,
} from "./sessions/session-schema";
export {
	createSqliteSessionStore,
	type ImportSessionJsonlOptions,
	SqliteSessionStore,
	type SqliteSessionStoreOptions,
} from "./sessions/sqlite-session-store";
export { createNodePtyAdapter, NodePtyAdapter, type PtyAdapter, type PtyProcessHandle } from "./terminal/pty-adapter";
export type {
	TerminalCreateParams,
	TerminalDimensions,
	TerminalOutputChunk,
	TerminalReplayParams,
	TerminalReplayResult,
	TerminalSessionRecord,
	TerminalStatus,
} from "./terminal/terminal-protocol";
export { TerminalService, type TerminalServiceOptions } from "./terminal/terminal-service";
export {
	type CheckpointRecord,
	CheckpointService,
	type CheckpointServiceOptions,
	type CreateCheckpointInput,
} from "./workspaces/checkpoint-service";
export { type DiffFileSummary, type DiffResult, DiffService, parseNameStatus } from "./workspaces/diff-service";
export { type OpenProjectInput, ProjectService, type ProjectServiceOptions } from "./workspaces/project-service";
export { type CreateWorktreeInput, WorktreeService, type WorktreeServiceOptions } from "./workspaces/worktree-service";
export { buildShellSnapshot, type BuildShellSnapshotOptions } from "./projections/shell-projection";
export { buildThreadDetailSnapshot, type BuildThreadDetailSnapshotOptions } from "./projections/thread-detail-projection";
