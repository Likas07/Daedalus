import {
	AppServerClient,
	type AppServerTransport,
	type SettingsSnapshotResult,
	createWebSocketTransport,
	subscribeToEvents,
} from "@daedalus-pi/app-server-client";
import {
	type AppEvent,
	appServerProtocolVersion,
	type ExtensionUiRequest,
	type ExtensionUiResponse,
	type WorkflowWorktreeMetadata,
} from "@daedalus-pi/app-server-protocol";
import {
	type ApprovalItem,
	approvalItemFromPayload,
	type DisplayDensity,
	type ProviderStatus,
} from "./view-model";
import { applyTerminalOutput, capTerminalHistory, selectExistingTerminal, upsertTerminal as upsertTerminalList } from "../components/terminal/terminal-state";
import type { ComposerSubmitContext } from "./composer-state";
import type {
	AccessMode,
	ComposerDraftAttachment,
	ComposerFileMention,
	ComposerSlashCommand,
	RendererAccessPolicy,
	RendererAuthStatus,
	RendererDiffSummary,
	RendererModel,
	RendererProject,
	RendererTerminal,
} from "./gui-state-types";
import {
	createReconnectState,
	nextReconnectDelay,
	setConnected,
	setDisconnected,
	setFailed,
	setReplaying,
	shouldAcceptEvent,
	type ConnectionStatus,
	type ReconnectState,
} from "./reconnect-state";

