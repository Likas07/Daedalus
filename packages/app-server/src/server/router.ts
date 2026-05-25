import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
	AppEvent,
	AuditQuery,
	ClientNotification,
	ClientRequest,
	DiffTarget,
	ProtocolV1ClientRequest,
	ProtocolV1Phase3ClientRequest,
	protocolV1,
	RootScopedTarget,
	ServerNotification,
	ServerRequest,
	WorkflowRunsInTarget,
} from "@daedalus-pi/app-server-protocol";
import { AuthStorage, ModelRegistry } from "@daedalus-pi/coding-agent";
import { type AppServerDatabase, readEventsAfter } from "..";
import { AttachmentService } from "../composer/attachment-service";
import { CommandService } from "../composer/command-service";
import { FileSearchService } from "../composer/file-search-service";
import type { ExtensionUiRouter } from "../extensions/extension-ui-router";
import type { CommandRunner } from "../integrations/integration-api";
import { IntegrationService } from "../integrations/integration-service";
import { projectRuntimeEvents } from "../persistence/projector";
import { listProjectSessions } from "../persistence/read-model";
import { RuntimeEventLog } from "../persistence/runtime-event-log";
import { buildShellSnapshot } from "../projections/shell-projection";
import { buildThreadDetailSnapshot } from "../projections/thread-detail-projection";
import { buildThreadV1Snapshot } from "../projections/thread-v1-projection";
import { AccessPolicyService } from "../runtime/access-policy-service";
import { ApprovalService } from "../runtime/approval-service";
import { projectAuditTrail } from "../runtime/audit-projection";
import { AutomationService } from "../runtime/automation-service";
import { DaedalusWorkflowService } from "../runtime/daedalus-workflow-service";
import { GuiConfigService } from "../runtime/gui-config-service";
import { OperationIdempotencyService } from "../runtime/operation-idempotency-service";
import { projectOrchestration } from "../runtime/orchestration-projection";
import { ProviderAuthService } from "../runtime/provider-auth-service";
import { ResourceManagementService } from "../runtime/resource-management-service";
import { RuntimeControlService } from "../runtime/runtime-control-service";
import type { SessionController } from "../runtime/session-controller";
import { type SettingsKey, SettingsService } from "../runtime/settings-service";
import { WorkspaceSelectionService } from "../runtime/workspace-selection-service";
import { verifySessionResumeIdentity } from "../sessions/session-identity";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";
import type { PtyAdapter } from "../terminal/pty-adapter";
import { TerminalService } from "../terminal/terminal-service";
import { CheckpointService } from "../workspaces/checkpoint-service";
import { DiffService } from "../workspaces/diff-service";
import { gitStatus } from "../workspaces/git";
import { GitMutationService } from "../workspaces/git-mutation-service";
import { ProjectService } from "../workspaces/project-service";
import { assertPathWithinRoot, resolveRootScopedTarget } from "../workspaces/root-boundary";
import { validateWorktreeTarget } from "../workspaces/worktree-safety";
import { type WorktreeLifecycleMetadata, WorktreeService } from "../workspaces/worktree-service";

import { ExportService } from "./export-service";
import { createDefaultV1Router, handleV1Request } from "./v1/router";

export type OutboundMessage = AppEvent | ServerNotification | ServerRequest;
export type Publish = (message: OutboundMessage) => void;
export type AppRouterRequest = ClientRequest | ProtocolV1ClientRequest | ProtocolV1Phase3ClientRequest;

function supportsXhighFor(id: string): boolean {
	if (id.includes("gpt-5.2") || id.includes("gpt-5.3") || id.includes("gpt-5.4") || id.includes("gpt-5.5"))
		return true;
	if (id.includes("opus-4-6") || id.includes("opus-4.6")) return true;
	return false;
}

function buildReasoningLevels(id: string): string[] {
	const base = ["minimal", "low", "medium", "high"];
	return supportsXhighFor(id) ? [...base, "xhigh"] : base;
}

function supportsFastModeFor(id: string, provider: string): boolean {
	return (id === "gpt-5.4" || id === "gpt-5.5") && (provider === "openai" || provider === "openai-codex");
}

export interface AppRouterOptions {
	readonly database: AppServerDatabase;
	readonly eventLog?: RuntimeEventLog;
	readonly controller: SessionController;
	readonly publish: Publish;
	readonly integrationRunner?: CommandRunner;
	readonly terminalPty?: PtyAdapter;
	readonly accessPolicyService?: AccessPolicyService;
	readonly approvalService?: ApprovalService;
	readonly extensionUiRouter?: ExtensionUiRouter;
	readonly agentDir?: string;
}

export class AppRouter {
	private readonly projects = new Map<string, string>();
	private readonly projectService: ProjectService;
	private readonly worktreeService: WorktreeService;
	private readonly terminalService: TerminalService;
	private readonly integrationService: IntegrationService;
	private readonly automationService = new AutomationService();
	private readonly configService: GuiConfigService;
	private readonly accessPolicyService: AccessPolicyService;
	private readonly approvalService: ApprovalService;
	private readonly eventLog: RuntimeEventLog;
	private readonly fileSearchService = new FileSearchService();
	private readonly commandService = new CommandService();
	private readonly attachmentService = new AttachmentService();
	private readonly diffService = new DiffService();
	private readonly gitMutationService: GitMutationService;
	private readonly checkpointService: CheckpointService;

	private readonly sessionStore: SqliteSessionStore;
	private readonly runtimeControlService: RuntimeControlService;
	private readonly providerAuthService: ProviderAuthService;
	private readonly modelRegistry: ModelRegistry;
	private readonly settingsService: SettingsService;
	private readonly resourceManagementService = new ResourceManagementService();
	private readonly daedalusWorkflowService: DaedalusWorkflowService;
	private readonly workspaceSelectionService: WorkspaceSelectionService;
	private readonly operationIdempotencyService: OperationIdempotencyService;
	private readonly v1Router = createDefaultV1Router();
	constructor(private readonly options: AppRouterOptions) {
		this.eventLog = options.eventLog ?? new RuntimeEventLog({ database: options.database, publish: options.publish });
		this.projectService = new ProjectService({ database: options.database, eventLog: this.eventLog });
		this.sessionStore = new SqliteSessionStore({ database: options.database });
		this.worktreeService = new WorktreeService({
			database: options.database,
			listActiveSessionIds: (worktreeId) => this.listActiveSessionIds(worktreeId),
			listActiveTerminalIds: (worktreeId) => this.listActiveTerminalIds(worktreeId),
		});
		this.daedalusWorkflowService = new DaedalusWorkflowService({ sessionStore: this.sessionStore });
		this.workspaceSelectionService = new WorkspaceSelectionService({ database: options.database });
		this.operationIdempotencyService = new OperationIdempotencyService({ database: options.database });
		const authStorage = options.agentDir
			? AuthStorage.create(join(options.agentDir, "auth.json"))
			: AuthStorage.create();
		this.modelRegistry = options.agentDir
			? ModelRegistry.create(authStorage, join(options.agentDir, "models.json"))
			: ModelRegistry.create(authStorage);
		this.providerAuthService = new ProviderAuthService({ authStorage, modelRegistry: this.modelRegistry });

		this.runtimeControlService = new RuntimeControlService(options.controller);
		this.settingsService = new SettingsService({
			listModels: () =>
				this.listModels() as Promise<unknown[]> as Promise<import("../runtime/settings-service").SettingsModel[]>,
		});
		this.terminalService = new TerminalService({
			publish: options.publish,
			database: options.database,
			eventLog: this.eventLog,
			pty: options.terminalPty,
		});
		this.configService = new GuiConfigService(options.database);
		this.accessPolicyService = options.accessPolicyService ?? new AccessPolicyService(options.database);
		this.approvalService =
			options.approvalService ??
			new ApprovalService(options.database, this.accessPolicyService, (event) =>
				this.options.publish(event as OutboundMessage),
			);
		this.gitMutationService = new GitMutationService({
			approvalService: this.approvalService,
			diffService: this.diffService,
		});
		this.checkpointService = new CheckpointService({ database: options.database, eventLog: this.eventLog });
		this.integrationService = new IntegrationService({
			database: options.database,
			runner: options.integrationRunner,
		});
	}

