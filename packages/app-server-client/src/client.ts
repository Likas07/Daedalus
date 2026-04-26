import type {
	AccessMode,
	ClientNotification,
	ClientRequest,
	EventReplayParams,
	EventReplayResult,
	ExtensionUiRequest,
	ExtensionUiResponse,
	InitializeParams,
	InitializeResult,
	ClientRequestResultMap as ProtocolClientRequestResultMap,
	ServerNotification,
	ServerRequest,
	ServerResponse,
	SessionStartParams,
} from "@daedalus-pi/app-server-protocol";
import { RuntimeControlClient } from "./runtime-control";
import { SessionClient } from "./sessions";

export interface AppServerTransport {
	send(message: unknown): void | Promise<void>;
	onMessage(listener: (message: unknown) => void): () => void;
	close(): void | Promise<void>;
}

type RequestFor<Method extends ClientRequest["method"]> = Extract<ClientRequest, { method: Method }>;
type ParamsFor<Method extends ClientRequest["method"]> = RequestFor<Method>["params"];
type NotificationFor<Method extends ServerNotification["method"]> = Extract<ServerNotification, { method: Method }>;
type ServerRequestFor<Method extends ServerRequest["method"]> = Extract<ServerRequest, { method: Method }>;

export type RequestResultMap = ProtocolClientRequestResultMap;
export type ComposerFileSearchResult = RequestResultMap["composer/file-search"]["files"][number];
export type ComposerCommandSummary = RequestResultMap["composer/command-list"]["commands"][number];
export type TerminalOutputChunk = RequestResultMap["terminal/replay"]["chunks"][number];
export type TerminalReplayResult = RequestResultMap["terminal/replay"];
export type ProviderAuthStatusResult = RequestResultMap["auth/login"];
export type AuthStatusResult = RequestResultMap["auth/status"];
export type SettingsSnapshotResult = RequestResultMap["settings/read"];
export type ResourceListResult = RequestResultMap["resources/list"];

type RequestResult<Method extends ClientRequest["method"]> = Method extends keyof RequestResultMap
	? RequestResultMap[Method]
	: unknown;

export interface AppServerClientOptions {
	readonly transport: AppServerTransport;
	readonly requestIdPrefix?: string;
}

export class AppServerResponseError extends Error {
	readonly code: string;
	readonly data?: unknown;

	constructor(error: { code: string; message: string; data?: unknown }) {
		super(error.message);
		this.name = "AppServerResponseError";
		this.code = error.code;
		this.data = error.data;
	}
}