export interface GuiBootstrap {
	readonly wsEndpoint?: string;
	readonly endpoint?: string;
	readonly token?: string;
	readonly projectRoot?: string;
}
export interface DesktopNativeCommand {
	readonly id: "open-project" | "open-recent-project" | "open-file" | "open-folder" | "open-external-editor" | "toggle-terminal" | "export-diagnostics" | "open-deep-link" | "show-notification";
	readonly payload: Record<string, unknown>;
}
export interface DesktopBridge {
	getLocalEnvironmentBootstrap?: () => Promise<GuiBootstrap>;
	server?: { bootstrapEndpoint(): Promise<GuiBootstrap> };
	shell?: {
		openFile(path?: string): Promise<string | undefined>;
		openFolder(path?: string): Promise<string | undefined>;
		openExternalEditor(path?: string): Promise<void>;
	};
	notifications?: { show(kind: "approval" | "run-completed" | "run-failed" | "provider-error", body?: string): Promise<boolean> };
	recentProjects?: {
		list(): Promise<readonly RecentProject[]>;
		add(path: string): Promise<readonly RecentProject[]>;
		clear(): Promise<void>;
	};
	commands?: { onCommand(listener: (command: DesktopNativeCommand) => void): () => void };
	openInEditor?: (path: string) => Promise<void>;
}
export interface GuiRuntimeOptions {
	readonly bootstrap?: GuiBootstrap;
	readonly transport?: AppServerTransport;
	readonly createTransport?: () => AppServerTransport;
	readonly client?: AppServerClient;
	readonly reconnect?: { readonly maxAttempts?: number; readonly baseDelayMs?: number; readonly maxDelayMs?: number };
}
export interface GuiRuntime {
	readonly client: AppServerClient;
	readonly state: GuiState;
	initialize(): Promise<void>;
	subscribe(listener: GuiStateListener): () => void;
	notify(): void;
	openProject(path: string): Promise<ProjectOpenResult>;
	startSessionFromPrompt(input: StartSessionFromPromptInput): Promise<unknown>;
	respondToExtensionUI(response: ExtensionUiResponse): Promise<Record<string, never>>;
	closeExtensionUI?(requestId: string): Promise<void>;
	startTurn(input: StartTurnInput): Promise<unknown>;
	cancelTurn(sessionId: string, turnId: string): Promise<unknown>;
	stopSession(sessionId: string): Promise<unknown>;
	respondToApproval(approvalId: string, decision: "approved" | "denied", message?: string): Promise<unknown>;
	setModel(model: string): Promise<unknown>;
	setEffort(effort: string): Promise<unknown>;
	setAccessMode(mode: AccessMode): Promise<unknown>;
	setMode(mode: string): Promise<unknown>;
	setFastMode(fastMode: boolean): Promise<unknown>;
	searchComposerFiles(input: SearchComposerFilesInput): Promise<readonly ComposerFileMention[]>;
	listComposerCommands(sessionId?: string): Promise<readonly ComposerSlashCommand[]>;
	refreshDiff(diffId?: string): Promise<RendererDiffSummary | undefined>;
	stageFiles?(paths: readonly string[], diffId?: string): Promise<RendererDiffSummary | undefined>;
	unstageFiles?(paths: readonly string[], diffId?: string): Promise<RendererDiffSummary | undefined>;
	discardFiles?(paths: readonly string[], diffId?: string): Promise<RendererDiffSummary | undefined>;
	commitChanges?(message: string, diffId?: string): Promise<RendererDiffSummary | undefined>;
	createWorktree(input: CreateWorktreeInput): Promise<WorkflowWorktreeMetadata>;
	openInEditor(path?: string): Promise<void>;
	saveComposerAttachment(input: SaveComposerAttachmentInput): Promise<ComposerDraftAttachment>;
	createTerminal(input: CreateTerminalInput): Promise<RendererTerminal>;
	sendTerminalInput(terminalId: string, data: string): Promise<unknown>;
	resizeTerminal(terminalId: string, size: { cols: number; rows: number }): Promise<RendererTerminal | undefined>;
	replayTerminal(terminalId: string, afterSeq?: number): Promise<unknown>;
	killTerminal(terminalId: string): Promise<RendererTerminal | undefined>;
	exportDiagnostics(): string;
	exportDiagnosticsBundle?(input?: { kind?: "support-bundle" | "sqlite-session-bundle" | "jsonl-session" | "html-session"; sessionId?: string; includeTranscripts?: boolean; includeToolLogs?: boolean; recentEventLimit?: number }): Promise<import("@daedalus-pi/app-server-protocol").DiagnosticExportResult>;
	close(): Promise<void>;
	selectSession(sessionId?: string): void;
	reconnect(): Promise<void>;
}
export type GuiStateListener = (state: GuiState) => void;
export interface GuiState {
	connected: boolean;
	connectionStatus: ConnectionStatus;
	lastEventCursor?: string;
	reconnectAttempt: number;
	projectRoot?: string;
	selectedSessionId?: string;
	displayDensity: DisplayDensity;
	providerStatuses: ProviderStatus[];
	approvalItems: ApprovalItem[];
	lastProjectId?: string;
	worktrees: WorkflowWorktreeMetadata[];
	sessions: SessionSummary[];
	events: AppEvent[];
	extensionRequests: ExtensionUiRequest[];
	notifications: string[];
	diagnostics: string[];
	integrations: IntegrationViewState[];
	activeTerminalId?: string;
	terminalOutput: string;
	terminalCursor: number;
	projects: RendererProject[];
	terminals: RendererTerminal[];
	models: RendererModel[];
	selectedModel?: string;
	settings?: SettingsSnapshotResult;
	effort?: string;
	mode: string;
	fastMode: boolean;
	accessMode: AccessMode;
	accessPolicy?: RendererAccessPolicy;
	capabilities?: Record<string, boolean>;
	sessionTokensUsed: number;
	authStatuses: RendererAuthStatus[];
	composerAttachments: ComposerDraftAttachment[];
	composerFileMentions: ComposerFileMention[];
	composerSlashCommands: ComposerSlashCommand[];
	activeDiff?: RendererDiffSummary;
	_reconnectState?: ReconnectState;
	recentProjects?: readonly RecentProject[];
}
export interface SessionSummary {
	id: string;
	title: string;
	status: string;
}
export interface ProjectOpenResult {
	projectId: string;
}
export interface RecentProject { path: string; openedAt: string }
export interface StartSessionFromPromptInput extends Partial<ComposerSubmitContext> {
	path: string;
	prompt: string;
	attachmentIds?: readonly string[];
	filePaths?: readonly string[];
}
export interface StartTurnInput extends Partial<ComposerSubmitContext> {
	sessionId: string;
	prompt: string;
	attachmentIds?: readonly string[];
	filePaths?: readonly string[];
}
export interface SearchComposerFilesInput { projectId: string; worktreeId?: string; query: string; limit?: number }
export interface SaveComposerAttachmentInput { sessionId?: string; filename: string; mimeType?: string; dataBase64: string }
export interface CreateTerminalInput { projectId?: string; worktreeId?: string; cwd: string; shell?: string; cols?: number; rows?: number }
export interface CreateWorktreeInput { projectId: string; branch: string; path?: string; baseBranch?: string }
export interface IntegrationViewState {
	provider: string;
	status: string;
	repository?: { owner: string; name: string };
	issues: Array<{ id: string; title?: string; state?: string }>;
	pullRequests: Array<{ number: number; title?: string; state?: string }>;
	ciChecks: Array<{ name: string; status: string; summary?: string }>;
}

declare global {
	interface Window {
		desktopBridge?: DesktopBridge;
		daedalusNative?: DesktopBridge;
	}
}