	handleNotification(notification: ClientNotification): void {
		switch (notification.method) {
			case "extension/ui/closed":
				this.options.extensionUiRouter?.close(notification.params.requestId);
				return;
			default:
				return;
		}
	}
	async handle(request: AppRouterRequest): Promise<unknown> {
		const v1Route = await handleV1Request(
			{
				database: this.options.database,
				authority: {
					startTurn: async (params) =>
						this.options.controller.startTurn({
							sessionId: params.threadId,
							turnId: params.turnId,
							prompt: params.prompt,
							context: {
								attachmentIds: params.attachmentIds,
								filePaths: params.filePaths,
								model: params.model,
								effort: params.effort,
								draftState: params.draftState,
							},
						}),
					cancelTurn: async (params) =>
						this.options.controller.interruptTurn({ sessionId: params.threadId, turnId: params.turnId }),
				},
				workspaceTargets: {
					list: (params) => this.listWorkspaceTargetsV1(params),
					validate: (params) => this.validateWorkspaceTargetV1(params),
				},
				threads: {
					create: (params) => this.createThreadV1(params),
					list: (params) => this.listThreadsV1(params),
					resume: (params) => this.resumeThreadV1(params),
				},
				beforeStartTurn: async (threadId, turnId) => {
					const runsIn = await this.validateStoredTurnTarget(threadId);
					await this.checkpointService.create({
						cwd: runsIn.canonicalPath,
						sessionId: threadId,
						turnId,
						label: `Before ${turnId}`,
					});
				},
				afterStartTurn: async (threadId) => {
					const runsIn = await this.validateStoredTurnTarget(threadId);
					this.workspaceSelectionService.setValidated({ projectId: runsIn.projectId, sessionId: threadId });
				},
				saveInlineAttachment: (attachment) => this.saveInlineV1Attachment(attachment),
				providerSnapshot: () => this.providerSnapshotV1(),
				rollbackThread: (params) => this.rollbackThreadV1(params),
				approvals: {
					list: (params) => this.approvalService.listV1(params),
					decide: (params) => this.approvalService.decideV1(params),
					answer: (params) => this.approvalService.answerInputV1(params),
				},
			},
			request,
			this.v1Router,
		);
		if (v1Route.handled) return v1Route.result;
		const phase3V1Route = await this.handlePhase3V1Request(request);
		if (phase3V1Route.handled) return phase3V1Route.result;
		switch (request.method) {
			case "initialize":
				return {
					protocolVersion: request.params.protocolVersion,
					server: { name: "daedalus-app-server", version: "0.1.0" },
					capabilities: {
						events: true,
						sessions: true,
						extensions: true,
						gitMutations: true,
						strictRequestValidation: true,
						initializedGate: true,
						requestSerialization: true,
						threadWorkspaceContract: true,
						threadTimeline: true,
						timelineDeltas: true,
						payloadWindows: true,
						approvalRequests: true,
						userInputRequests: true,
						reconnectReplay: true,
						typedClientTransport: true,
					},
				};
			case "shell/snapshot":
				return {
					snapshot: buildShellSnapshot({ database: this.options.database, projectId: request.params.projectId }),
				};
			case "thread/snapshot":
				return {
					snapshot: buildThreadDetailSnapshot({
						database: this.options.database,
						threadId: request.params.threadId,
						sessionId: request.params.sessionId,
					}),
				};
			case "project/open": {
				const result = this.projectService.open({ path: request.params.path, projectId: request.params.projectId });
				this.projects.set(result.projectId, request.params.path);
				return result;
			}
			case "project/list":
				return { projects: this.projectService.list() };
			case "worktree/list":
				return { worktrees: await this.worktreeService.listMetadata(request.params.projectId) };
			case "worktree/create":
				return this.operationIdempotencyService.run(
					{ operationId: request.params.operationId, method: request.method, payload: request.params },
					async () => {
						const outcome = await this.worktreeService.createOrAdoptWorktree(request.params);
						return outcome.outcome === "created" || outcome.outcome === "adopted-existing"
							? { ...outcome, worktree: outcome.worktree }
							: outcome;
					},
				);
			case "worktree/cleanup-scan":
				return {
					cleanupRisk: await this.worktreeService.cleanupRiskScan(
						request.params.worktreeId,
						request.params.operationId,
					),
				};
			case "worktree/cleanup":
				await this.worktreeService.cleanup(request.params.worktreeId, request.params);
				return { ok: true };
			case "workspace/selection/get":
				return this.workspaceSelectionService.get(request.params.projectId);
			case "workspace/selection/set":
				return this.workspaceSelectionService.set(request.params);
			case "workflow/target/validate":
				return this.validateWorkflowTarget(request.params.target);
			case "session/list":
				return { sessions: (await this.sessionStore.list(request.params)).map(toSessionSummaryDto) };
			case "session/import-jsonl": {
				const session = await this.sessionStore.importJsonl(request.params);
				return { sessionId: session.header.id };
			}
			case "session/export-jsonl":
				return {
					content: await this.sessionStore.exportJsonl(request.params),
					filename: `${request.params.sessionId}.jsonl`,
				};
			case "session/export-html":
				return {
					content: this.sessionToHtml(await this.sessionStore.export(request.params)),
					filename: `${request.params.sessionId}.html`,
				};
			case "session/rename":
				await this.sessionStore.rename({ sessionId: request.params.sessionId, name: request.params.name });
				return { ok: true };
			case "session/archive":
				await this.sessionStore.archive(request.params);
				return { ok: true };
			case "session/delete":
				await this.sessionStore.delete(request.params);
				return { ok: true };
			case "session/stats":
				return this.sessionStats(request.params.sessionId);
			case "session/tree":
				return { roots: await this.sessionTree(request.params) };
			case "session/resume": {
				const session = await this.sessionStore.read({ sessionId: request.params.sessionId });
				const identity = await verifySessionResumeIdentity({
					database: this.options.database,
					sessionId: request.params.sessionId,
					cwd: session.header.cwd,
					sessionFile: `sqlite://${request.params.sessionId}`,
				});
				const result = await this.options.controller.resumeSession({
					cwd: session.header.cwd,
					sessionPath: request.params.sessionId,
					sessionId: request.params.sessionId,
					identity,
				});
				if (result.status === "active" && request.params.prompt)
					await this.options.controller.startTurn({ sessionId: result.sessionId, prompt: request.params.prompt });
				return { sessionId: result.sessionId, status: result.status, identity: result.identity };
			}
			case "session/fork": {
				const source = await this.sessionStore.read({ sessionId: request.params.sessionId });
				const forkId = randomUUID();
				const cwd = request.params.cwd ?? source.header.cwd;
				await this.sessionStore.import({
					session: {
						header: {
							...source.header,
							id: forkId,
							cwd,
							parentSession: source.header.id,
							timestamp: new Date().toISOString(),
						},
						entries: source.entries,
					},
				});
				const result = await this.options.controller.resumeSession({ cwd, sessionPath: forkId, sessionId: forkId });
				if (result.status === "active" && request.params.prompt)
					await this.options.controller.startTurn({ sessionId: result.sessionId, prompt: request.params.prompt });
				return { sessionId: result.sessionId, status: result.status };
			}
			case "session/start":
				return this.operationIdempotencyService.run(
					{ operationId: request.params.operationId, method: request.method, payload: request.params },
					async () => {
						const start = await this.resolveSessionStartTarget(request.params);
						const result = await this.options.controller.startSession({
							cwd: start.cwd,
							prompt: request.params.prompt,
							projectId: start.runsIn.projectId,
							worktreeId: start.runsIn.worktreeId,
							runsIn: start.runsIn,
							context: {
								...request.params,
								projectId: start.runsIn.projectId,
								worktreeId: start.runsIn.worktreeId,
							},
						});
						this.persistActiveSelectionAfterDurableSession(start.runsIn.projectId, result.sessionId);
						return withOperationId(result, request.params.operationId);
					},
				);
			case "session/continue-in-worktree":
				return this.operationIdempotencyService.run(
					{ operationId: request.params.operationId, method: request.method, payload: request.params },
					async () => {
						const source = await this.resolveContinueSourceSession(
							request.params.sourceSessionId,
							request.params.projectId,
						);
						const operationId = request.params.operationId;
						const worktreeOperationId = operationId
							? `${operationId}:worktree`
							: `session-continue-${request.params.sourceSessionId}-${randomUUID()}:worktree`;
						const worktreeOutcome = await this.worktreeService.createOrAdoptWorktree({
							projectId: source.projectId,
							branch: request.params.branch ?? `continue-${request.params.sourceSessionId}`,
							path: request.params.path,
							baseBranch: request.params.baseBranch,
							operationId: worktreeOperationId,
						});
						if (worktreeOutcome.outcome !== "created" && worktreeOutcome.outcome !== "adopted-existing") {
							throw new Error(`Unable to create worktree for continuation: ${worktreeOutcome.outcome}`);
						}
						const validation = await validateWorktreeTarget({
							database: this.options.database,
							projectId: source.projectId,
							worktreeId: worktreeOutcome.worktree.id,
						});
						if (validation.status !== "valid") throw new Error(`Unsafe worktree target: ${validation.reason}`);
						const result = await this.options.controller.startSession({
							cwd: validation.runsIn.canonicalPath,
							prompt: request.params.prompt,
							projectId: validation.runsIn.projectId,
							worktreeId: validation.runsIn.worktreeId,
							runsIn: validation.runsIn,
							parentSessionId: request.params.sourceSessionId,
							context: {
								...request.params,
								projectId: validation.runsIn.projectId,
								worktreeId: validation.runsIn.worktreeId,
							},
						});
						this.persistActiveSelectionAfterDurableSession(validation.runsIn.projectId, result.sessionId);
						return {
							sessionId: result.sessionId,
							parentSessionId: request.params.sourceSessionId,
							worktree: worktreeOutcome.worktree,
							runsIn: validation.runsIn,
							...(operationId ? { operationId } : {}),
						};
					},
				);
			case "turn/start":
				return this.operationIdempotencyService.run(
					{ operationId: request.params.operationId, method: request.method, payload: request.params },
					async () => {
						const runsIn = await this.validateStoredTurnTarget(request.params.sessionId);
						const result = await this.options.controller.startTurn(request.params);
						this.workspaceSelectionService.setValidated({
							projectId: runsIn.projectId,
							sessionId: request.params.sessionId,
						});
						return withOperationId(result, request.params.operationId);
					},
				);
			case "turn/cancel":
				await this.options.controller.interruptTurn(request.params);
				return {};
			case "session/stop":
				await this.options.controller.disposeSession(request.params.sessionId);
				return {};
			case "runtime/get-state":
				return this.runtimeControlService.getState(request.params.sessionId);
			case "runtime/set-model":
				return this.runtimeControlService.setModel(
					request.params.sessionId,
					request.params.provider,
					request.params.modelId,
				);
			case "runtime/cycle-model":
				return this.runtimeControlService.cycleModel(request.params.sessionId);
			case "runtime/set-thinking":
				return this.runtimeControlService.setThinking(request.params.sessionId, request.params.level);
			case "runtime/cycle-thinking":
				return this.runtimeControlService.cycleThinking(request.params.sessionId);
			case "runtime/set-tools":
				return this.runtimeControlService.setTools(request.params.sessionId, request.params.tools);
			case "runtime/set-steering-mode":
				return this.runtimeControlService.setSteeringMode(request.params.sessionId, request.params.mode);
			case "runtime/set-follow-up-mode":
				return this.runtimeControlService.setFollowUpMode(request.params.sessionId, request.params.mode);
			case "runtime/compact":
				return this.runtimeControlService.compact(request.params.sessionId, request.params.customInstructions);
			case "runtime/abort":
				return this.runtimeControlService.abort(request.params.sessionId);
			case "runtime/reload-resources":
				return this.runtimeControlService.reloadResources(request.params.sessionId);
			case "runtime/get-commands":
				return this.runtimeControlService.getCommands(request.params.sessionId);
			case "runtime/get-keybindings":
				return this.runtimeControlService.getKeybindings();
			case "settings/read":
				return this.settingsService.read();
			case "settings/set":
				return this.settingsService.set(
					request.params.scope,
					request.params.key as SettingsKey,
					request.params.value,
				);
			case "settings/reset":
				return this.settingsService.reset(request.params.scope, request.params.key as SettingsKey);
			case "settings/reload-resources":
				await this.settingsService.reloadResources();
				return this.settingsService.read();
			case "resources/list":
				return this.resourceManagementService.list();
			case "resources/reload":
				return this.resourceManagementService.reload();
			case "resources/install":
				return { resource: this.resourceManagementService.install(request.params) };
			case "resources/remove":
				return this.resourceManagementService.remove(request.params);
			case "resources/update":
				return { resource: this.resourceManagementService.update(request.params) };
			case "resources/enable":
				return { resource: this.resourceManagementService.enable(request.params) };
			case "resources/disable":
				return { resource: this.resourceManagementService.disable(request.params) };
			case "terminal/create": {
				const params = await this.validateTerminalCreate(request.params);
				return { terminal: await this.terminalService.create(params) };
			}
			case "terminal/list":
				return { terminals: this.terminalService.list(request.params) };
			case "terminal/attach":
				return { terminal: this.terminalService.attach(request.params.terminalId) };
			case "terminal/detach":
				return { terminal: this.terminalService.detach(request.params.terminalId) };
			case "terminal/input":
				this.terminalService.input(request.params.terminalId, request.params.data);
				return {};
			case "terminal/resize":
				return {
					terminal: this.terminalService.resize(request.params.terminalId, {
						cols: request.params.cols,
						rows: request.params.rows,
					}),
				};
			case "terminal/kill":
				return { terminal: this.terminalService.kill(request.params.terminalId) };
			case "terminal/replay":
				return this.terminalService.replay(request.params.terminalId, request.params.afterSeq);
			case "checkpoint/list":
				return { checkpoints: this.listCheckpoints(request.params.sessionId) };
			case "checkpoint/create": {
				const session = await this.sessionStore.read({ sessionId: request.params.sessionId });
				const checkpoint = await this.checkpointService.create({
					cwd: session.header.cwd,
					sessionId: request.params.sessionId,
					turnId: request.params.turnId,
					label: request.params.label,
				});
				return { checkpoint };
			}
			case "checkpoint/restore": {
				const checkpoints = this.listCheckpoints(request.params.sessionId);
				const checkpoint = checkpoints.find((item) => item.checkpointId === request.params.checkpointId);
				if (!checkpoint) throw new Error(`Unknown checkpoint ${request.params.checkpointId}`);
				const session = await this.sessionStore.read({ sessionId: request.params.sessionId });
				const checkpointRef = checkpoint.ref ?? checkpoint.checkpointId;
				const result = await this.gitMutationService.restoreCheckpoint({
					cwd: session.header.cwd,
					checkpointRef,
					sessionId: request.params.sessionId,
				});
				return { ...result, checkpoint };
			}
			case "diff/get": {
				const cwd = await this.resolveDiffGetCwd(request.params);
				return { diff: await this.diffService.get(cwd) };
			}
			case "git/stage": {
				const cwd = await this.resolveProjectOrWorktreeCwd(request.params.diffId);
				return this.gitMutationService.stage({ cwd, paths: request.params.paths });
			}
			case "git/unstage": {
				const cwd = await this.resolveProjectOrWorktreeCwd(request.params.diffId);
				return this.gitMutationService.unstage({ cwd, paths: request.params.paths });
			}
			case "git/discard": {
				const cwd = await this.resolveProjectOrWorktreeCwd(request.params.diffId);
				return this.gitMutationService.discard({ cwd, paths: request.params.paths });
			}
			case "git/commit": {
				const cwd = await this.resolveProjectOrWorktreeCwd(request.params.diffId);
				return this.gitMutationService.commit({ cwd, message: request.params.message });
			}
			case "git/checkpoint-restore": {
				const cwd = await this.resolveProjectOrWorktreeCwd(request.params.diffId);
				return this.gitMutationService.restoreCheckpoint({ cwd, checkpointRef: request.params.checkpointRef });
			}
			case "composer/file-search": {
				const target = await this.resolveFileSearchTarget(request.params);
				return {
					files: await this.fileSearchService.search({
						cwd: target.canonicalTargetPath,
						query: request.params.query,
						limit: request.params.limit ?? 20,
					}),
				};
			}
			case "composer/command-list":
				return { commands: this.commandService.list() };
			case "composer/attachment/save":
				return { attachment: await this.attachmentService.save(request.params) };
			case "composer/attachment/get":
				return { attachment: await this.attachmentService.get(request.params.attachmentId) };
			case "config/get":
				return { config: this.configService.get(request.params.key) };
			case "config/set": {
				this.configService.set(request.params.key, request.params.value);
				this.options.publish({
					kind: "notification",
					method: "config/changed",
					params: { key: request.params.key },
				});
				return { config: this.configService.get(request.params.key) };
			}
			case "model/list": {
				const settings = await this.settingsService.read();
				return {
					models: settings.models,
					selectedModel: settings.selectedModel,
				};
			}
			case "model/select": {
				const settings = await this.settingsService.read();
				const selected = findSelectableModel(settings.models, request.params.model, settings.selectedProvider);
				if (!selected) throw new Error(`Unknown model: ${request.params.model}`);
				await this.settingsService.set("global", "defaultModel", selected.id);
				this.configService.set("model.selected", selected.id);
				this.options.publish({
					kind: "notification",
					method: "model/changed",
					params: { model: selected.id },
				});
				return { model: selected.id };
			}
			case "auth/status":
				return this.providerAuthService.status(request.params.provider);
			case "auth/login":
				return this.providerAuthService.login(request.params.provider);
			case "auth/logout":
				return this.providerAuthService.logout(request.params.provider);
			case "access/get":
				return { policy: this.accessPolicyService.getPolicy() };
			case "access/set": {
				const policy = this.accessPolicyService.setMode(request.params.mode);
				this.options.publish({ kind: "notification", method: "access/changed", params: { mode: policy.mode } });
				return { policy };
			}
			case "extension/ui/respond":
				this.options.extensionUiRouter?.respond(request.params);
				return {};
			case "approval/list":
				return { approvals: this.approvalService.list(request.params.sessionId) };
			case "approval/respond":
				this.approvalService.resolve(request.params);
				return {};
			case "integration/list": {
				const cwd =
					request.params && "projectId" in request.params
						? this.projects.get(String(request.params.projectId))
						: undefined;
				return { integrations: await this.integrationService.list({ cwd }) };
			}
			case "integration/connect": {
				const state = await this.integrationService.connect({ provider: request.params.provider });
				this.options.publish({
					kind: "notification",
					method: "integration/changed",
					params: { provider: state.provider, status: state.status },
				});
				return { integration: state };
			}
			case "integration/disconnect":
				return { integrations: await this.integrationService.disconnect({ provider: request.params.provider }) };
			case "integration/link":
				return { integration: await this.integrationService.linkArtifact(request.params) };
			case "integration/import":
				return { integration: await this.integrationService.importArtifacts(request.params) };
			case "integration/pr-create": {
				const cwd = request.params.projectId ? this.projects.get(String(request.params.projectId)) : undefined;
				const summary = `Create GitHub pull request "${request.params.title}" from ${request.params.head}${request.params.base ? ` into ${request.params.base}` : ""}`;
				const approval = this.approvalService.request({
					request: {
						action: "integration/pr-create",
						summary,
						provider: request.params.provider,
						head: request.params.head,
						base: request.params.base,
					},
					hardBlock: true,
				});
				if (!approval.autoApproved) {
					const decision = await this.approvalService.waitForDecision(approval.approvalId, { timeoutMs: 60_000 });
					if (decision.decision !== "approved")
						return {
							pullRequest: { status: "failed", message: decision.reason ?? "Pull request creation denied." },
						};
				}
				const pullRequest = await this.integrationService.createPullRequest({ ...request.params, cwd });
				if (cwd) await this.integrationService.list({ cwd });
				return { pullRequest };
			}
			case "integration/pr-open": {
				const cwd = request.params.projectId ? this.projects.get(String(request.params.projectId)) : undefined;
				return {
					ok: await this.integrationService.openPullRequest(request.params.provider, request.params.url, cwd),
				};
			}
			case "diagnostics/export":
				return new ExportService({
					database: this.options.database,
					runtimeDiagnostics: () => this.options.controller.readState?.(),
					restorationTrace: () => this.workspaceSelectionService.lastRestorationTrace(),
				}).export(request.params);
			case "orchestration/read":
				return projectOrchestration(this.recentAppEvents());
			case "daedalus/workflow/read":
				return this.daedalusWorkflowService.read(request.params.sessionId);
			case "audit/query":
				return projectAuditTrail(this.recentAppEvents(), request.params as AuditQuery);
			case "automation/read":
				return this.automationService.readProjection();
			case "event/replay": {
				const after = Number(request.params.cursor?.after ?? 0);
				const limit = request.params.cursor?.limit ?? 1000;
				const stored = readEventsAfter(this.options.database, Number.isFinite(after) ? after : 0, { limit });
				const replayEvents = stored
					.map((event) => event.payload as unknown as AppEvent)
					.filter((event) => !request.params.types || request.params.types.includes(event.type));
				return {
					events: replayEvents,
					next: replayEvents.length ? { after: String(stored.at(-1)?.seq ?? after) } : undefined,
				};
			}
			default:
				throw Object.assign(new Error(`Unsupported app-server method: ${request.method}`), {
					code: "method_not_found",
				});
		}
	}

