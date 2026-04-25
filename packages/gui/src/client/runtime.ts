import {
	AppServerClient,
	type AppServerTransport,
	createWebSocketTransport,
	subscribeToEvents,
} from "@daedalus-pi/app-server-client";
import {
	type AppEvent,
	appServerProtocolVersion,
	type ExtensionUiRequest,
	type ExtensionUiResponse,
} from "@daedalus-pi/app-server-protocol";
import {
	type ApprovalItem,
	approvalItemFromPayload,
	type DisplayDensity,
	type ProviderStatus,
	type WorktreeSummary,
} from "./view-model";

export interface GuiBootstrap {
	readonly wsEndpoint?: string;
	readonly endpoint?: string;
	readonly token?: string;
	readonly projectRoot?: string;
}
export interface DesktopBridge {
	getLocalEnvironmentBootstrap?: () => Promise<GuiBootstrap>;
	server?: { bootstrapEndpoint(): Promise<GuiBootstrap> };
}
export interface GuiRuntimeOptions {
	readonly bootstrap?: GuiBootstrap;
	readonly transport?: AppServerTransport;
	readonly client?: AppServerClient;
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
	respondToApproval(approvalId: string, decision: "approved" | "denied"): Promise<unknown>;
	close(): Promise<void>;
	selectSession(sessionId?: string): void;
}
export type GuiStateListener = (state: GuiState) => void;
export interface GuiState {
	connected: boolean;
	projectRoot?: string;
	selectedSessionId?: string;
	displayDensity: DisplayDensity;
	providerStatuses: ProviderStatus[];
	approvalItems: ApprovalItem[];
	lastProjectId?: string;
	worktrees: WorktreeSummary[];
	sessions: SessionSummary[];
	events: AppEvent[];
	extensionRequests: ExtensionUiRequest[];
	notifications: string[];
	diagnostics: string[];
	integrations: IntegrationViewState[];
	activeTerminalId?: string;
	terminalOutput: string;
	terminalCursor: number;
}
export interface SessionSummary {
	id: string;
	title: string;
	status: string;
}
export interface ProjectOpenResult {
	projectId: string;
}
export interface StartSessionFromPromptInput {
	path: string;
	prompt: string;
}
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
	const client =
		options.client ??
		new AppServerClient({
			transport: options.transport ?? createWebSocketTransport({ url: buildWsUrl(bootstrap) }),
			requestIdPrefix: "gui",
		});
	const state: GuiState = {
		connected: false,
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
	};
	const listeners = new Set<GuiStateListener>();
	const notify = (): void => {
		for (const listener of listeners) listener(state);
	};
	return {
		client,
		state,
		async initialize() {
			await client.initialize({
				protocolVersion: appServerProtocolVersion,
				client: { name: "daedalus-gui", version: "0.1.0" },
			});
			state.connected = true;
			notify();
			subscribeToEvents(client, (event) => {
				recordEvent(state, event);
				notify();
			});
			client.onExtensionUiRequest((request) => {
				state.extensionRequests.push(request);
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
				state.activeTerminalId = params.terminalId;
				if (params.seq > state.terminalCursor) {
					state.terminalOutput += params.data;
					state.terminalCursor = params.seq;
				}
				notify();
			});
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
			const project = await openProjectPath(client, state, input.path, notify);
			const result = await client.startSession({ projectId: project.projectId, prompt: input.prompt });
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
		respondToApproval: (approvalId, decision) => client.request("approval/respond", { approvalId, decision }),
		respondToExtensionUI: (response) => client.respondToExtensionUi(response),
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

function recordEvent(state: GuiState, value: unknown): void {
	const event = value as AppEvent;
	state.events.push(event);
	if (event.sessionId) upsertSessionFromEvent(state, event);
	if (event.type.includes("notification")) state.notifications.push(JSON.stringify(event.payload));
	if (event.type.includes("diagnostic")) state.diagnostics.push(JSON.stringify(event.payload));
	if (event.type === "integration/state") recordIntegrationState(state, event.payload);
	if (event.type === "approval/requested") recordApproval(state, event.payload, event.sessionId);
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