export async function createGuiRuntime(options: GuiRuntimeOptions = {}): Promise<GuiRuntime> {
	const bootstrap = options.bootstrap ?? (await resolveBootstrap());
	const createTransport = options.createTransport ?? (() => options.transport ?? createWebSocketTransport({ url: buildWsUrl(bootstrap) }));
	const initialTransport = options.transport ?? (options.client ? undefined : createTransport());
	const client =
		options.client ??
		new AppServerClient({
			transport: initialTransport ?? createTransport(),
			requestIdPrefix: "gui",
		});
	const state: GuiState = {
		connected: false,
		connectionStatus: "connecting",
		reconnectAttempt: 0,
		projectRoot: bootstrap.projectRoot,
		displayDensity: "comfortable",
		providerStatuses: [],
		approvalItems: [],
		worktrees: [],
		sessions: [],
		events: [],
		extensionRequests: [],
		notifications: [],
		diagnostics: [],
		integrations: [],
		terminalOutput: "",
		terminalCursor: 0,
		projects: [],
		terminals: [],
		models: [],
		settings: undefined,
		mode: "daedalus",
		fastMode: false,
		accessMode: "supervised",
		capabilities: {},
		authStatuses: [],
		composerAttachments: [],
		composerFileMentions: [],
		composerSlashCommands: [],
		sessionTokensUsed: 0,
		recentProjects: [],
	};
	const reconnectState = createReconnectState(options.reconnect);
	let currentTransport = initialTransport;
	let reconnecting = false;
	const syncConnectionState = (): void => {
		state.connectionStatus = reconnectState.status;
		state.connected = reconnectState.status === "connected";
		state.lastEventCursor = reconnectState.lastEventCursor;
		state.reconnectAttempt = reconnectState.attempt;
	};
	const markDisconnected = (error?: unknown): void => {
		setDisconnected(reconnectState, error);
		syncConnectionState();
		notify();
	};
	const bindTransportLifecycle = (transport?: AppServerTransport): void => {
		if (!transport) return;
		const target = transport as AppServerTransport & { addEventListener?: (type: string, listener: (event?: unknown) => void) => void; on?: (type: string, listener: (event?: unknown) => void) => void };
		target.addEventListener?.("close", () => markDisconnected(new Error("WebSocket closed")));
		target.addEventListener?.("error", (event?: unknown) => markDisconnected(event ?? new Error("WebSocket error")));
		target.on?.("close", () => markDisconnected(new Error("WebSocket closed")));
		target.on?.("error", (event?: unknown) => markDisconnected(event ?? new Error("WebSocket error")));
	};
	const reconnect = async (): Promise<void> => {
		if (reconnecting) return;
		reconnecting = true;
		const maxAttempts = options.reconnect?.maxAttempts ?? 5;
		try {
			for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
				if (attempt > 0) await delay(nextReconnectDelay(reconnectState, options.reconnect));
				try {
					const transport = createTransport();
					currentTransport = transport;
					bindTransportLifecycle(transport);
					setReplaying(reconnectState);
					syncConnectionState();
					notify();
					const replay = await client.reconnect(transport);
					for (const event of replay?.events ?? []) recordEvent(state, event);
					setConnected(reconnectState, options.reconnect);
					syncConnectionState();
					notify();
					return;
				} catch (error) {
					setDisconnected(reconnectState, error);
					syncConnectionState();
					notify();
				}
			}
			setFailed(reconnectState, reconnectState.lastError ?? "Reconnect attempts exhausted");
			syncConnectionState();
			state.diagnostics.push(`reconnect failed after ${maxAttempts} attempts: ${reconnectState.lastError ?? "unknown error"}`);
			notify();
		} finally {
			reconnecting = false;
		}
	};
	bindTransportLifecycle(currentTransport);
	syncConnectionState();
	state._reconnectState = reconnectState;
	const listeners = new Set<GuiStateListener>();
	const notify = (): void => {
		for (const listener of listeners) listener(state);
	};
	return {
		client,
		state,
		async initialize() {
			const initialized = await client.initialize({
				protocolVersion: appServerProtocolVersion,
				client: { name: "daedalus-gui", version: "0.1.0" },
			});
			state.capabilities = initialized.capabilities;
			setConnected(reconnectState, options.reconnect);
			syncConnectionState();
			notify();
			subscribeToEvents(client, (event) => {
				recordEvent(state, event);
				notify();
			});
			client.onExtensionUiRequest((request) => {
				state.extensionRequests.push(request);
				notify();
			});
			client.onNotification("extension/ui/cancelled", (params) => {
				removeExtensionRequest(state, params.requestId);
				notify();
			});
			client.onNotification("approval/requested", (params) => {
				recordApproval(state, params);
				notify();
			});
			client.onNotification("auth/changed", (params) => {
				recordProviderStatus(state, {
					provider: params.provider,
					authenticated: params.authenticated,
					status: params.authenticated ? "ready" : "missing-auth",
				});
				notify();
			});
			client.onNotification("terminal/output", (params) => {
				recordTerminalOutput(state, params);
				notify();
			});
			client.onNotification("terminal/event", (params) => {
				recordTerminalEvent(state, params);
				notify();
			});
			client.onNotification("access/changed", (params) => {
				state.accessMode = params.mode;
				if (state.accessPolicy) state.accessPolicy = { ...state.accessPolicy, mode: params.mode };
				notify();
			});
			await hydrateGuiState(client, state);
			await hydrateDesktopNativeBridge(state, { openProject: (path) => openProjectPath(client, state, path, notify), notify });
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			listener(state);
			return () => listeners.delete(listener);
		},
		notify,
		async openProject(path) {
			return openProjectPath(client, state, path, notify);
		},
		async startSessionFromPrompt(input) {
			const project = input.projectId ? { projectId: input.projectId } : await openProjectPath(client, state, input.path, notify);
			if (input.projectId) {
				state.projectRoot = input.path;
				state.lastProjectId = input.projectId;
			}
			const result = await client.startSession({ projectId: project.projectId, worktreeId: input.worktreeId, prompt: input.prompt, attachmentIds: input.attachmentIds ? [...input.attachmentIds] : undefined, filePaths: input.filePaths ? [...input.filePaths] : undefined, model: input.model ?? state.selectedModel, effort: input.effort ?? state.effort, accessMode: input.accessMode ?? state.accessMode, mode: input.mode ?? state.mode, fastMode: input.fastMode ?? state.fastMode });
			state.sessionTokensUsed = 0;
			const session = result as { sessionId?: unknown; id?: unknown };
			const sessionId =
				typeof session.sessionId === "string"
					? session.sessionId
					: typeof session.id === "string"
						? session.id
						: `pending:${project.projectId}`;
			upsertSession(state, { id: sessionId, title: input.prompt, status: "active" });
			notify();
			return result;
		},
		selectSession(sessionId) {
			selectSession(state, sessionId);
			notify();
		},
		reconnect() {
			return reconnect();
		},
		async startTurn(input) { return client.request("turn/start", { ...input, attachmentIds: input.attachmentIds ? [...input.attachmentIds] : undefined, filePaths: input.filePaths ? [...input.filePaths] : undefined, model: input.model ?? state.selectedModel, effort: input.effort ?? state.effort, accessMode: input.accessMode ?? state.accessMode, mode: input.mode ?? state.mode, fastMode: input.fastMode ?? state.fastMode }); },
		cancelTurn: (sessionId, turnId) => client.cancelTurn({ sessionId, turnId }),
		stopSession: (sessionId) => client.stopSession({ sessionId }),
		respondToApproval: (approvalId, decision, message) => client.request("approval/respond", { approvalId, decision, message }),
		async respondToExtensionUI(response) { const result = await client.respondToExtensionUi(response); removeExtensionRequest(state, response.requestId); notify(); return result; },
		async closeExtensionUI(requestId) { await client.notify("extension/ui/closed", { requestId }); removeExtensionRequest(state, requestId); notify(); },
		async setModel(model) { state.selectedModel = model; notify(); return client.request("model/select", { model }); },
		async setEffort(effort) { state.effort = effort; notify(); return client.request("config/set", { key: "composer.effort", value: effort }); },
		async setAccessMode(mode) { const result = await client.setAccessMode(mode); state.accessMode = result.policy.mode; state.accessPolicy = result.policy; notify(); return result; },
		async setMode(mode) { state.mode = mode; notify(); return client.request("config/set", { key: "composer.mode", value: mode }); },
		async setFastMode(fastMode) { state.fastMode = fastMode; notify(); return client.request("config/set", { key: "composer.fastMode", value: fastMode }); },
		async searchComposerFiles(input) { const result = await client.searchComposerFiles(input); state.composerFileMentions = [...result.files]; notify(); return result.files; },
		async listComposerCommands(sessionId) { const result = await client.listComposerCommands({ sessionId }); state.composerSlashCommands = [...result.commands]; notify(); return result.commands; },
		async refreshDiff(diffId = state.lastProjectId ?? state.projectRoot) {
			if (!diffId) return undefined;
			const result = (await client.request("diff/get", { diffId })) as { diff?: RendererDiffSummary };
			state.activeDiff = result.diff;
			notify();
			return state.activeDiff;
		},
		async stageFiles(paths, diffId = state.lastProjectId ?? state.projectRoot) {
			if (!diffId) return undefined;
			const result = (await client.request("git/stage", { diffId, paths: [...paths] })) as { diff?: RendererDiffSummary };
			state.activeDiff = result.diff; notify(); return state.activeDiff;
		},
		async unstageFiles(paths, diffId = state.lastProjectId ?? state.projectRoot) {
			if (!diffId) return undefined;
			const result = (await client.request("git/unstage", { diffId, paths: [...paths] })) as { diff?: RendererDiffSummary };
			state.activeDiff = result.diff; notify(); return state.activeDiff;
		},
		async discardFiles(paths, diffId = state.lastProjectId ?? state.projectRoot) {
			if (!diffId) return undefined;
			const result = (await client.request("git/discard", { diffId, paths: [...paths] })) as { diff?: RendererDiffSummary };
			state.activeDiff = result.diff; notify(); return state.activeDiff;
		},
		async commitChanges(message, diffId = state.lastProjectId ?? state.projectRoot) {
			if (!diffId) return undefined;
			const result = (await client.request("git/commit", { diffId, message })) as { diff?: RendererDiffSummary };
			state.activeDiff = result.diff; notify(); return state.activeDiff;
		},
		async createWorktree(input) {
			const result = (await client.request("worktree/create", input)) as { worktree: WorkflowWorktreeMetadata };
			state.worktrees = [...state.worktrees.filter((worktree) => worktree.id !== result.worktree.id), result.worktree];
			state.projectRoot = result.worktree.path;
			notify();
			return result.worktree;
		},
		async openInEditor(path = state.projectRoot) {
			if (!path) throw new Error("Choose a project before opening an editor.");
			const bridge = (typeof window === "undefined" ? undefined : window.desktopBridge ?? window.daedalusNative);
			const openExternalEditor = bridge?.shell?.openExternalEditor ?? bridge?.openInEditor;
			if (!openExternalEditor) throw new Error("Open in editor is available only in the desktop app.");
			await openExternalEditor(path);
		},
		async saveComposerAttachment(input) { const result = await client.saveComposerAttachment(input); const attachment = result.attachment; state.composerAttachments = [...state.composerAttachments.filter((item) => item.id !== attachment.id), attachment]; notify(); return attachment; },
		async createTerminal(input) { const result = await client.createTerminal(input); const terminal = terminalFromSnapshot(result.terminal); upsertTerminal(state, terminal); state.activeTerminalId = terminal.id; notify(); return terminal; },
		sendTerminalInput: (terminalId, data) => client.sendTerminalInput({ terminalId, data }),
		async resizeTerminal(terminalId, size) { const result = await client.resizeTerminal({ terminalId, ...size }); const terminal = terminalFromSnapshot(result.terminal); upsertTerminal(state, terminal); notify(); return terminal; },
		async replayTerminal(terminalId, afterSeq) { const result = await client.replayTerminal({ terminalId, afterSeq }); for (const chunk of result.chunks) recordTerminalOutput(state, { terminalId, ...chunk }); notify(); return result; },
		async killTerminal(terminalId) { const result = await client.killTerminal({ terminalId }); const terminal = terminalFromSnapshot(result.terminal); upsertTerminal(state, terminal); notify(); return terminal; },
		exportDiagnostics: () => JSON.stringify({ diagnostics: state.diagnostics, events: state.events, connection: { status: state.connectionStatus, lastEventCursor: state.lastEventCursor, reconnectAttempt: state.reconnectAttempt } }, null, 2),
		exportDiagnosticsBundle: (input = {}) => client.request("diagnostics/export", { kind: input.kind ?? "support-bundle", sessionId: input.sessionId ?? state.selectedSessionId, includeTranscripts: input.includeTranscripts, includeToolLogs: input.includeToolLogs, recentEventLimit: input.recentEventLimit ?? 50 }),
		close: () => client.close(),
	};
}