	private async validateTerminalCreate(
		params: import("../terminal/terminal-protocol").TerminalCreateParams,
	): Promise<import("../terminal/terminal-protocol").TerminalCreateParams> {
		const guardTarget = params.guardTarget
			? await resolveRootScopedTarget({ database: this.options.database, target: params.guardTarget })
			: undefined;
		const requestedCwd = resolve(params.cwd);
		const scopedTargets: Array<{ root: string; candidate: string; projectId?: string }> = [];
		let sessionRunsIn: WorkflowRunsInTarget | undefined;
		if (params.sessionId) {
			const projectId = params.projectId ?? this.projectIdForSession(params.sessionId);
			const session = listProjectSessions(this.options.database, projectId).find(
				(row) => row.id === params.sessionId,
			);
			if (!session) throw new Error(`Unknown terminal session target: ${params.sessionId}`);
			if (!session.runsIn || session.runsIn.validationStatus !== "valid")
				throw new Error(`Session ${params.sessionId} does not have a valid terminal target`);
			if (params.projectId && session.runsIn.projectId !== params.projectId)
				throw new Error(`Session ${params.sessionId} does not belong to project ${params.projectId}`);
			if ((params.worktreeId ?? session.runsIn.worktreeId) !== session.runsIn.worktreeId)
				throw new Error(`Session ${params.sessionId} does not match worktree ${params.worktreeId}`);
			sessionRunsIn = session.runsIn;
			scopedTargets.push({
				root: sessionRunsIn.canonicalPath,
				candidate: requestedCwd,
				projectId: sessionRunsIn.projectId,
			});
		}
		if (guardTarget) {
			scopedTargets.push({
				root: guardTarget.canonicalRootPath,
				candidate: requestedCwd,
				projectId: guardTarget.projectId,
			});
		}
		if (params.projectId) {
			const project = this.projectService.get(params.projectId);
			if (!project) throw new Error(`Unknown project: ${params.projectId}`);
			if (sessionRunsIn && sessionRunsIn.projectId !== project.id)
				throw new Error(`Session ${params.sessionId} does not belong to project ${params.projectId}`);
			scopedTargets.push({ root: project.path, candidate: requestedCwd, projectId: project.id });
		}
		if (params.worktreeId) {
			const worktree = this.worktreeService.open(params.worktreeId);
			if (!worktree) throw new Error(`Unknown worktree: ${params.worktreeId}`);
			if (params.projectId && worktree.projectId !== params.projectId)
				throw new Error(`Worktree ${params.worktreeId} does not belong to project ${params.projectId}`);
			if (sessionRunsIn && sessionRunsIn.worktreeId !== worktree.id)
				throw new Error(`Session ${params.sessionId} does not match worktree ${params.worktreeId}`);
			scopedTargets.push({ root: worktree.path, candidate: requestedCwd, projectId: worktree.projectId });
		}
		let cwd = requestedCwd;
		for (const target of scopedTargets) {
			const scoped = await assertPathWithinRoot({
				root: target.root,
				candidate: target.candidate,
				purpose: "terminal",
				projectId: target.projectId,
			});
			cwd = scoped.canonicalTargetPath;
		}
		return { ...params, cwd, guardTarget };
	}

