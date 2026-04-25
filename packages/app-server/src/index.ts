export interface AppServerOptions {
	readonly databasePath: string;
}

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
export {
	type MapRuntimeEventOptions,
	mapRuntimeEvent,
	type RuntimeAgentEvent,
	type RuntimeEventEnvelope,
} from "./runtime/event-mapper";
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
export { type AppServerInstance, type CreateAppServerOptions, startAppServer } from "./server/app-server";
export {
	type AuthOptions,
	authenticateRequest,
	createCapabilityToken,
	isAllowedOrigin,
	isLoopbackHost,
} from "./server/auth";
export { AppRouter, type AppRouterOptions, type OutboundMessage, type Publish } from "./server/router";
export type {
	TerminalCreateParams,
	TerminalDimensions,
	TerminalOutputChunk,
	TerminalReplayParams,
	TerminalReplayResult,
	TerminalSessionRecord,
	TerminalStatus,
} from "./terminal/terminal-protocol";
export {
	type TerminalProcess,
	TerminalService,
	type TerminalServiceOptions,
	type TerminalSpawner,
} from "./terminal/terminal-service";
export {
	type CheckpointRecord,
	CheckpointService,
	type CheckpointServiceOptions,
	type CreateCheckpointInput,
} from "./workspaces/checkpoint-service";
export { type DiffFileSummary, type DiffResult, DiffService, parseNameStatus } from "./workspaces/diff-service";
export { type OpenProjectInput, ProjectService, type ProjectServiceOptions } from "./workspaces/project-service";
export { type CreateWorktreeInput, WorktreeService, type WorktreeServiceOptions } from "./workspaces/worktree-service";