async function openProjectPath(
	client: AppServerClient,
	state: GuiState,
	path: string,
	notify: () => void,
): Promise<ProjectOpenResult> {
	const result = await client.request("project/open", { path });
	const project = result as Partial<ProjectOpenResult>;
	if (typeof project.projectId !== "string") throw new Error("App server did not return a projectId");
	state.projectRoot = path;
	state.lastProjectId = project.projectId;
	const bridge = typeof window === "undefined" ? undefined : window.desktopBridge ?? window.daedalusNative;
	if (bridge?.recentProjects) state.recentProjects = await bridge.recentProjects.add(path);
	notify();
	return { projectId: project.projectId };
}

export async function resolveBootstrap(): Promise<GuiBootstrap> {
	const browserWindow = typeof window === "undefined" ? undefined : window;
	const bridge = browserWindow?.desktopBridge ?? browserWindow?.daedalusNative;
	if (bridge?.getLocalEnvironmentBootstrap) return bridge.getLocalEnvironmentBootstrap();
	if (bridge?.server?.bootstrapEndpoint) return bridge.server.bootstrapEndpoint();
	const params = new URLSearchParams(globalThis.location?.search ?? "");
	const env = getViteBootstrapEnv();
	return {
		wsEndpoint: params.get("ws") ?? params.get("wsEndpoint") ?? env.wsEndpoint,
		endpoint: params.get("endpoint") ?? env.endpoint,
		token: params.get("token") ?? env.token,
		projectRoot: params.get("projectRoot") ?? env.projectRoot,
	};
}