	private listCheckpoints(sessionId: string): Array<{
		checkpointId: string;
		sessionId: string;
		worktreeId?: string;
		label?: string | null;
		ref?: string;
		commit?: string;
		metadata: Record<string, unknown>;
		createdAt: string;
	}> {
		const rows = this.options.database
			.query<
				{
					id: string;
					session_id: string;
					worktree_id: string | null;
					label: string | null;
					metadata: string | null;
					created_at: string;
				},
				[string]
			>(
				"SELECT id, session_id, worktree_id, label, metadata, created_at FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC, id ASC",
			)
			.all(sessionId);
		const rawById = new Map<string, Record<string, unknown>>();
		for (const event of readEventsAfter(this.options.database, 0, { limit: 10_000 })) {
			if (event.type !== "checkpoint/created") continue;
			const payload = event.payload as Record<string, unknown>;
			if (typeof payload.checkpointId === "string") rawById.set(payload.checkpointId, payload);
		}
		return rows.map((row) => {
			const raw = rawById.get(row.id);
			return {
				checkpointId: row.id,
				sessionId: row.session_id,
				worktreeId: row.worktree_id ?? undefined,
				label: row.label,
				ref: typeof raw?.ref === "string" ? raw.ref : undefined,
				commit: typeof raw?.commit === "string" ? raw.commit : undefined,
				metadata: parseJsonObject(row.metadata),
				createdAt: row.created_at,
			};
		});
	}

	private async resolveDiffGetCwd(params: { diffId?: string; target?: DiffTarget }): Promise<string> {
		if (params.target) return this.resolveDiffTargetCwd(params.target);
		if (!params.diffId) throw new Error("diff/get requires a structured target or legacy diffId");
		return this.resolveProjectOrWorktreeCwd(params.diffId);
	}

	private async resolveDiffTargetCwd(target: DiffTarget): Promise<string> {
		if (target.kind === "session") {
			const projectId = target.projectId ?? this.projectIdForSession(target.sessionId);
			return (
				await resolveRootScopedTarget({
					database: this.options.database,
					target: { kind: "session", projectId, sessionId: target.sessionId },
				})
			).canonicalTargetPath;
		}
		return (
			await resolveRootScopedTarget({
				database: this.options.database,
				target,
			})
		).canonicalTargetPath;
	}

	private async resolveProjectOrWorktreeCwd(diffId: string): Promise<string> {
		const project = this.projectService.get(diffId);
		if (project) {
			return (
				await resolveRootScopedTarget({
					database: this.options.database,
					target: { kind: "project", projectId: project.id },
				})
			).canonicalTargetPath;
		}
		const worktree = this.worktreeService.open(diffId);
		if (worktree) {
			return (
				await resolveRootScopedTarget({
					database: this.options.database,
					target: { kind: "worktree", projectId: worktree.projectId, worktreeId: worktree.id },
				})
			).canonicalTargetPath;
		}
		throw new Error(`Unknown diff target: ${diffId}`);
	}

	private async resolveFileSearchTarget(params: { projectId: string; worktreeId?: string }) {
		if (params.worktreeId) {
			return resolveRootScopedTarget({
				database: this.options.database,
				target: { kind: "worktree", projectId: params.projectId, worktreeId: params.worktreeId },
			});
		}
		return resolveRootScopedTarget({
			database: this.options.database,
			target: { kind: "project", projectId: params.projectId },
		});
	}

	private projectIdForSession(sessionId: string): string {
		for (const project of this.projectService.list()) {
			const session = listProjectSessions(this.options.database, project.id).find((row) => row.id === sessionId);
			if (session?.projectId) return session.projectId;
		}
		const selected = this.options.database
			.query<{ project_id: string }, [string]>(
				"SELECT project_id FROM workspace_active_selection WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1",
			)
			.get(sessionId);
		if (selected?.project_id) return selected.project_id;
		throw new Error(`Unknown session: ${sessionId}`);
	}

	private async resolveContinueSourceSession(
		sessionId: string,
		requestedProjectId?: string,
	): Promise<{ projectId: string; runsIn: WorkflowRunsInTarget }> {
		projectRuntimeEvents(this.options.database);
		const row = this.options.database
			.query<{ project_id: string | null; runs_in_json: string | null }, [string]>(
				"SELECT project_id, runs_in_json FROM sessions WHERE id = ? LIMIT 1",
			)
			.get(sessionId);
		if (!row) throw new Error(`Unknown source session: ${sessionId}`);
		if (!row.runs_in_json) throw new Error(`Source session ${sessionId} has no stored workspace target`);
		const runsIn = JSON.parse(row.runs_in_json) as WorkflowRunsInTarget;
		const projectId = runsIn.projectId ?? row.project_id;
		if (!projectId) throw new Error(`Source session ${sessionId} has no stored project target`);
		if (requestedProjectId && requestedProjectId !== projectId)
			throw new Error(`Source session ${sessionId} belongs to project ${projectId}, not ${requestedProjectId}`);
		if (runsIn.isolationMode !== "isolated-worktree" && runsIn.isolationMode !== "base-checkout")
			throw new Error(`Unsupported source session target for ${sessionId}`);
		return { projectId, runsIn };
	}