export class AppServerClient {
	private transport: AppServerTransport;
	private readonly requestIdPrefix: string;
	private nextRequestId = 1;
	private unsubscribeTransport: (() => void) | undefined;
	private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: unknown): void }>();
	private readonly notificationListeners = new Map<
		string,
		Set<(params: unknown, message: ServerNotification) => void>
	>();
	private readonly serverRequestListeners = new Map<string, Set<(params: unknown, request: ServerRequest) => void>>();
	private lastEventCursor: string | undefined;
	private replaying = false;
	readonly sessions = new SessionClient(this);
	readonly runtime = new RuntimeControlClient(this);

	constructor(options: AppServerClientOptions) {
		this.transport = options.transport;
		this.requestIdPrefix = options.requestIdPrefix ?? "client";
		this.attachTransport(options.transport);
	}

	async request<Method extends ClientRequest["method"]>(
		method: Method,
		params: ParamsFor<Method>,
	): Promise<RequestResult<Method>> {
		const id = `${this.requestIdPrefix}-${this.nextRequestId++}`;
		const message = { kind: "request", id, method, params } as RequestFor<Method>;
		const promise = new Promise<RequestResult<Method>>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
		});
		try {
			await this.transport.send(message);
		} catch (error) {
			this.pending.delete(id);
			throw error;
		}
		return promise;
	}

	notify<Method extends ClientNotification["method"]>(
		method: Method,
		params: Extract<ClientNotification, { method: Method }>["params"],
	): Promise<void> {
		return Promise.resolve(this.transport.send({ kind: "notification", method, params }));
	}

	initialize(params: InitializeParams): Promise<InitializeResult> {
		return this.request("initialize", params);
	}

	startSession(params: SessionStartParams): Promise<unknown> {
		return this.request("session/start", params);
	}

	replayEvents(params: EventReplayParams = {}): Promise<EventReplayResult> {
		return this.request("event/replay", params);
	}

	getDiff(params: ParamsFor<"diff/get">): Promise<RequestResultMap["diff/get"]> {
		return this.request("diff/get", params);
	}

	respondToExtensionUi(response: ExtensionUiResponse): Promise<Record<string, never>> {
		return this.request("extension/ui/respond", response);
	}

	searchComposerFiles(params: ParamsFor<"composer/file-search">): Promise<RequestResultMap["composer/file-search"]> {
		return this.request("composer/file-search", params);
	}

	listComposerCommands(
		params: ParamsFor<"composer/command-list"> = {},
	): Promise<RequestResultMap["composer/command-list"]> {
		return this.request("composer/command-list", params);
	}

	saveComposerAttachment(
		params: ParamsFor<"composer/attachment/save">,
	): Promise<RequestResultMap["composer/attachment/save"]> {
		return this.request("composer/attachment/save", params);
	}

	getComposerAttachment(
		params: ParamsFor<"composer/attachment/get">,
	): Promise<RequestResultMap["composer/attachment/get"]> {
		return this.request("composer/attachment/get", params);
	}

	getAccessPolicy(): Promise<RequestResultMap["access/get"]> {
		return this.request("access/get", {});
	}

	setAccessMode(mode: AccessMode): Promise<RequestResultMap["access/set"]> {
		return this.request("access/set", { mode });
	}

	readSettings(): Promise<SettingsSnapshotResult> {
		return this.request("settings/read", {});
	}

	setSetting(params: ParamsFor<"settings/set">): Promise<SettingsSnapshotResult> {
		return this.request("settings/set", params);
	}

	resetSetting(params: ParamsFor<"settings/reset">): Promise<SettingsSnapshotResult> {
		return this.request("settings/reset", params);
	}

	reloadSettingsResources(): Promise<SettingsSnapshotResult> {
		return this.request("settings/reload-resources", {});
	}

	listResources(): Promise<ResourceListResult> {
		return this.request("resources/list", {});
	}

	reloadResources(): Promise<ResourceListResult> {
		return this.request("resources/reload", {});
	}

	resourceOperation(
		method: "resources/install" | "resources/remove" | "resources/update" | "resources/enable" | "resources/disable",
		params: ParamsFor<typeof method>,
	): Promise<unknown> {
		return this.request(method, params);
	}
	cancelTurn(params: ParamsFor<"turn/cancel">): Promise<Record<string, never>> {
		return this.request("turn/cancel", params);
	}

	stopSession(params: ParamsFor<"session/stop">): Promise<Record<string, never>> {
		return this.request("session/stop", params);
	}

	createTerminal(params: ParamsFor<"terminal/create">): Promise<RequestResultMap["terminal/create"]> {
		return this.request("terminal/create", params);
	}

	listTerminals(params: ParamsFor<"terminal/list">): Promise<RequestResultMap["terminal/list"]> {
		return this.request("terminal/list", params);
	}

	replayTerminal(params: ParamsFor<"terminal/replay">): Promise<TerminalReplayResult> {
		return this.request("terminal/replay", params);
	}

	sendTerminalInput(params: ParamsFor<"terminal/input">): Promise<unknown> {
		return this.request("terminal/input", params);
	}

	resizeTerminal(params: ParamsFor<"terminal/resize">): Promise<RequestResultMap["terminal/resize"]> {
		return this.request("terminal/resize", params);
	}

	killTerminal(params: ParamsFor<"terminal/kill">): Promise<RequestResultMap["terminal/kill"]> {
		return this.request("terminal/kill", params);
	}

	onNotification<Method extends ServerNotification["method"]>(
		method: Method,
		listener: (params: NotificationFor<Method>["params"], message: NotificationFor<Method>) => void,
	): () => void {
		const listeners = this.notificationListeners.get(method) ?? new Set();
		listeners.add(listener as (params: unknown, message: ServerNotification) => void);
		this.notificationListeners.set(method, listeners);
		return () => listeners.delete(listener as (params: unknown, message: ServerNotification) => void);
	}

	onServerRequest<Method extends ServerRequest["method"]>(
		method: Method,
		listener: (params: ServerRequestFor<Method>["params"], request: ServerRequestFor<Method>) => void,
	): () => void {
		const listeners = this.serverRequestListeners.get(method) ?? new Set();
		listeners.add(listener as (params: unknown, request: ServerRequest) => void);
		this.serverRequestListeners.set(method, listeners);
		return () => listeners.delete(listener as (params: unknown, request: ServerRequest) => void);
	}

	onExtensionUiRequest(
		listener: (
			request: ExtensionUiRequest,
			message: Extract<ServerRequest, { method: "extension/ui/request" }>,
		) => void,
	): () => void {
		return this.onServerRequest("extension/ui/request", listener);
	}

	async reconnect(transport: AppServerTransport): Promise<EventReplayResult | undefined> {
		this.unsubscribeTransport?.();
		this.transport = transport;
		this.attachTransport(transport);
		return this.replayMissedEvents();
	}

	async close(): Promise<void> {
		this.unsubscribeTransport?.();
		this.unsubscribeTransport = undefined;
		for (const pending of this.pending.values()) pending.reject(new Error("App server client closed"));
		this.pending.clear();
		await this.transport.close();
	}

	private attachTransport(transport: AppServerTransport): void {
		this.unsubscribeTransport = transport.onMessage((message) => this.handleMessage(message));
	}

	private handleMessage(message: unknown): void {
		if (!isObject(message) || typeof message.kind !== "string") return;
		if (message.kind === "response") {
			this.handleResponse(message as ServerResponse);
			return;
		}
		if (message.kind === "notification") {
			this.handleNotification(message as ServerNotification);
			return;
		}
		if (message.kind === "request") {
			this.handleServerRequest(message as ServerRequest);
		}
	}

	private handleResponse(response: ServerResponse): void {
		const id = String(response.id);
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		if (response.ok) pending.resolve(response.result);
		else pending.reject(new AppServerResponseError(response.error));
	}

	private handleNotification(notification: ServerNotification): void {
		this.recordEventCursor(notification);
		for (const listener of this.notificationListeners.get(notification.method) ?? [])
			listener(notification.params, notification);
	}

	private handleServerRequest(request: ServerRequest): void {
		for (const listener of this.serverRequestListeners.get(request.method) ?? []) listener(request.params, request);
	}

	private recordEventCursor(notification: ServerNotification): void {
		if (notification.method !== "event/appended") return;
		const event = notification.params.event;
		if (isObject(event)) {
			const cursor =
				typeof event.seq === "number" || typeof event.seq === "string"
					? String(event.seq)
					: typeof event.id === "string"
						? event.id
						: undefined;
			this.lastEventCursor = cursor ?? this.lastEventCursor;
		}
	}

	private async replayMissedEvents(): Promise<EventReplayResult | undefined> {
		if (this.replaying || !this.lastEventCursor) return undefined;
		this.replaying = true;
		try {
			const result = await this.replayEvents({ cursor: { after: this.lastEventCursor } });
			for (const event of result.events) {
				this.handleNotification({ kind: "notification", method: "event/appended", params: { event } });
			}
			return result;
		} finally {
			this.replaying = false;
		}
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