export function buildWsUrl(bootstrap: GuiBootstrap): string {
	const raw =
		bootstrap.wsEndpoint ??
		(bootstrap.endpoint ? new URL("/ws", bootstrap.endpoint).toString().replace(/^http/, "ws") : undefined);
	if (!raw) throw new Error("Missing app server WebSocket endpoint");
	const url = new URL(raw);
	if (bootstrap.token && !url.searchParams.has("token")) url.searchParams.set("token", bootstrap.token);
	return url.toString();
}

export function getViteBootstrapEnv(env: Partial<ImportMetaEnv> = import.meta.env ?? {}): GuiBootstrap {
	return {
		wsEndpoint: env.VITE_DAEDALUS_APP_SERVER_WS,
		endpoint: env.VITE_DAEDALUS_APP_SERVER_ENDPOINT,
		token: env.VITE_DAEDALUS_APP_SERVER_TOKEN,
		projectRoot: env.VITE_DAEDALUS_PROJECT_ROOT,
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordEvent(state: GuiState, value: unknown): void {
	const event = value as AppEvent;
	if (state._reconnectState && !shouldAcceptEvent(state._reconnectState, event)) return;
	state.lastEventCursor = state._reconnectState?.lastEventCursor ?? state.lastEventCursor;
	const existingIndex = state.events.findIndex((item) => item.id === event.id);
	if (existingIndex >= 0) state.events[existingIndex] = event;
	else state.events.push(event);
	if (event.sessionId) upsertSessionFromEvent(state, event);
	if (event.type.includes("notification")) state.notifications.push(JSON.stringify(event.payload));
	if (event.type.includes("diagnostic")) state.diagnostics.push(JSON.stringify(event.payload));
	if (event.type === "integration/state") recordIntegrationState(state, event.payload);
	if (event.type === "approval/requested") recordApproval(state, event.payload, event.sessionId);
	if (event.type === "agent/message_end" || event.type === "agent/turn_end") recordUsageFromEvent(state, event);
}

function recordUsageFromEvent(state: GuiState, event: AppEvent): void {
	if (event.sessionId && state.selectedSessionId && event.sessionId !== state.selectedSessionId) return;
	const payload = event.payload as { message?: { role?: string; usage?: { input?: number; output?: number; totalTokens?: number } } } | undefined;
	const message = payload?.message;
	if (!message || message.role !== "assistant" || !message.usage) return;
	const total = typeof message.usage.totalTokens === "number" ? message.usage.totalTokens : (message.usage.input ?? 0) + (message.usage.output ?? 0);
	if (total > state.sessionTokensUsed) state.sessionTokensUsed = total;
}

function upsertSession(state: GuiState, session: SessionSummary): void {
	const index = state.sessions.findIndex((item) => item.id === session.id);
	if (index >= 0) state.sessions[index] = session;
	else state.sessions.unshift(session);
}

function upsertSessionFromEvent(state: GuiState, event: AppEvent): void {
	if (!event.sessionId) return;
	const payload =
		event.payload && typeof event.payload === "object"
			? (event.payload as { title?: unknown; status?: unknown })
			: {};
	upsertSession(state, {
		id: event.sessionId,
		title: typeof payload.title === "string" ? payload.title : event.sessionId,
		status:
			typeof payload.status === "string" ? payload.status : event.type === "session/changed" ? "active" : "active",
	});
}

function selectSession(state: GuiState, sessionId?: string): void {
	state.selectedSessionId = sessionId;
	state.sessionTokensUsed = computeSessionTokensUsed(state, sessionId);
}

function computeSessionTokensUsed(state: GuiState, sessionId?: string): number {
	let max = 0;
	for (const event of state.events) {
		if (event.type !== "agent/message_end" && event.type !== "agent/turn_end") continue;
		if (sessionId && event.sessionId && event.sessionId !== sessionId) continue;
		const payload = event.payload as { message?: { role?: string; usage?: { input?: number; output?: number; totalTokens?: number } } } | undefined;
		const message = payload?.message;
		if (!message || message.role !== "assistant" || !message.usage) continue;
		const total = typeof message.usage.totalTokens === "number" ? message.usage.totalTokens : (message.usage.input ?? 0) + (message.usage.output ?? 0);
		if (total > max) max = total;
	}
	return max;
}

function removeExtensionRequest(state: GuiState, requestId: string): void {
	state.extensionRequests = state.extensionRequests.filter((request) => request.requestId !== requestId);
}
function recordApproval(state: GuiState, payload: unknown, fallbackSessionId?: string): void {
	const approval = approvalItemFromPayload(payload, fallbackSessionId);
	if (!approval) return;
	const index = state.approvalItems.findIndex((item) => item.id === approval.id);
	if (index >= 0) state.approvalItems[index] = approval;
	else state.approvalItems.unshift(approval);
	if (approval.sessionId)
		upsertSession(state, { id: approval.sessionId, title: approval.sessionId, status: "waiting_for_approval" });
}

function recordProviderStatus(state: GuiState, providerStatus: ProviderStatus): void {
	const index = state.providerStatuses.findIndex((item) => item.provider === providerStatus.provider);
	if (index >= 0) state.providerStatuses[index] = providerStatus;
	else state.providerStatuses.push(providerStatus);
}

function recordIntegrationState(state: GuiState, payload: unknown): void {
	if (!payload || typeof payload !== "object") return;
	const integration = payload as IntegrationViewState;
	const index = state.integrations.findIndex((item) => item.provider === integration.provider);
	if (index >= 0) state.integrations[index] = integration;
	else state.integrations.push(integration);
}

async function hydrateGuiState(client: AppServerClient, state: GuiState): Promise<void> {
	await safeHydrateStep(state, "projects", async () => {
		const result = (await client.request("project/list", {})) as { projects?: Array<{ id?: string; projectId?: string; path?: string; name?: string }> };
		state.projects = (result.projects ?? []).flatMap((project) => {
			const id = typeof project.id === "string" ? project.id : typeof project.projectId === "string" ? project.projectId : undefined;
			return id && typeof project.path === "string" ? [{ id, path: project.path, name: project.name }] : [];
		});
	});
	await safeHydrateStep(state, "sessions", async () => {
		const result = (await client.request("session/list", {})) as { sessions?: Array<{ id?: string; sessionId?: string; title?: string; status?: string }> };
		for (const session of result.sessions ?? []) {
			const id = typeof session.id === "string" ? session.id : typeof session.sessionId === "string" ? session.sessionId : undefined;
			if (id) upsertSession(state, { id, title: session.title ?? id, status: session.status ?? "active" });
		}
	});
	await safeHydrateStep(state, "worktrees", async () => {
		if (!state.lastProjectId) return;
		const result = (await client.request("worktree/list", { projectId: state.lastProjectId })) as { worktrees?: WorkflowWorktreeMetadata[] };
		state.worktrees = [...(result.worktrees ?? [])];
	});
	await safeHydrateStep(state, "diff", async () => {
		const diffId = state.lastProjectId ?? state.projectRoot;
		if (!diffId) return;
		const result = (await client.request("diff/get", { diffId })) as { diff?: RendererDiffSummary };
		state.activeDiff = result.diff;
	});
	await safeHydrateStep(state, "terminals", async () => {
		const result = await client.listTerminals({ projectId: state.lastProjectId });
		state.terminals = result.terminals.map(terminalFromSnapshot);
		state.activeTerminalId = selectExistingTerminal(state.terminals, state.activeTerminalId);
	});
	await safeHydrateStep(state, "models", async () => {
		const result = (await client.request("model/list", {})) as { models?: RendererModel[]; selectedModel?: string };
		state.models = [...(result.models ?? [])];
		state.selectedModel = result.selectedModel ?? state.selectedModel;
		if (!state.models.some((model) => model.id === state.selectedModel)) {
			state.selectedModel = state.models[0]?.id;
		}
	});
	await safeHydrateStep(state, "settings", async () => {
		const result = await client.readSettings();
		state.settings = result;
		state.models = (result.models as RendererModel[]) ?? state.models;
		state.selectedModel = result.selectedModel ?? state.selectedModel;
	});
	await safeHydrateStep(state, "auth", async () => {
		const result = (await client.request("auth/status", {})) as { providers?: RendererAuthStatus[]; statuses?: RendererAuthStatus[] };
		state.authStatuses = [...(result.providers ?? result.statuses ?? [])];
		for (const status of state.authStatuses) recordProviderStatus(state, status);
	});
	await safeHydrateStep(state, "config", async () => {
		const result = (await client.request("config/get", {})) as { config?: Record<string, unknown>; values?: Record<string, unknown> };
		const config = result.config ?? result.values ?? {};
		if (typeof config["composer.effort"] === "string") state.effort = config["composer.effort"];
		if (typeof config["model.selected"] === "string") state.selectedModel = config["model.selected"];
		if (typeof config["composer.mode"] === "string") state.mode = config["composer.mode"];
		if (typeof config["composer.fastMode"] === "boolean") state.fastMode = config["composer.fastMode"];
	});
	await safeHydrateStep(state, "access", async () => {
		const result = await client.getAccessPolicy();
		state.accessPolicy = result.policy;
		state.accessMode = result.policy.mode;
	});
	await safeHydrateStep(state, "events", async () => {
		const result = await client.replayEvents({});
		for (const event of result.events ?? []) recordEvent(state, event);
	});
}

async function hydrateDesktopNativeBridge(
	state: GuiState,
	handlers: { openProject(path: string): Promise<ProjectOpenResult>; notify(): void },
): Promise<void> {
	const bridge = typeof window === "undefined" ? undefined : window.desktopBridge ?? window.daedalusNative;
	if (!bridge) return;
	if (bridge.recentProjects) state.recentProjects = await bridge.recentProjects.list();
	bridge.commands?.onCommand(async (command) => {
		try {
			const path = typeof command.payload.path === "string" ? command.payload.path : undefined;
			switch (command.id) {
				case "open-project":
				case "open-recent-project":
					if (path) await handlers.openProject(path);
					break;
				case "open-file":
					await bridge.shell?.openFile(path);
					break;
				case "open-folder":
					await bridge.shell?.openFolder(path);
					break;
				case "open-external-editor":
					await bridge.shell?.openExternalEditor(path ?? state.projectRoot);
					break;
				case "toggle-terminal":
					globalThis.dispatchEvent?.(new CustomEvent("daedalus:native-command", { detail: command }));
					break;
				case "export-diagnostics":
					globalThis.dispatchEvent?.(new CustomEvent("daedalus:native-command", { detail: command }));
					break;
				case "show-notification":
					await bridge.notifications?.show(command.payload.kind as never, typeof command.payload.body === "string" ? command.payload.body : undefined);
					break;
				case "open-deep-link":
					state.diagnostics.push(`deep link: ${String(command.payload.url ?? "")}`);
					break;
			}
		} catch (error) {
			state.diagnostics.push(`native command ${command.id}: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			handlers.notify();
		}
	});
}
async function safeHydrateStep(state: GuiState, label: string, step: () => Promise<void>): Promise<void> {
	try {
		await step();
	} catch (error) {
		state.diagnostics.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function terminalFromSnapshot(snapshot: { terminalId: string; cwd: string; cols: number; rows: number; status: RendererTerminal["status"]; history: string; updatedAt?: string }): RendererTerminal {
	return { id: snapshot.terminalId, terminalId: snapshot.terminalId, cwd: snapshot.cwd, cols: snapshot.cols, rows: snapshot.rows, status: snapshot.status, history: capTerminalHistory(snapshot.history), updatedAt: snapshot.updatedAt };
}

function upsertTerminal(state: GuiState, terminal: RendererTerminal): void {
	state.terminals = upsertTerminalList(state.terminals, terminal);
	state.activeTerminalId = selectExistingTerminal(state.terminals, state.activeTerminalId);
}

function recordTerminalOutput(state: GuiState, params: { terminalId: string; seq: number; data: string }): void {
	applyTerminalOutput(state, params);
}

function recordTerminalEvent(state: GuiState, params: { terminalId: string; event: unknown }): void {
	const event = params.event as { kind?: string; data?: string; status?: RendererTerminal["status"] };
	if (typeof event.data === "string") recordTerminalOutput(state, { terminalId: params.terminalId, seq: state.terminalCursor + 1, data: event.data });
	const terminal = state.terminals.find((item) => item.id === params.terminalId);
	if (terminal && event.status) terminal.status = event.status;
}