	private persistActiveSelectionAfterDurableSession(projectId: string, sessionId: string): void {
		projectRuntimeEvents(this.options.database);
		const row = this.options.database
			.query<{ project_id: string | null }, [string]>("SELECT project_id FROM sessions WHERE id = ? LIMIT 1")
			.get(sessionId);
		if (!row) throw new Error(`Session ${sessionId} was not durably persisted`);
		if (row.project_id !== projectId)
			throw new Error(`Session ${sessionId} was not durably persisted in project ${projectId}`);
		this.workspaceSelectionService.set({ projectId, sessionId });
	}
	private async validateStoredTurnTarget(sessionId: string): Promise<WorkflowRunsInTarget> {
		const row = this.options.database
			.query<{ project_id: string | null; worktree_id: string | null; runs_in_json: string | null }, [string]>(
				"SELECT project_id, worktree_id, runs_in_json FROM sessions WHERE id = ? LIMIT 1",
			)
			.get(sessionId);
		if (!row) throw new Error(`Unknown session: ${sessionId}`);
		if (!row.runs_in_json)
			throw new Error(
				`Session ${sessionId} has no stored workspace target; repair session target before starting a turn`,
			);
		const runsIn = JSON.parse(row.runs_in_json) as WorkflowRunsInTarget;
		const projectId = runsIn.projectId ?? row.project_id;
		if (!projectId)
			throw new Error(
				`Session ${sessionId} has no stored project target; repair session target before starting a turn`,
			);

		if (runsIn.isolationMode === "isolated-worktree") {
			const worktreeId = runsIn.worktreeId ?? row.worktree_id;
			if (!worktreeId)
				throw new Error(
					`Session ${sessionId} has no stored worktree target; repair session target before starting a turn`,
				);
			const validation = await validateWorktreeTarget({ database: this.options.database, projectId, worktreeId });
			if (validation.status !== "valid") throw new Error(`Unsafe worktree target: ${validation.reason}`);
			return validation.runsIn;
		}

		if (runsIn.isolationMode === "base-checkout") {
			const project = this.projectService.get(projectId);
			if (!project) throw new Error(`Unknown project: ${projectId}`);
			const projectStat = await lstat(project.path);
			if (projectStat.isSymbolicLink()) throw new Error(`Project path is a symlink: ${project.path}`);
			const canonicalPath = await realpath(project.path);
			const status = await gitStatus(canonicalPath);
			return {
				projectId,
				path: project.path,
				canonicalPath,
				branch: status.branch ?? "",
				isolationMode: "base-checkout",
				validationStatus: "valid",
			};
		}

		throw new Error(`Unsupported stored workspace target for session ${sessionId}`);
	}

	private async validateWorkflowTarget(
		params:
			| { mode: "isolated-worktree"; projectId: string; worktreeId: string }
			| { mode: "base-checkout"; projectId: string; confirmation: { confirmed: true; evidence: string } },
	): Promise<{ valid: boolean; runsIn?: WorkflowRunsInTarget; reason?: string }> {
		try {
			const resolved = await this.resolveSessionStartTarget({ projectId: params.projectId, startTarget: params });
			return { valid: true, runsIn: resolved.runsIn };
		} catch (error) {
			return { valid: false, reason: error instanceof Error ? error.message : String(error) };
		}
	}

	private async listWorkspaceTargetsV1(
		params: protocolV1.WorkspaceTargetListParams,
	): Promise<protocolV1.WorkspaceTargetListResult> {
		const project = this.projectService.get(params.projectId);
		if (!project) throw new Error(`Unknown project: ${params.projectId}`);
		const [base, worktrees] = await Promise.all([
			this.baseWorkspaceTargetV1(project),
			this.worktreeService.listMetadata(params.projectId),
		]);
		return { targets: [base, ...worktrees.map((worktree) => worktreeWorkspaceTargetV1(worktree))] };
	}

	private async validateWorkspaceTargetV1(
		params: protocolV1.WorkspaceTargetValidateParams,
	): Promise<protocolV1.WorkspaceTargetValidateResult> {
		if (params.workspaceTargetId.startsWith("base:")) {
			const projectId = params.workspaceTargetId.slice("base:".length);
			const project = this.projectService.get(projectId);
			if (!project) throw new Error(`Unknown workspace target: ${params.workspaceTargetId}`);
			return { workspaceTarget: await this.baseWorkspaceTargetV1(project) };
		}
		const worktree = (await this.worktreeService.listMetadata()).find(
			(candidate) => candidate.id === params.workspaceTargetId,
		);
		if (!worktree) throw new Error(`Unknown workspace target: ${params.workspaceTargetId}`);
		return { workspaceTarget: worktreeWorkspaceTargetV1(worktree) };
	}

	private async createThreadV1(params: protocolV1.ThreadCreateParams): Promise<protocolV1.ThreadCreateResult> {
		const target = await this.resolveThreadCreateTargetV1(params.projectId, params.workspaceTargetId);
		const result = await this.options.controller.startSession({
			cwd: target.cwd,
			prompt: params.prompt,
			projectId: target.runsIn.projectId,
			worktreeId: target.runsIn.worktreeId,
			runsIn: target.runsIn,
			context: {
				projectId: target.runsIn.projectId,
				worktreeId: target.runsIn.worktreeId,
				model: params.model,
				effort: params.effort,
				draftState: params.draftState,
			},
		});
		projectRuntimeEvents(this.options.database);
		this.persistActiveSelectionAfterDurableSession(target.runsIn.projectId, result.sessionId);
		const snapshot = buildThreadV1Snapshot({ database: this.options.database, threadId: result.sessionId });
		return { thread: snapshot.thread, turn: snapshot.turns.at(-1) };
	}

	private async listThreadsV1(params: protocolV1.ThreadListParams): Promise<protocolV1.ThreadListResult> {
		projectRuntimeEvents(this.options.database);
		const threads = listProjectSessions(this.options.database, params.projectId)
			.map((session) => buildThreadV1Snapshot({ database: this.options.database, threadId: session.id }).thread)
			.filter((thread) => !params.workspaceTargetId || thread.workspaceTargetId === params.workspaceTargetId);
		return { threads };
	}

	private async resumeThreadV1(params: protocolV1.ThreadResumeParams): Promise<protocolV1.ThreadResumeResult> {
		const runsIn = await this.validateStoredTurnTarget(params.threadId);
		const active = this.options.controller
			.readState()
			.sessions.some((session) => session.sessionId === params.threadId);
		if (!active) {
			await this.options.controller.resumeSession({
				cwd: runsIn.canonicalPath,
				sessionPath: params.threadId,
				sessionId: params.threadId,
			});
		}
		let turnId: string | undefined;
		if (params.prompt) {
			const result = await this.options.controller.startTurn({
				sessionId: params.threadId,
				prompt: params.prompt,
				context: {
					model: params.model,
					effort: params.effort,
					draftState: params.draftState,
				},
			});
			turnId = result.turnId;
		}
		projectRuntimeEvents(this.options.database);
		const snapshot = buildThreadV1Snapshot({ database: this.options.database, threadId: params.threadId });
		return {
			thread: snapshot.thread,
			turn: turnId ? snapshot.turns.find((turn) => turn.turnId === turnId) : undefined,
		};
	}

	private async resolveThreadCreateTargetV1(
		projectId: string,
		workspaceTargetId: string,
	): Promise<{ cwd: string; runsIn: WorkflowRunsInTarget }> {
		if (workspaceTargetId === `base:${projectId}`) {
			return this.resolveSessionStartTarget({
				projectId,
				startTarget: {
					mode: "base-checkout",
					projectId,
					confirmation: { confirmed: true, evidence: "v1 thread.create selected base checkout workspace target" },
				},
			});
		}
		return this.resolveSessionStartTarget({
			projectId,
			startTarget: { mode: "isolated-worktree", projectId, worktreeId: workspaceTargetId },
		});
	}

	private async baseWorkspaceTargetV1(project: {
		readonly id: string;
		readonly path: string;
		readonly updatedAt: string;
	}): Promise<protocolV1.WorkspaceTarget> {
		try {
			const canonicalPath = await realpath(project.path);
			const status = await gitStatus(canonicalPath);
			const dirtyCount = status.stagedCount + status.unstagedCount;
			return {
				id: `base:${project.id}`,
				kind: "base-checkout",
				projectId: project.id,
				path: canonicalPath,
				branch: status.branch,
				validationStatus: dirtyCount > 0 ? "needs-confirmation" : "valid",
				dirtyState: dirtyCount > 0 ? "dirty" : "clean",
				activeThreadCount: activeThreadCountForTarget(this.options.database, project.id),
				safetySignals:
					dirtyCount > 0
						? [
								{
									level: "warning",
									message: "Base checkout has uncommitted changes.",
									code: "base-checkout-dirty",
								},
							]
						: [],
				updatedAt: project.updatedAt,
			};
		} catch (error) {
			return {
				id: `base:${project.id}`,
				kind: "base-checkout",
				projectId: project.id,
				path: project.path,
				branch: null,
				validationStatus: "blocked",
				dirtyState: "unknown",
				activeThreadCount: activeThreadCountForTarget(this.options.database, project.id),
				safetySignals: [
					{
						level: "blocked",
						message: error instanceof Error ? error.message : String(error),
						code: "base-checkout-unavailable",
					},
				],
				updatedAt: project.updatedAt,
			};
		}
	}

	private async resolveSessionStartTarget(params: {
		projectId?: string;
		startTarget?:
			| { mode: "isolated-worktree"; projectId: string; worktreeId: string }
			| { mode: "base-checkout"; projectId: string; confirmation: { confirmed: true; evidence: string } };
	}): Promise<{ cwd: string; runsIn: WorkflowRunsInTarget }> {
		const projectId = params.startTarget?.projectId ?? params.projectId;
		if (!projectId) throw new Error("session/start requires projectId");
		if (!params.startTarget) throw new Error("session/start requires explicit startTarget");
		if (params.startTarget.mode === "isolated-worktree") {
			const validation = await validateWorktreeTarget({
				database: this.options.database,
				projectId,
				worktreeId: params.startTarget.worktreeId,
			});
			if (validation.status !== "valid") throw new Error(`Unsafe worktree target: ${validation.reason}`);
			return { cwd: validation.runsIn.canonicalPath, runsIn: validation.runsIn };
		}
		if (params.startTarget.confirmation?.confirmed !== true)
			throw new Error("base-checkout start requires explicit confirmation");
		const project = this.projectService.get(projectId);
		if (!project) throw new Error(`Unknown project: ${projectId}`);
		const projectStat = await lstat(project.path);
		if (projectStat.isSymbolicLink()) throw new Error(`Project path is a symlink: ${project.path}`);
		const canonicalPath = await realpath(project.path);
		const status = await gitStatus(canonicalPath);
		return {
			cwd: canonicalPath,
			runsIn: {
				projectId,
				path: project.path,
				canonicalPath,
				branch: status.branch ?? "",
				isolationMode: "base-checkout",
				validationStatus: "valid",
			},
		};
	}
	private async handlePhase3V1Request(request: unknown): Promise<{ handled: boolean; result?: unknown }> {
		if (!request || typeof request !== "object") return { handled: false };
		const method = (request as { method?: unknown }).method;
		const params = (request as { params?: unknown }).params;
		switch (method) {
			case "v1.diff.summary":
				return { handled: true, result: await this.handleDiffSummaryV1(params as protocolV1.DiffSummaryParams) };
			case "v1.diff.fileWindow":
				return {
					handled: true,
					result: await this.handleDiffFileWindowV1(params as protocolV1.DiffFileWindowParams),
				};
			case "v1.terminal.open":
				return { handled: true, result: await this.handleTerminalOpenV1(params as protocolV1.TerminalOpenParams) };
			case "v1.terminal.input":
				return { handled: true, result: this.handleTerminalInputV1(params as protocolV1.TerminalInputParams) };
			case "v1.terminal.resize":
				return { handled: true, result: this.handleTerminalResizeV1(params as protocolV1.TerminalResizeParams) };
			case "v1.terminal.close":
				return { handled: true, result: this.handleTerminalCloseV1(params as protocolV1.TerminalCloseParams) };
			case "v1.terminal.replay":
				return { handled: true, result: this.handleTerminalReplayV1(params as protocolV1.TerminalReplayParams) };
			default:
				return { handled: false };
		}
	}

	private async handleDiffSummaryV1(params: protocolV1.DiffSummaryParams): Promise<protocolV1.DiffSummaryResult> {
		const target = await this.resolveV1WorkspaceTarget(params.threadId, params.workspaceTargetId);
		if (!target.ok) return diffTargetMismatch(params, target.actualWorkspaceTargetId, target.message);
		return this.diffService.getSummaryV1(target.cwd, params);
	}

	private async handleDiffFileWindowV1(
		params: protocolV1.DiffFileWindowParams,
	): Promise<protocolV1.DiffFileWindowResult> {
		const target = await this.resolveV1WorkspaceTarget(params.threadId, params.workspaceTargetId);
		if (!target.ok) return diffTargetMismatch(params, target.actualWorkspaceTargetId, target.message);
		return this.diffService.getFileWindowV1(target.cwd, params);
	}

	private async handleTerminalOpenV1(
		params: protocolV1.TerminalOpenParams,
	): Promise<protocolV1.TerminalCommandResult> {
		const target = await this.resolveV1WorkspaceTarget(params.threadId, params.workspaceTargetId);
		if (!target.ok) return terminalFailure(params, "workspace-target-blocked", target.message);
		try {
			const record = await this.terminalService.create({
				projectId: target.projectId,
				worktreeId: target.worktreeId,
				sessionId: params.threadId,
				owner: params.route,
				cwd: params.cwd ? resolve(target.cwd, params.cwd) : target.cwd,
				cols: params.cols,
				rows: params.rows,
				guardTarget: target.guardTarget,
				requireRootBoundary: true,
			});
			if (params.initialInput) this.terminalService.input(record.terminalId, params.initialInput);
			return {
				ok: true,
				context: terminalContext(record, params.workspaceTargetId, params.threadId, params.turnId, params.title),
			};
		} catch (error) {
			return terminalFailure(
				params,
				"cwd-outside-workspace",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private handleTerminalInputV1(params: protocolV1.TerminalInputParams): protocolV1.TerminalCommandResult {
		try {
			let record = this.terminalService.get(params.terminalId);
			const mismatch = validateTerminalRecordScope(record, params);
			if (mismatch) return mismatch;
			this.terminalService.input(params.terminalId, params.input);
			record = this.terminalService.get(params.terminalId);
			return {
				ok: true,
				context: terminalContext(record, params.workspaceTargetId, params.threadId, params.turnId),
			};
		} catch (error) {
			return terminalFailure(params, "io-error", error instanceof Error ? error.message : String(error));
		}
	}

	private handleTerminalResizeV1(params: protocolV1.TerminalResizeParams): protocolV1.TerminalCommandResult {
		try {
			const current = this.terminalService.get(params.terminalId);
			const mismatch = validateTerminalRecordScope(current, params);
			if (mismatch) return mismatch;
			const record = this.terminalService.resize(params.terminalId, { cols: params.cols, rows: params.rows });
			return {
				ok: true,
				context: terminalContext(record, params.workspaceTargetId, params.threadId, params.turnId),
			};
		} catch (error) {
			return terminalFailure(params, "not-found", error instanceof Error ? error.message : String(error));
		}
	}

	private handleTerminalCloseV1(params: protocolV1.TerminalCloseParams): protocolV1.TerminalCommandResult {
		try {
			const current = this.terminalService.get(params.terminalId);
			const mismatch = validateTerminalRecordScope(current, params);
			if (mismatch) return mismatch;
			const record = this.terminalService.kill(params.terminalId);
			return {
				ok: true,
				context: terminalContext(record, params.workspaceTargetId, params.threadId, params.turnId),
			};
		} catch (error) {
			return terminalFailure(params, "not-found", error instanceof Error ? error.message : String(error));
		}
	}

	private handleTerminalReplayV1(params: protocolV1.TerminalReplayParams): protocolV1.TerminalReplayResult {
		try {
			const record = this.terminalService.get(params.terminalId);
			const mismatch = validateTerminalRecordScope(record, params);
			if (mismatch) return mismatch;
			const replay = this.terminalService.replay(params.terminalId, params.after?.seq ?? 0);
			const context = terminalContext(record, params.workspaceTargetId, params.threadId, params.turnId);
			const chunks = replay.chunks.slice(0, params.limit).map((chunk) => ({
				cursor: { seq: chunk.seq },
				text: chunk.data,
				byteLength: Buffer.byteLength(chunk.data, "utf8"),
			}));
			const watermark = { seq: chunks.at(-1)?.cursor.seq ?? params.after?.seq ?? 0 };
			return {
				ok: true,
				context,
				chunks,
				watermark,
				nextCursor: replay.nextSeq > watermark.seq ? watermark : undefined,
				previousCursor: params.after,
				hasMoreAfter: replay.nextSeq > watermark.seq + 1,
				hasMoreBefore: Boolean(params.after && params.after.seq > 0),
			};
		} catch (error) {
			return terminalFailure(params, "not-found", error instanceof Error ? error.message : String(error));
		}
	}

	private async providerSnapshotV1(): Promise<protocolV1.ProviderSnapshotResult> {
		let degradedMessage: string | undefined;
		const authStatuses = this.providerAuthService.status().providers;
		const authenticatedProviders = authStatuses.filter((status) => status.authenticated);
		let models: protocolV1.ProviderSnapshotResult["models"] = [];
		try {
			models = (await this.listModels()).map((model) => {
				const record = model as Record<string, unknown>;
				const id = stringOr(record.id, "unknown");
				const provider = stringOr(record.provider, "unknown");
				return {
					slug: slugify(`${provider}-${id}`) || id,
					provider,
					id,
					name: stringOr(record.label, id),
					available: record.available !== false,
					reasoning: record.reasoning === true,
					fastMode: record.supportsFastMode === true || record.fastMode === true,
					reasoningLevels: Array.isArray(record.reasoningLevels)
						? record.reasoningLevels.filter((item): item is string => typeof item === "string")
						: undefined,
				};
			});
		} catch (error) {
			degradedMessage = error instanceof Error ? error.message : String(error);
		}
		return {
			status: degradedMessage ? "degraded" : authenticatedProviders.length > 0 ? "ready" : "auth-needed",
			server: { name: "daedalus-app-server", version: "0.1.0", protocolVersion: "1" },
			capabilities: {
				streamingChat: true,
				cancellation: true,
				approvals: true,
				structuredUserInput: true,
				toolTimeline: true,
				payloadWindows: true,
				diffs: true,
				checkpoints: true,
				rollback: true,
				resume: true,
				modelSwitching: true,
				textGeneration: true,
				imageAttachments: true,
				terminals: true,
			},
			models,
			auth: authStatuses.map((status) => ({
				provider: status.provider,
				status: status.authenticated ? "authenticated" : "unauthenticated",
				message: status.message ?? status.instruction,
			})),
			commands: this.commandService.list().map((command) => ({
				name: command.name,
				description: command.description,
				source: command.source,
			})),
			message: degradedMessage,
		};
	}

	private async rollbackThreadV1(params: protocolV1.ThreadRollbackParams): Promise<protocolV1.ThreadRollbackResult> {
		return this.operationIdempotencyService.run(
			{
				operationId: params.idempotencyKey
					? `v1:thread.rollback:${params.threadId}:${params.idempotencyKey}`
					: undefined,
				method: "thread.rollback",
				payload: params,
			},
			() => this.performRollbackThreadV1(params),
		);
	}

	private async performRollbackThreadV1(
		params: protocolV1.ThreadRollbackParams,
	): Promise<protocolV1.ThreadRollbackResult> {
		if (!Number.isInteger(params.numTurns) || params.numTurns < 1)
			throw new Error(`Invalid numTurns for thread rollback: ${params.numTurns}`);
		const target = await this.resolveV1WorkspaceTarget(params.threadId, params.workspaceTargetId);
		if (!target.ok) throw new Error(target.message);
		const checkpoints = this.listCheckpoints(params.threadId);
		if (checkpoints.length === 0) throw new Error(`No checkpoint available for thread ${params.threadId}`);
		const checkpointIndex = Math.max(0, Math.min(params.numTurns - 1, checkpoints.length - 1));
		const checkpoint = checkpoints[checkpointIndex];
		const checkpointRef = checkpoint.ref ?? checkpoint.checkpointId;
		const rollbackScope = this.rollbackScopeForCheckpoint(params.threadId, checkpoint.checkpointId);
		const mutation = await this.gitMutationService.restoreCheckpoint({
			cwd: target.cwd,
			checkpointRef,
			sessionId: params.threadId,
		});
		const stored = this.eventLog.append({
			streamId: `session:${params.threadId}`,
			type: "thread/rollback",
			payload: {
				threadId: params.threadId,
				workspaceTargetId: params.workspaceTargetId,
				numTurns: params.numTurns,
				restoredCheckpointId: checkpoint.checkpointId,
				restoredToTurnId: checkpoint.checkpointId.split(":").at(-1) ?? null,
				removedTurnIds: [...rollbackScope.removedTurnIds],
				hiddenEventRange: rollbackScope.hiddenEventRange,
				idempotencyKey: params.idempotencyKey ?? null,
			},
		}).event;
		this.options.publish({
			kind: "notification",
			method: "thread.timeline.delta",
			params: { threadId: params.threadId, after: { seq: stored.seq - 1 } },
		} as unknown as OutboundMessage);
		const approvalId =
			mutation && typeof mutation === "object" && "approvalId" in mutation
				? stringOr((mutation as unknown as Record<string, unknown>).approvalId, "")
				: "";
		return {
			threadId: params.threadId,
			restoredCheckpointId: checkpoint.checkpointId,
			restoredToTurnId: checkpoint.checkpointId.split(":").at(-1),
			status: approvalId ? "approval-required" : "completed",
			approvalId: approvalId || undefined,
		};
	}

	private rollbackScopeForCheckpoint(
		threadId: string,
		checkpointId: string,
	): {
		readonly removedTurnIds: readonly string[];
		readonly hiddenEventRange: { readonly startSeq: number; readonly endSeq: number } | null;
	} {
		const events = readEventsAfter(this.options.database, 0, { limit: 10_000 });
		const checkpoint = events.find((event) => {
			if (event.type !== "checkpoint/created") return false;
			const payload = event.payload as Record<string, unknown>;
			return payload.checkpointId === checkpointId;
		});
		if (!checkpoint) return { removedTurnIds: [], hiddenEventRange: null };
		const scopedEvents = events.filter(
			(event) =>
				event.seq > checkpoint.seq &&
				(this.threadIdForRollbackScopeEvent(event) === threadId || event.streamId === threadId),
		);
		const endSeq = scopedEvents.reduce((max, event) => Math.max(max, event.seq), checkpoint.seq);
		const removedTurnIds = [
			...new Set(
				scopedEvents
					.map((event) => this.turnIdForRollbackScopeEvent(event))
					.filter((turnId): turnId is string => typeof turnId === "string" && turnId.length > 0),
			),
		];
		return {
			removedTurnIds,
			hiddenEventRange: endSeq > checkpoint.seq ? { startSeq: checkpoint.seq + 1, endSeq } : null,
		};
	}

	private threadIdForRollbackScopeEvent(event: {
		readonly streamId: string;
		readonly payload: unknown;
	}): string | undefined {
		const payload =
			event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
		return (
			stringOr(payload.threadId, "") || stringOr(payload.sessionId, "") || event.streamId.replace(/^session:/, "")
		);
	}

	private turnIdForRollbackScopeEvent(event: { readonly payload: unknown }): string | undefined {
		const payload =
			event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
		return stringOr(payload.turnId, "") || stringOr(payload.turn_id, "") || undefined;
	}

	private async saveInlineV1Attachment(attachment: { type: "image"; url: string }): Promise<string> {
		const match = /^data:([^;,]+);base64,(.+)$/s.exec(attachment.url);
		if (!match) throw new Error("Inline image attachments must be data URLs");
		const [, mimeType, dataBase64] = match;
		const saved = await this.attachmentService.save({
			filename: `inline-${crypto.randomUUID()}.${extensionForMime(mimeType)}`,
			mimeType,
			dataBase64,
		});
		return saved.id;
	}

	private async resolveV1WorkspaceTarget(
		threadId: string,
		workspaceTargetId: string,
	): Promise<
		| { ok: true; cwd: string; projectId: string; worktreeId?: string; guardTarget: RootScopedTarget }
		| { ok: false; actualWorkspaceTargetId?: string; message: string }
	> {
		const runsIn = await this.validateStoredTurnTarget(threadId);
		const actualWorkspaceTargetId = workspaceTargetIdForRunsIn(runsIn);
		if (workspaceTargetId !== actualWorkspaceTargetId)
			return {
				ok: false,
				actualWorkspaceTargetId,
				message: `Workspace target mismatch: requested ${workspaceTargetId}, actual ${actualWorkspaceTargetId}`,
			};
		const guardTarget = await resolveRootScopedTarget({
			database: this.options.database,
			target:
				runsIn.isolationMode === "isolated-worktree"
					? { kind: "worktree", projectId: runsIn.projectId, worktreeId: runsIn.worktreeId ?? workspaceTargetId }
					: { kind: "project", projectId: runsIn.projectId },
		});
		return {
			ok: true,
			cwd: runsIn.canonicalPath,
			projectId: runsIn.projectId,
			worktreeId: runsIn.worktreeId,
			guardTarget,
		};
	}

	private recentAppEvents(limit = 1000): AppEvent[] {
		return readEventsAfter(this.options.database, 0, { limit })
			.map((event) => event.payload as unknown as AppEvent)
			.filter((event): event is AppEvent => typeof event === "object" && event !== null && "type" in event);
	}

	private async listModels(): Promise<unknown[]> {
		try {
			const registry = this.modelRegistry;
			const providerStatuses = this.providerAuthService.status().providers;
			const enabledProviders = new Set(
				providerStatuses
					.filter((provider) => provider.enabled || provider.authenticated)
					.map((provider) => provider.provider),
			);
			type ModelLike = {
				id?: string;
				name?: string;
				provider?: string;
				reasoning?: boolean;
				contextWindow?: number;
				maxTokens?: number;
				input?: readonly string[];
			};
			const models: ModelLike[] = registry
				.getAll()
				.filter((model: ModelLike) => model.provider !== undefined && enabledProviders.has(model.provider));
			return models.map((model) => {
				const rawId = model.id ?? model.name ?? "";
				const provider = model.provider ?? "unknown";
				const id = providerQualifiedModelId(provider, rawId);
				const reasoning = model.reasoning === true;
				const reasoningLevels = reasoning ? buildReasoningLevels(rawId) : [];
				return {
					id,
					label: model.name ?? rawId,
					provider,
					available: true,
					contextWindow: model.contextWindow ?? 0,
					maxTokens: model.maxTokens ?? 0,
					reasoning,
					reasoningLevels,
					supportsFastMode: supportsFastModeFor(rawId, provider),
					capabilities: [
						...(reasoning ? ["reasoning"] : []),
						...(model.input ?? []).map((input) => `input:${input}`),
					],
					diagnostics: [],
				};
			});
		} catch (error) {
			return [
				{
					id: "unavailable",
					label: "Model discovery unavailable",
					provider: "unknown",
					available: false,
					diagnostic: error instanceof Error ? error.message : String(error),
				},
			];
		}
	}
	private sessionToHtml(session: { header: { id: string; cwd: string }; entries: readonly unknown[] }): string {
		const body = session.entries
			.map((entry) => `<pre>${this.escapeHtml(JSON.stringify(entry, null, 2))}</pre>`)
			.join("\n");
		return `<!doctype html><html><head><meta charset="utf-8"><title>${this.escapeHtml(session.header.id)}</title></head><body><h1>${this.escapeHtml(session.header.id)}</h1><p>${this.escapeHtml(session.header.cwd)}</p>${body}</body></html>`;
	}

	private escapeHtml(value: string): string {
		return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
	}

	private async sessionStats(
		sessionId?: string,
	): Promise<{ sessionCount: number; archivedCount: number; messageCount: number }> {
		const sessions = sessionId
			? [await this.sessionStore.read({ sessionId })]
			: await Promise.all(
					(await this.sessionStore.list({ includeArchived: true })).map((session) =>
						this.sessionStore.read({ sessionId: session.id }),
					),
				);
		let messageCount = 0;
		for (const session of sessions)
			messageCount += session.entries.filter((entry) => entry.type === "message").length;
		const summaries = await this.sessionStore.list({ includeArchived: true });
		return {
			sessionCount: sessions.length,
			archivedCount: summaries.filter((session) => session.archived).length,
			messageCount,
		};
	}

	private async sessionTree(params: { rootSessionId?: string; includeArchived?: boolean }): Promise<unknown[]> {
		const summaries = await this.sessionStore.list({ includeArchived: params.includeArchived ?? true });
		const byParent = new Map<string, typeof summaries>();
		for (const summary of summaries) {
			const parent = summary.parentSessionPath ?? "";
			byParent.set(parent, [...(byParent.get(parent) ?? []), summary]);
		}
		const build = (parent: string): unknown[] =>
			(byParent.get(parent) ?? []).map((session) => ({
				session: toSessionSummaryDto(session),
				children: build(session.id),
			}));
		if (params.rootSessionId) {
			const root = summaries.find((session) => session.id === params.rootSessionId);
			return root ? [{ session: toSessionSummaryDto(root), children: build(root.id) }] : [];
		}
		return build("");
	}
	private async listActiveSessionIds(worktreeId: string): Promise<string[]> {
		const activeStatuses = new Set(["active", "running", "waiting_for_approval"]);
		const summaries = await this.sessionStore.list({ includeArchived: false });
		return summaries
			.filter((session) => {
				const projected = session as typeof session & {
					readonly runsIn?: { readonly worktreeId?: string };
					readonly status?: string;
				};
				return projected.runsIn?.worktreeId === worktreeId && activeStatuses.has(String(projected.status));
			})
			.map((session) => session.id);
	}

	private listActiveTerminalIds(worktreeId: string): string[] {
		return this.terminalService
			.list({ worktreeId })
			.filter((terminal) => terminal.status === "running")
			.map((terminal) => terminal.terminalId);
	}

	append(event: AppEvent): void {
		this.eventLog.appendAndPublishAppEvent(event);
	}
}

function withOperationId<T extends Record<string, unknown>>(
	result: T,
	operationId?: string,
): T & { operationId?: string } {
	return operationId ? { ...result, operationId } : result;
}
function toSessionSummaryDto(summary: {
	id: string;
	cwd: string;
	name?: string;
	parentSessionPath?: string;
	created: string | Date;
	modified: string | Date;
	messageCount: number;
	firstMessage: string;
	allMessagesText: string;
	archived?: boolean;
}) {
	return {
		...summary,
		created: toIsoString(summary.created),
		modified: toIsoString(summary.modified),
	};
}

function workspaceTargetIdForRunsIn(runsIn: WorkflowRunsInTarget): string {
	return runsIn.isolationMode === "isolated-worktree"
		? (runsIn.worktreeId ?? runsIn.projectId)
		: `base:${runsIn.projectId}`;
}

function worktreeWorkspaceTargetV1(worktree: WorktreeLifecycleMetadata): protocolV1.WorkspaceTarget {
	return {
		id: worktree.id,
		kind: "worktree",
		projectId: worktree.projectId,
		path: worktree.path,
		branch: worktree.branch,
		validationStatus: worktree.status === "active" ? "valid" : "needs-attention",
		dirtyState: worktree.dirty ? "dirty" : "clean",
		activeThreadCount: worktree.activeSessionCount,
		safetySignals: [
			...(worktree.dirty
				? [{ level: "warning" as const, message: "Worktree has uncommitted changes.", code: "worktree-dirty" }]
				: []),
			...(worktree.cleanupRequiresConfirmation
				? [{ level: "warning" as const, message: "Worktree cleanup requires confirmation.", code: "cleanup-risk" }]
				: []),
		],
		updatedAt: worktree.updatedAt,
		worktreeId: worktree.id,
		baseBranch: worktree.baseBranch,
	};
}

function activeThreadCountForTarget(database: AppServerDatabase, projectId: string, worktreeId?: string): number {
	return listProjectSessions(database, projectId).filter((session) => {
		if ((session.status === "archived" || session.status === "deleted") as boolean) return false;
		return worktreeId ? session.worktreeId === worktreeId : !session.worktreeId;
	}).length;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function extensionForMime(mimeType: string): string {
	switch (mimeType) {
		case "image/jpeg":
			return "jpg";
		case "image/gif":
			return "gif";
		case "image/webp":
			return "webp";
		case "image/svg+xml":
			return "svg";
		default:
			return "png";
	}
}

function diffTargetMismatch(
	params: protocolV1.DiffSummaryParams | protocolV1.DiffFileWindowParams,
	actualWorkspaceTargetId: string | undefined,
	message: string,
	code: protocolV1.DiffFailureCode = "target-mismatch",
): protocolV1.DiffFailure {
	return {
		ok: false,
		code,
		workspaceTargetId: params.workspaceTargetId,
		threadId: params.threadId,
		turnId: params.turnId,
		checkpointId: params.checkpointId,
		diffId: "diffId" in params ? params.diffId : undefined,
		message,
		actualWorkspaceTargetId,
	};
}

function terminalFailure(
	params:
		| protocolV1.TerminalOpenParams
		| protocolV1.TerminalInputParams
		| protocolV1.TerminalResizeParams
		| protocolV1.TerminalCloseParams
		| protocolV1.TerminalReplayParams,
	code: protocolV1.TerminalErrorCode,
	message: string,
	guard?: protocolV1.TerminalGuardError,
): protocolV1.TerminalFailure {
	return {
		ok: false,
		code,
		terminalId: "terminalId" in params ? params.terminalId : undefined,
		workspaceTargetId: params.workspaceTargetId,
		threadId: params.threadId,
		turnId: params.turnId,
		message,
		guard,
	};
}

function validateTerminalRecordScope(
	record: {
		readonly terminalId: string;
		readonly sessionId?: string;
		readonly projectId?: string;
		readonly worktreeId?: string;
	},
	params:
		| protocolV1.TerminalInputParams
		| protocolV1.TerminalResizeParams
		| protocolV1.TerminalCloseParams
		| protocolV1.TerminalReplayParams,
): protocolV1.TerminalFailure | undefined {
	if (record.sessionId && record.sessionId !== params.threadId)
		return terminalFailure(params, "wrong-thread", `Terminal ${record.terminalId} belongs to another thread.`);
	const actualWorkspaceTargetId = record.worktreeId ?? (record.projectId ? `base:${record.projectId}` : undefined);
	if (actualWorkspaceTargetId && actualWorkspaceTargetId !== params.workspaceTargetId)
		return terminalFailure(
			params,
			"workspace-target-blocked",
			`Terminal ${record.terminalId} belongs to workspace target ${actualWorkspaceTargetId}.`,
		);
	return undefined;
}

function terminalContext(
	record: {
		readonly terminalId: string;
		readonly cwd: string;
		readonly status: string;
		readonly dimensions: { readonly rows: number; readonly cols: number };
		readonly createdAt: string;
		readonly updatedAt: string;
		readonly exitCode?: number | null;
	},
	workspaceTargetId: string,
	threadId: string,
	turnId?: string,
	title?: string,
): protocolV1.TerminalContext {
	return {
		terminalId: record.terminalId,
		workspaceTargetId,
		threadId,
		turnId,
		title: title ?? "Terminal",
		status: mapTerminalStatus(record.status),
		cwd: record.cwd,
		rows: record.dimensions.rows,
		cols: record.dimensions.cols,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		killedAt: record.status === "killed" ? record.updatedAt : undefined,
		exitCode: record.exitCode,
	};
}

function mapTerminalStatus(status: string): protocolV1.TerminalContextStatus {
	if (status === "killed") return "killed";
	if (status === "exited") return "closed";
	if (status === "error") return "error";
	if (status === "starting") return "opening";
	return "running";
}

function toIsoString(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : value;
}

function providerQualifiedModelId(provider: string, modelId: string): string {
	return modelId.includes("/") ? modelId : `${provider}/${modelId}`;
}

function findSelectableModel(
	models: readonly { id: string; provider?: string; available?: boolean }[],
	modelId: string,
	selectedProvider?: string,
): { id: string; provider?: string; available?: boolean } | undefined {
	const available = models.filter((model) => model.available !== false);
	const exact = available.find((model) => model.id === modelId);
	if (exact) return exact;
	if (modelId.includes("/")) return undefined;
	const providerQualifiedMatches = available.filter((model) => {
		const [provider, id] = model.id.split("/", 2);
		return (
			id === modelId && (!selectedProvider || model.provider === selectedProvider || provider === selectedProvider)
		);
	});
	if (providerQualifiedMatches.length === 1) return providerQualifiedMatches[0];
	const bareMatches = available.filter(
		(model) => model.id === providerQualifiedModelId(model.provider ?? "unknown", modelId),
	);
	return bareMatches.length === 1 ? bareMatches[0] : undefined;
}

function parseJsonObject(value: string | null): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}
